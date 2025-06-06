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

import { LogEngine } from '@wgtechlabs/log-engine';
import { processSupportConversation } from '../commands/index.js';
import * as unthreadService from '../services/unthread.js';

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
        LogEngine.debug('Processing message', {
            chatType: ctx.chat.type,
            chatId: ctx.chat.id,
            userId: ctx.from?.id
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

        // Handle different chat types
        if (isPrivateChat(ctx)) {
            await handlePrivateMessage(ctx);
        } else if (isGroupChat(ctx)) {
            await handleGroupMessage(ctx);
        }

        // Continue processing with other handlers
        return await next();
    } catch (error) {
        LogEngine.error(`Error handling message: ${error.message}`);
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
        
        LogEngine.info('Processing potential ticket reply', {
            replyToMessageId,
            messageText: ctx.message.text?.substring(0, 100),
            chatId: ctx.chat.id,
            userId: ctx.from.id
        });
        
        // Check if this is a reply to a ticket confirmation
        const ticketInfo = await unthreadService.getTicketFromReply(replyToMessageId);
        if (ticketInfo) {
            LogEngine.info('Found ticket for reply', {
                ticketId: ticketInfo.ticketId,
                friendlyId: ticketInfo.friendlyId,
                replyToMessageId
            });
            return await handleTicketConfirmationReply(ctx, ticketInfo);
        }
        
        // Check if this is a reply to an agent message
        const agentMessageInfo = await unthreadService.getAgentMessageFromReply(replyToMessageId);
        if (agentMessageInfo) {
            LogEngine.info('Found agent message for reply', {
                conversationId: agentMessageInfo.conversationId,
                friendlyId: agentMessageInfo.friendlyId,
                replyToMessageId
            });
            return await handleAgentMessageReply(ctx, agentMessageInfo);
        }
        
        LogEngine.debug('No ticket or agent message found for reply', {
            replyToMessageId,
            chatId: ctx.chat.id
        });
        
        return false;
    } catch (error) {
        LogEngine.error('Error in handleTicketReply', {
            error: error.message,
            chatId: ctx.chat?.id
        });
        return false;
    }
}

/**
 * Handles replies to ticket confirmation messages
 * 
 * @param {object} ctx - The Telegraf context object
 * @param {object} ticketInfo - The ticket information
 * @returns {boolean} - True if the message was processed
 */
async function handleTicketConfirmationReply(ctx, ticketInfo) {
    try {
        
        // This is a reply to a ticket confirmation, send it to Unthread
        const telegramUserId = ctx.from.id;
        const username = ctx.from.username;
        const message = ctx.message.text;
        
        LogEngine.info('Processing ticket confirmation reply', {
            conversationId: ticketInfo.conversationId,
            ticketId: ticketInfo.ticketId,
            friendlyId: ticketInfo.friendlyId,
            telegramUserId,
            username,
            messageLength: message?.length
        });
        
        // Send a waiting message
        const waitingMsg = await ctx.reply("Adding your message to the ticket...", {
            reply_to_message_id: ctx.message.message_id
        });
        
        try {
            // Get user information from database
            const userData = await unthreadService.getOrCreateUser(telegramUserId, username);
            
            LogEngine.info('Retrieved user data for ticket reply', {
                userData: JSON.stringify(userData),
                hasName: !!userData.name,
                hasEmail: !!userData.email
            });
            
            // Send the message to the ticket using conversationId (which is the same as ticketId)
            await unthreadService.sendMessage({
                conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
                message,
                onBehalfOf: userData
            });
            
            // Update the waiting message with success
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `✅ Your message has been added to Ticket #${ticketInfo.friendlyId}`
            );
            
            LogEngine.info('Added message to ticket', {
                ticketNumber: ticketInfo.friendlyId,
                conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
                telegramUserId,
                username,
                messageLength: message?.length,
                chatId: ctx.chat.id
            });
            return true;
            
        } catch (error) {
            // Handle API errors
            LogEngine.error('Error adding message to ticket', {
                error: error.message,
                stack: error.stack,
                conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
                telegramUserId,
                username
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
        LogEngine.error('Error in handleTicketReply', {
            error: error.message,
            stack: error.stack,
            chatId: ctx.chat?.id
        });
        return false;
    }
}

/**
 * Handles replies to agent messages
 * 
 * @param {object} ctx - The Telegraf context object
 * @param {object} agentMessageInfo - The agent message information
 * @returns {boolean} - True if the message was processed
 */
async function handleAgentMessageReply(ctx, agentMessageInfo) {
    try {
        // This is a reply to an agent message, send it back to Unthread
        const telegramUserId = ctx.from.id;
        const username = ctx.from.username;
        const message = ctx.message.text;
        
        // Send a waiting message
        const waitingMsg = await ctx.reply("Sending your reply to the agent...", {
            reply_to_message_id: ctx.message.message_id
        });
        
        try {
            // Get user information for proper onBehalfOf formatting
            const userData = await unthreadService.getOrCreateUser(telegramUserId, username);
            
            // Send the message to the conversation
            await unthreadService.sendMessage({
                conversationId: agentMessageInfo.conversationId,
                message,
                onBehalfOf: userData
            });
            
            // Update the waiting message with success
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `✅ Your reply has been sent to the agent for Ticket #${agentMessageInfo.friendlyId}`
            );

            // Auto-delete the confirmation message after 1 minute
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id).catch(() => {});
            }, 5000); // 5,000 ms = 5 seconds

            LogEngine.info('Sent reply to agent', {
                ticketNumber: agentMessageInfo.friendlyId,
                conversationId: agentMessageInfo.conversationId,
                telegramUserId,
                username,
                messageLength: message?.length,
                chatId: ctx.chat.id
            });
            return true;
            
        } catch (error) {
            // Handle API errors
            LogEngine.error('Error sending reply to agent', {
                error: error.message,
                conversationId: agentMessageInfo.conversationId
            });
            
            // Update the waiting message with error
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `⚠️ Error sending reply to agent: ${error.message}`
            );
            
            return true;
        }
        
    } catch (error) {
        LogEngine.error('Error in handleAgentMessageReply', {
            error: error.message,
            conversationId: agentMessageInfo?.conversationId
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
        LogEngine.info('Processing private message', {
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            lastName: ctx.from?.last_name,
            messageId: ctx.message?.message_id
        });
        
        // Inform the user that the bot doesn't support private conversations
        await ctx.reply("Sorry, this bot does not have feature to assist you via Telegram DM");
        
    } catch (error) {
        LogEngine.error('Error in handlePrivateMessage', {
            error: error.message,
            stack: error.stack,
            telegramUserId: ctx.from?.id,
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
        LogEngine.info(`Processing message from group: ${ctx.chat.title} (ID: ${ctx.chat.id})`);
        
        // Additional information about the sender if available
        if (ctx.from) {
            LogEngine.info(`Message sent by: ${ctx.from.first_name} ${ctx.from.last_name || ''} (ID: ${ctx.from.id})`);
        }
        
        // Messages that reach here are general group messages that don't require special handling
        // Ticket replies and agent message replies are handled by handleTicketReply function
        LogEngine.debug('General group message - no special action needed', {
            messageId: ctx.message?.message_id,
            hasReply: !!ctx.message?.reply_to_message,
            replyToId: ctx.message?.reply_to_message?.message_id
        });
        
    } catch (error) {
        LogEngine.error(`Error in handleGroupMessage: ${error.message}`);
    }
}