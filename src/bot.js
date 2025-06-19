/**
 * Telegram Bot Utility Module
 * 
 * This module provides utility functions for creating and configuring a Telegram bot
 * using the Telegraf framework. It includes functions for bot initialization, command
 * configuration, and bot startup.
 * 
 * Potential Improvements:
 * - Add error handling for bot operations
 * - Implement middleware support for cross-cutting concerns
 * - Add support for inline queries and callback queries
 * - Add graceful shutdown mechanism
 * - Add webhook support as an alternative to polling
 */
import { Telegraf, Markup } from 'telegraf';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from './sdk/bots-brain/index.js';

/**
 * Creates a new Telegram bot instance
 * 
 * @param {string} token - The Telegram Bot API token
 * @returns {Telegraf} A new Telegraf bot instance
 * 
 * Possible Bugs:
 * - No validation for the token parameter
 * - No error handling if token is invalid
 * 
 * Enhancement Opportunities:
 * - Add token validation
 * - Add bot configuration options parameter
 * - Add session support initialization
 */
export function createBot(token) {
    return new Telegraf(token);
}

/**
 * Configures the bot's command handlers
 * 
 * @param {Telegraf} bot - The Telegraf bot instance
 * @param {Array<{name: string, handler: Function}>} commands - Array of command objects with name and handler
 * 
 * Possible Bugs:
 * - No validation for the commands parameter
 * - No error handling if a command handler throws an exception
 * 
 * Enhancement Opportunities:
 * - Add command descriptions for the /help menu
 * - Add middleware support for commands
 * - Add error handling for command execution
 * - Support for command groups or categories
 */
export function configureCommands(bot, commands) {
    commands.forEach(command => {
        bot.command(command.name, command.handler);
    });
}

/**
 * Starts the bot polling for updates
 * 
 * @param {Telegraf} bot - The Telegraf bot instance
 * 
 * Possible Bugs:
 * - No error handling for network issues
 * - No retry mechanism for failed polling
 * 
 * Enhancement Opportunities:
 * - Add polling options parameter
 * - Add graceful shutdown support
 * - Add webhook support as an alternative to polling
 * - Add status reporting and health check mechanism
 * - Implement logging of bot startup
 */
export function startPolling(bot) {
    bot.launch();
}

/**
 * Safely send a message with error handling for blocked users and other common errors
 * 
 * @param {object} bot - The Telegraf bot instance
 * @param {number} chatId - The chat ID to send the message to
 * @param {string} text - The message text
 * @param {object} options - Additional options for sendMessage
 * @returns {Promise<object|null>} - The sent message object or null if failed
 */
export async function safeSendMessage(bot, chatId, text, options = {}) {
    try {
        return await bot.telegram.sendMessage(chatId, text, options);
    } catch (error) {
        if (error.response?.error_code === 403) {
            if (error.response.description?.includes('bot was blocked by the user')) {
                LogEngine.warn('Bot was blocked by user - cleaning up user data', { chatId });
                
                // Clean up blocked user from storage (solution from GitHub issue #1513)
                await cleanupBlockedUser(chatId);
                
                return null;
            }
            if (error.response.description?.includes('chat not found')) {
                LogEngine.warn('Chat not found - cleaning up chat data', { chatId });
                
                // Clean up chat that no longer exists
                await cleanupBlockedUser(chatId);
                
                return null;
            }
        }
        
        if (error.response?.error_code === 429) {
            LogEngine.warn('Rate limit exceeded when sending message', { 
                chatId, 
                retryAfter: error.response.parameters?.retry_after 
            });
            return null;
        }
        
        // For other errors, log and re-throw
        LogEngine.error('Error sending message', {
            error: error.message,
            chatId,
            textLength: text?.length
        });
        throw error;
    }
}

/**
 * Safely reply to a message with cleanup handling for blocked users
 * This wraps ctx.reply with the same error handling as safeSendMessage
 * 
 * @param {object} ctx - The Telegraf context object
 * @param {string} text - The message text to reply with
 * @param {object} options - Additional options for the reply
 * @returns {Promise<object|null>} - The sent message object or null if failed
 */
export async function safeReply(ctx, text, options = {}) {
    try {
        return await ctx.reply(text, options);
    } catch (error) {
        if (error.response?.error_code === 403) {
            if (error.response.description?.includes('bot was blocked by the user')) {
                LogEngine.warn('Bot was blocked by user during reply - cleaning up user data', { 
                    chatId: ctx.chat?.id,
                    userId: ctx.from?.id 
                });
                
                // Clean up blocked user from storage
                if (ctx.chat?.id) {
                    await cleanupBlockedUser(ctx.chat.id);
                }
                
                return null;
            }
            if (error.response.description?.includes('chat not found')) {
                LogEngine.warn('Chat not found during reply - cleaning up chat data', { 
                    chatId: ctx.chat?.id 
                });
                
                // Clean up chat that no longer exists
                if (ctx.chat?.id) {
                    await cleanupBlockedUser(ctx.chat.id);
                }
                
                return null;
            }
        }
        
        if (error.response?.error_code === 429) {
            LogEngine.warn('Rate limit exceeded during reply', { 
                chatId: ctx.chat?.id, 
                retryAfter: error.response.parameters?.retry_after 
            });
            return null;
        }
        
        // For other errors, log and re-throw
        LogEngine.error('Error sending reply', {
            error: error.message,
            chatId: ctx.chat?.id,
            textLength: text?.length
        });
        throw error;
    }
}

/**
 * Safely edit a message text with cleanup handling for blocked users
 * 
 * @param {object} ctx - The Telegraf context object
 * @param {number} chatId - The chat ID
 * @param {number} messageId - The message ID to edit
 * @param {string} inlineMessageId - Inline message ID (if applicable)
 * @param {string} text - The new message text
 * @param {object} options - Additional options for editing
 * @returns {Promise<object|null>} - The edited message object or null if failed
 */
export async function safeEditMessageText(ctx, chatId, messageId, inlineMessageId, text, options = {}) {
    try {
        return await ctx.telegram.editMessageText(chatId, messageId, inlineMessageId, text, options);
    } catch (error) {
        if (error.response?.error_code === 403) {
            if (error.response.description?.includes('bot was blocked by the user')) {
                LogEngine.warn('Bot was blocked by user during message edit - cleaning up user data', { 
                    chatId,
                    messageId 
                });
                
                // Clean up blocked user from storage
                await cleanupBlockedUser(chatId);
                return null;
            }
            if (error.response.description?.includes('chat not found')) {
                LogEngine.warn('Chat not found during message edit - cleaning up chat data', { 
                    chatId,
                    messageId 
                });
                
                // Clean up chat that no longer exists
                await cleanupBlockedUser(chatId);
                return null;
            }
        }
        
        if (error.response?.error_code === 429) {
            LogEngine.warn('Rate limit exceeded during message edit', { 
                chatId, 
                messageId,
                retryAfter: error.response.parameters?.retry_after 
            });
            return null;
        }
        
        // For message not found or already edited, just log and continue
        if (error.response?.error_code === 400 && 
            (error.response.description?.includes('message to edit not found') || 
             error.response.description?.includes('message is not modified'))) {
            LogEngine.debug('Message edit failed - message not found or already modified', { 
                chatId, 
                messageId 
            });
            return null;
        }
        
        // For other errors, log and re-throw
        LogEngine.error('Error editing message', {
            error: error.message,
            chatId,
            messageId,
            textLength: text?.length
        });
        throw error;
    }
}

/**
 * Clean up user data when bot is blocked or chat is not found
 * This implements the fix from GitHub issue telegraf/telegraf#1513
 * 
 * @param {number} chatId - The chat ID of the blocked user
 */
async function cleanupBlockedUser(chatId) {
    try {
        LogEngine.info('Starting cleanup for blocked user', { chatId });
        
        // Get BotsStore instance
        const botsStore = BotsStore.getInstance();
        
        // 1. Get all tickets for this chat
        const tickets = await botsStore.getTicketsForChat(chatId);
        
        if (tickets.length > 0) {
            LogEngine.info(`Found ${tickets.length} tickets to clean up for blocked user`, { 
                chatId, 
                ticketIds: tickets.map(t => t.conversationId) 
            });
            
            // 2. Delete each ticket and its mappings
            for (const ticket of tickets) {
                await botsStore.deleteTicket(ticket.conversationId);
                LogEngine.info(`Cleaned up ticket ${ticket.friendlyId} for blocked user`, { 
                    chatId, 
                    conversationId: ticket.conversationId 
                });
            }
        }
        
        // 3. Clean up customer data for this chat
        const customer = await botsStore.getCustomerByChatId(chatId);
        if (customer) {
            // Remove customer mappings (the customer still exists in Unthread, just remove local mappings)
            await botsStore.storage.delete(`customer:telegram:${chatId}`);
            await botsStore.storage.delete(`customer:id:${customer.unthreadCustomerId}`);
            
            LogEngine.info('Cleaned up customer mappings for blocked user', { 
                chatId, 
                customerId: customer.unthreadCustomerId 
            });
        }
        
        // 4. Clean up any user states
        // Note: User states are keyed by telegram user ID, not chat ID
        // So we can't clean them up directly without the user ID
        // They will expire naturally due to TTL
        
        LogEngine.info('Successfully cleaned up blocked user data', { chatId });
        
    } catch (error) {
        LogEngine.error('Error cleaning up blocked user data', {
            error: error.message,
            stack: error.stack,
            chatId
        });
        // Don't throw - cleanup failure shouldn't crash the bot
    }
}