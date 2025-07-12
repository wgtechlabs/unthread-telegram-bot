/**
 * Unthread Telegram Bot - Message Event Handlers Module
 * 
 * Handles incoming message events from Telegram and processes them according to
 * chat type and content. This module serves as the main message router for the
 * Unthread Telegram Bot, directing conversations to appropriate handlers.
 * 
 * Message Processing:
 * - Chat type detection (private, group, supergroup, channel)
 * - Pattern matching for specific message content
 * - Support conversation flow management
 * - Automatic ticket creation for group messages
 * - Smart routing based on user intent and context
 * 
 * Supported Chat Types:
 * - Private chats: Direct support form collection and ticket creation
 * - Group chats: Automatic ticket creation for all messages
 * - Supergroups: Enhanced group message handling with threading
 * - Channels: Read-only message monitoring (if applicable)
 * 
 * Features:
 * - Context-aware message processing
 * - Automatic support ticket generation
 * - Integration with Unthread API for message routing
 * - State-aware conversation management * - Error handling and user feedback
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { processConversation, aboutCommand } from '../commands/index.js';
import * as unthreadService from '../services/unthread.js';
import { safeReply, safeEditMessageText } from '../bot.js';
import type { BotContext } from '../types/index.js';

/**
 * Returns true if the message originates from a group or supergroup chat.
 *
 * @returns True if the chat type is 'group' or 'supergroup'; otherwise, false.
 */
export function isGroupChat(ctx: BotContext): boolean {
    return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

/**
 * Determines whether the current chat is a private chat.
 *
 * @returns True if the chat type is 'private'; otherwise, false.
 */
export function isPrivateChat(ctx: BotContext): boolean {
    return ctx.chat?.type === 'private';
}

/**
 * Main handler for incoming Telegram messages, routing them to appropriate processors based on chat type and message context.
 *
 * Determines whether to process the message as a command, support conversation, ticket reply, private chat, or group chat, and delegates handling accordingly. Prevents automatic responses in group chats and ensures that only relevant handlers are invoked for each message type.
 */
export async function handleMessage(ctx: BotContext, next: () => Promise<void>): Promise<void> {
    try {
        // Skip if there's no message or chat
        if (!ctx.message || !ctx.chat) {
            return await next();
        }

        // Log basic information about the message
        LogEngine.debug('Processing message', {
            chatType: ctx.chat.type,
            chatId: ctx.chat.id,
            userId: ctx.from?.id,
            messageText: 'text' in ctx.message ? ctx.message.text?.substring(0, 50) : undefined,
            isCommand: 'text' in ctx.message ? ctx.message.text?.startsWith('/') : false,
            hasFromUser: !!ctx.from,
            messageType: 'text' in ctx.message ? 'text' : 'other'
        });
        
        // If this is a command, let Telegraf handle it and don't process further
        if ('text' in ctx.message && ctx.message.text?.startsWith('/')) {
            LogEngine.debug('Command detected, passing to command handlers', {
                command: ctx.message.text,
                chatType: ctx.chat.type
            });
            return;  // Don't call next() for commands, let Telegraf handle them
        }
        
        // Check if this is part of any conversation flow (setup, support, templates, etc.)
        const isConversationMessage = await processConversation(ctx);
        
        if (isConversationMessage) {
            // Skip other handlers if this was processed by any conversation processor
            LogEngine.debug('Message processed by conversation processor');
            return;  // Don't call next() for conversation messages, we're done
        }
        
        // Check if this is a reply to a ticket confirmation
        if ('reply_to_message' in ctx.message && ctx.message.reply_to_message && 'text' in ctx.message && ctx.message.text) {
            const handled = await handleTicketReply(ctx);
            if (handled) {
                // Skip other handlers if this was a ticket reply
                LogEngine.debug('Message processed as ticket reply');
                return;  // Don't call next() for ticket replies, we're done
            }
        }

        // Handle different chat types
        if (isPrivateChat(ctx)) {
            LogEngine.debug('Processing as private message');
            await handlePrivateMessage(ctx);
        } else if (isGroupChat(ctx)) {
            LogEngine.debug('Processing as group message - NO AUTO RESPONSES');
            await handleGroupMessage(ctx);
            // For group chats, DO NOT continue processing to prevent auto-responses
            LogEngine.debug('Stopping processing for group message to prevent auto-responses');
            return;
        }

        // Continue processing with other handlers (only for private chats)
        return await next();
    } catch (error) {
        const err = error as Error;
        LogEngine.error(`Error handling message: ${err.message}`);
        return await next();
    }
}

/**
 * Processes replies to ticket confirmation or agent messages and routes them for handling.
 *
 * Checks if the incoming message is a reply to a ticket confirmation or agent message, and if so, processes the reply accordingly. Returns true if the reply was handled, or false otherwise.
 *
 * @returns True if the reply was processed as a ticket or agent message reply; false otherwise.
 */
async function handleTicketReply(ctx: BotContext): Promise<boolean> {
    try {
        if (!ctx.message || !('reply_to_message' in ctx.message) || !ctx.message.reply_to_message) {
            return false;
        }

        // Get the ID of the message being replied to
        const replyToMessageId = ctx.message.reply_to_message.message_id;
        
        LogEngine.info('Processing potential ticket reply', {
            replyToMessageId,
            messageText: 'text' in ctx.message ? ctx.message.text?.substring(0, 100) : undefined,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
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
            chatId: ctx.chat?.id
        });
        
        return false;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleTicketReply', {
            error: err.message,
            chatId: ctx.chat?.id
        });
        return false;
    }
}

/**
 * Processes a reply to a ticket confirmation message by validating the reply, sending the message to the ticket conversation, and updating the user with a status message.
 *
 * @param ctx - The Telegram bot context for the incoming message
 * @param ticketInfo - Information about the ticket to which the reply is associated
 * @returns True if the reply was processed (successfully or with an error status message), or false if validation failed or an unexpected error occurred
 */
async function handleTicketConfirmationReply(ctx: BotContext, ticketInfo: any): Promise<boolean> {
    try {
        // Validate the reply context and ticket information
        const validation = await validateTicketReply(ctx, ticketInfo);
        if (!validation.isValid) {
            return false;
        }
        
        const { telegramUserId, username, message } = validation;
        
        // Send a minimal status message
        const statusMsg = await safeReply(ctx, '⏳ Adding to ticket...', {
            reply_parameters: { message_id: ctx.message!.message_id }
        });

        if (!statusMsg) {
            return false;
        }
        
        try {
            // Process and send the ticket message to Unthread
            await processTicketMessage(ticketInfo, telegramUserId, username, message);
            
            // Update status message to success
            await updateStatusMessage(ctx, statusMsg, true);
            return true;
            
        } catch (error) {
            const err = error as Error;
            // Handle API errors
            LogEngine.error('Error adding message to ticket', {
                error: err.message,
                stack: err.stack,
                conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
                telegramUserId,
                username
            });
            
            // Update status message to error
            await updateStatusMessage(ctx, statusMsg, false);
            return true;
        }
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleTicketReply', {
            error: err.message,
            stack: err.stack,
            chatId: ctx.chat?.id
        });
        return false;
    }
}

/**
 * Validates that the reply message and sender information are present and extracts user and message details for ticket processing.
 *
 * @returns An object indicating whether the reply is valid. If valid, includes the sender's Telegram user ID, username, and message text.
 */
async function validateTicketReply(ctx: BotContext, ticketInfo: any): Promise<{ isValid: false } | { isValid: true; telegramUserId: number; username: string | undefined; message: string }> {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
        return { isValid: false };
    }
    
    const telegramUserId = ctx.from.id;
    const username = ctx.from.username;
    const message = ctx.message.text || '';
    
    LogEngine.info('Processing ticket confirmation reply', {
        conversationId: ticketInfo.conversationId,
        ticketId: ticketInfo.ticketId,
        friendlyId: ticketInfo.friendlyId,
        telegramUserId,
        username,
        messageLength: message?.length
    });
    
    return {
        isValid: true,
        telegramUserId,
        username,
        message
    };
}

/**
 * Sends a user's message to the specified ticket conversation in Unthread.
 *
 * Retrieves or creates user data based on the Telegram user ID and username, then sends the provided message to the ticket conversation identified by the ticket information.
 */
async function processTicketMessage(ticketInfo: any, telegramUserId: number, username: string | undefined, message: string): Promise<void> {
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
        message: message || 'No message content',
        onBehalfOf: userData
    });
    
    LogEngine.info('Added message to ticket', {
        ticketNumber: ticketInfo.friendlyId,
        conversationId: ticketInfo.conversationId || ticketInfo.ticketId,
        telegramUserId,
        username,
        messageLength: message?.length
    });
}

/**
 * Updates a status message to indicate success or error, then deletes it after a short delay.
 *
 * The message is updated to show a checkmark for success or an error icon for failure, and is automatically removed after 3 seconds (success) or 5 seconds (error).
 */
async function updateStatusMessage(ctx: BotContext, statusMsg: any, isSuccess: boolean): Promise<void> {
    if (isSuccess) {
        // Update status message to success
        await safeEditMessageText(
            ctx,
            ctx.chat!.id,
            statusMsg.message_id,
            undefined,
            '✅ Added!'
        );

        // Delete status message after 3 seconds
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
        }, 3000);
    } else {
        // Update status message to error
        await safeEditMessageText(
            ctx,
            ctx.chat!.id,
            statusMsg.message_id,
            undefined,
            '❌ Error!'
        );

        // Delete status message after 5 seconds
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
        }, 5000);
    }
}

/**
 * Processes a user's reply to an agent message by forwarding it to the corresponding Unthread conversation.
 *
 * Sends a status message indicating progress, updates it upon success or error, and deletes the status message after a delay. Returns true if the reply was processed, false otherwise.
 *
 * @returns True if the reply was handled (successfully sent or error occurred), false if the context was invalid.
 */
async function handleAgentMessageReply(ctx: BotContext, agentMessageInfo: any): Promise<boolean> {
    try {
        if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
            return false;
        }

        // This is a reply to an agent message, send it back to Unthread
        const telegramUserId = ctx.from.id;
        const username = ctx.from.username;
        const message = ctx.message.text || '';
        
        // Send a minimal status message
        const statusMsg = await safeReply(ctx, '⏳ Sending...', {
            reply_parameters: { message_id: ctx.message.message_id }
        });

        if (!statusMsg) {
            return false;
        }
        
        try {
            // Get user information for proper onBehalfOf formatting
            const userData = await unthreadService.getOrCreateUser(telegramUserId, username);
            
            // Send the message to the conversation
            await unthreadService.sendMessage({
                conversationId: agentMessageInfo.conversationId,
                message: message || 'No message content',
                onBehalfOf: userData
            });
            
            // Update status message to success
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                statusMsg.message_id,
                undefined,
                '✅ Sent!'
            );

            // Delete status message after 3 seconds
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            }, 3000);

            LogEngine.info('Sent reply to agent', {
                ticketNumber: agentMessageInfo.friendlyId,
                conversationId: agentMessageInfo.conversationId,
                telegramUserId,
                username,
                messageLength: message?.length,
                chatId: ctx.chat?.id
            });
            return true;
            
        } catch (error) {
            const err = error as Error;
            // Handle API errors
            LogEngine.error('Error sending reply to agent', {
                error: err.message,
                conversationId: agentMessageInfo.conversationId
            });
            
            // Update status message to error
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                statusMsg.message_id,
                undefined,
                '❌ Error!'
            );

            // Delete status message after 5 seconds
            setTimeout(() => {
                ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
            }, 5000);
            
            return true;
        }
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleAgentMessageReply', {
            error: err.message,
            conversationId: agentMessageInfo?.conversationId
        });
        return false;
    }
}

/**
 * Processes incoming messages from private chats and responds with an about message for non-command texts.
 *
 * Skips messages that are commands, allowing them to be handled by their respective handlers.
 */
export async function handlePrivateMessage(ctx: BotContext): Promise<void> {
    try {
        // Log information about the private message
        LogEngine.info('Processing private message', {
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            lastName: ctx.from?.last_name,
            messageId: ctx.message?.message_id,
            messageText: ctx.message && 'text' in ctx.message ? ctx.message.text?.substring(0, 100) : undefined
        });
        
        // Only respond to private messages if they're not commands
        // Commands should be handled by their respective handlers
        if (ctx.message && 'text' in ctx.message && ctx.message.text?.startsWith('/')) {
            LogEngine.debug('Skipping private message - it\'s a command', {
                command: ctx.message.text.split(' ')[0]
            });
            return;
        }
        
        // Send the about message for any non-command private message
        await aboutCommand(ctx);
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handlePrivateMessage', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username
        });
    }
}

/**
 * Processes incoming messages from group chats without sending automatic responses.
 *
 * Logs detailed information about the group, sender, and message content for monitoring and debugging purposes.
 */
export async function handleGroupMessage(ctx: BotContext): Promise<void> {
    try {
        // Log more detailed information about the group message
        const chatTitle = ctx.chat && ('title' in ctx.chat) ? ctx.chat.title : 'Unknown';
        LogEngine.info(`Processing message from group: ${chatTitle} (ID: ${ctx.chat?.id})`);
        
        // Additional information about the sender if available
        if (ctx.from) {
            LogEngine.info(`Message sent by: ${ctx.from.first_name} ${ctx.from.last_name || ''} (ID: ${ctx.from.id})`);
        }
        
        // Log the message content for debugging
        LogEngine.debug('Group message details', {
            messageId: ctx.message?.message_id,
            messageText: ctx.message && 'text' in ctx.message ? ctx.message.text?.substring(0, 100) : undefined,
            messageType: ctx.message && 'photo' in ctx.message ? 'photo' : 
                        ctx.message && 'document' in ctx.message ? 'document' : 
                        ctx.message && 'text' in ctx.message ? 'text' : 'other',
            hasReply: ctx.message && 'reply_to_message' in ctx.message && !!ctx.message.reply_to_message,
            replyToId: ctx.message && 'reply_to_message' in ctx.message ? ctx.message.reply_to_message?.message_id : undefined
        });
        
        LogEngine.debug('Group message processed - no automatic responses sent');
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error(`Error in handleGroupMessage: ${err.message}`);
    }
}
