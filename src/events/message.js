/**
 * Message Event Handlers Module
 * 
 * This module provides handlers for different types of Telegram messages.
 * It includes functionality to detect and respond to messages from different
 * chat types (private, group, supergroup, channel) and pattern matching for text messages.
 * 
 * Potential Improvements:
 * - Add more message type handlers (photos, documents, etc.)
 * - Implement rate limiting for message handlers
 * - Add user tracking/analytics
 * - Implement conversation flows
 * - Add priority mechanism for overlapping patterns
 */

import * as logger from '../utils/logger.js';
import { processSupportConversation } from '../commands/index.js';
import * as unthreadService from '../services/unthread.js';

// Store for pattern-based message handlers
const patternHandlers = [];

/**
 * Registers a text message handler with pattern matching
 * 
 * @param {RegExp} pattern - Regular expression pattern to match against message text
 * @param {Function} handler - Handler function to execute when pattern matches
 * @returns {Function} - Function to remove this pattern handler
 */
export function registerTextPattern(pattern, handler) {
    const handlerEntry = { pattern, handler };
    patternHandlers.push(handlerEntry);
    
    // Return a function to deregister this handler if needed
    return () => {
        const index = patternHandlers.indexOf(handlerEntry);
        if (index !== -1) {
            patternHandlers.splice(index, 1);
        }
    };
}

/**
 * Checks if a message is from a group chat (not a channel)
 * 
 * @param {object} ctx - The Telegraf context object
 * @returns {boolean} True if the message is from a group chat, false otherwise
 */
export function isGroupChat(ctx) {
    return ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
}

/**
 * Checks if a message is from a private chat
 * 
 * @param {object} ctx - The Telegraf context object
 * @returns {boolean} True if the message is from a private chat, false otherwise
 */
export function isPrivateChat(ctx) {
    return ctx.chat && ctx.chat.type === 'private';
}

/**
 * Processes text messages against registered pattern handlers
 * 
 * @param {object} ctx - The Telegraf context object
 * @returns {boolean} True if any pattern matched and was handled
 */
export function processPatterns(ctx) {
    if (!ctx.message || !ctx.message.text) {
        return false;
    }
    
    let handled = false;
    
    // Try all registered patterns
    for (const { pattern, handler } of patternHandlers) {
        if (ctx.message.text.match(pattern)) {
            try {
                handler(ctx);
                handled = true;
                // Note: We don't return immediately to allow multiple handlers
                // to process the same message if multiple patterns match
            } catch (error) {
                logger.error(`Error in pattern handler: ${error.message}`);
            }
        }
    }
    
    return handled;
}

/**
 * Handles all incoming messages
 * 
 * This function routes messages to appropriate handlers based on chat type
 * and processes text messages against registered patterns
 * 
 * @param {object} ctx - The Telegraf context object
 * @param {Function} next - The next middleware function
 */
export async function handleMessage(ctx, next) {
    try {
        // Skip if there's no message or chat
        if (!ctx.message || !ctx.chat) {
            return await next();
        }

        // Log basic information about the message
        logger.debug('Processing message', {
            chatType: ctx.chat.type,
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            hasText: !!ctx.message.text,
            hasReply: !!ctx.message.reply_to_message
        });
        
        // Check if this is part of a support conversation
        const isSupportMessage = await processSupportConversation(ctx);
        if (isSupportMessage) {
            // Skip other handlers if this was a support conversation message
            return await next();
        }
        
        // Check if this is a reply to a ticket confirmation
        if (ctx.message.reply_to_message && ctx.message.text) {
            const handled = await handleTicketReply(ctx);
            if (handled) {
                // Skip other handlers if this was a ticket reply
                return await next();
            }
        }

        // Process against pattern handlers
        const patternHandled = processPatterns(ctx);
        
        // Handle different chat types if not already handled by a pattern
        if (!patternHandled) {
            if (isPrivateChat(ctx)) {
                await handlePrivateMessage(ctx);
            } else if (isGroupChat(ctx)) {
                await handleGroupMessage(ctx);
            }
            // You can add other chat type handlers here (channel)
        }

        // Continue processing with other handlers
        return await next();
    } catch (error) {
        logger.error(`Error handling message: ${error.message}`);
        return await next();
    }
}

/**
 * Handles replies to ticket confirmation messages
 * 
 * @param {object} ctx - The Telegraf context object
 * @returns {boolean} - True if the message was processed as a ticket reply
 */
async function handleTicketReply(ctx) {
    try {
        // Get the ID of the message being replied to
        const replyToMessageId = ctx.message.reply_to_message.message_id;
        
        // Check if this is a reply to a ticket confirmation
        const ticketInfo = unthreadService.getTicketFromReply(replyToMessageId);
        if (!ticketInfo) {
            return false;
        }
        
        // This is a reply to a ticket confirmation, send it to Unthread
        const userId = ctx.from.id;
        const username = ctx.from.username;
        const message = ctx.message.text;
        
        // Send a waiting message
        const waitingMsg = await ctx.reply("Adding your message to the ticket...", {
            reply_to_message_id: ctx.message.message_id
        });
        
        try {
            // Send the message to the ticket
            await unthreadService.sendMessage({
                conversationId: ticketInfo.ticketId,
                message,
                username,
                userId
            });
            
            // Update the waiting message with success
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `✅ Your message has been added to Ticket #${ticketInfo.friendlyId}`
            );
            
            logger.success('Added message to ticket', {
                ticketNumber: ticketInfo.friendlyId,
                ticketId: ticketInfo.ticketId,
                userId,
                username,
                messageLength: message?.length,
                chatId: ctx.chat.id
            });
            return true;
            
        } catch (error) {
            // Handle API errors
            logger.error('Error adding message to ticket', {
                error: error.message,
                stack: error.stack,
                ticketNumber: ticketInfo.friendlyId,
                ticketId: ticketInfo.ticketId,
                userId,
                username,
                messageLength: message?.length,
                chatId: ctx.chat.id
            });
            
            // Update the waiting message with error
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `⚠️ Error adding message to ticket: ${error.message}`
            );
            
            return true;
        }
        
    } catch (error) {
        logger.error('Error in handleTicketReply', {
            error: error.message,
            stack: error.stack,
            replyToMessageId: ctx.message?.reply_to_message?.message_id,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            hasTicketInfo: !!unthreadService.getTicketFromReply(ctx.message?.reply_to_message?.message_id)
        });
        return false;
    }
}

/**
 * Handles messages from private chats (direct messages to the bot)
 * 
 * @param {object} ctx - The Telegraf context object
 */
export async function handlePrivateMessage(ctx) {
    try {
        // Log information about the private message
        logger.info('Processing private message', {
            userId: ctx.from?.id,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            lastName: ctx.from?.last_name,
            messageId: ctx.message?.message_id
        });
        
        // Inform the user that the bot doesn't support private conversations
        await ctx.reply("Sorry, this bot does not have feature to assist you via Telegram DM");
        
    } catch (error) {
        logger.error('Error in handlePrivateMessage', {
            error: error.message,
            stack: error.stack,
            userId: ctx.from?.id,
            username: ctx.from?.username
        });
    }
}

/**
 * Handles messages from group chats
 * 
 * @param {object} ctx - The Telegraf context object
 */
export async function handleGroupMessage(ctx) {
    try {
        // Log more detailed information about the group message
        logger.info(`Processing message from group: ${ctx.chat.title} (ID: ${ctx.chat.id})`);
        
        // Additional information about the sender if available
        if (ctx.from) {
            logger.info(`Message sent by: ${ctx.from.first_name} ${ctx.from.last_name || ''} (ID: ${ctx.from.id})`);
        }
        
        // Reply directly to the original message using reply_to_message_id
        await ctx.reply("This is working", {
            reply_to_message_id: ctx.message.message_id
        });
        
    } catch (error) {
        logger.error(`Error in handleGroupMessage: ${error.message}`);
    }
}