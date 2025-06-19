/**
 * Telegram Bot Utility Module
 * 
 * This module provides utility functions for creating and configuring a Telegram bot
 * using the Telegraf framework. It includes functions for bot initialization, command
 * configuration, and bot startup.
 */
import { Telegraf, Markup } from 'telegraf';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from './sdk/bots-brain/index.js';
import { BotContext, TelegramError, CommandHandler } from './types/index.js';

/**
 * Creates a new Telegram bot instance
 * 
 * @param token - The Telegram Bot API token
 * @returns A new Telegraf bot instance
 */
export function createBot(token: string): Telegraf<BotContext> {
    if (!token) {
        throw new Error('Telegram bot token is required');
    }
    return new Telegraf<BotContext>(token);
}

/**
 * Configures the bot's command handlers
 * 
 * @param bot - The Telegraf bot instance
 * @param commands - Array of command objects with name and handler
 */
export function configureCommands(
    bot: Telegraf<BotContext>, 
    commands: Array<{ name: string; handler: CommandHandler }>
): void {
    commands.forEach(command => {
        bot.command(command.name, command.handler);
    });
}

/**
 * Starts the bot polling for updates
 * 
 * @param bot - The Telegraf bot instance
 */
export function startPolling(bot: Telegraf<BotContext>): void {
    bot.launch();
}

/**
 * Safely send a message with error handling for blocked users and other common errors
 * 
 * @param bot - The Telegraf bot instance
 * @param chatId - The chat ID to send the message to
 * @param text - The message text
 * @param options - Additional options for sendMessage
 * @returns The sent message object or null if failed
 */
export async function safeSendMessage(
    bot: Telegraf<BotContext>, 
    chatId: number, 
    text: string, 
    options: any = {}
): Promise<any | null> {
    try {
        return await bot.telegram.sendMessage(chatId, text, options);
    } catch (error) {
        const telegramError = error as TelegramError;
        
        if (telegramError.response?.error_code === 403) {
            if (telegramError.response.description?.includes('bot was blocked by the user')) {
                LogEngine.warn('Bot was blocked by user - cleaning up user data', { chatId });
                
                // Clean up blocked user from storage
                await cleanupBlockedUser(chatId);
                
                return null;
            }
            if (telegramError.response.description?.includes('chat not found')) {
                LogEngine.warn('Chat not found - cleaning up chat data', { chatId });
                
                // Clean up chat that no longer exists
                await cleanupBlockedUser(chatId);
                
                return null;
            }
        }
        
        if (telegramError.response?.error_code === 429) {
            LogEngine.warn('Rate limit exceeded when sending message', { 
                chatId, 
                retryAfter: telegramError.response.parameters?.retry_after 
            });
            return null;
        }
        
        // For other errors, log and re-throw
        LogEngine.error('Error sending message', {
            error: telegramError.message,
            chatId,
            textLength: text?.length
        });
        throw error;
    }
}

/**
 * Safely reply to a message with cleanup handling for blocked users
 * 
 * @param ctx - The Telegraf context object
 * @param text - The message text to reply with
 * @param options - Additional options for the reply
 * @returns The sent message object or null if failed
 */
export async function safeReply(
    ctx: BotContext, 
    text: string, 
    options: any = {}
): Promise<any | null> {
    try {
        return await ctx.reply(text, options);
    } catch (error) {
        const telegramError = error as TelegramError;
        
        if (telegramError.response?.error_code === 403) {
            if (telegramError.response.description?.includes('bot was blocked by the user')) {
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
            if (telegramError.response.description?.includes('chat not found')) {
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
        
        if (telegramError.response?.error_code === 429) {
            LogEngine.warn('Rate limit exceeded during reply', { 
                chatId: ctx.chat?.id, 
                retryAfter: telegramError.response.parameters?.retry_after 
            });
            return null;
        }
        
        // For other errors, log and re-throw
        LogEngine.error('Error sending reply', {
            error: telegramError.message,
            chatId: ctx.chat?.id,
            textLength: text?.length
        });
        throw error;
    }
}

/**
 * Safely edit a message text with cleanup handling for blocked users
 * 
 * @param ctx - The Telegraf context object
 * @param chatId - The chat ID
 * @param messageId - The message ID to edit
 * @param inlineMessageId - Inline message ID (if applicable)
 * @param text - The new message text
 * @param options - Additional options for editing
 * @returns The edited message object or null if failed
 */
export async function safeEditMessageText(
    ctx: BotContext, 
    chatId: number, 
    messageId: number, 
    inlineMessageId: string | undefined, 
    text: string, 
    options: any = {}
): Promise<any | null> {
    try {
        return await ctx.telegram.editMessageText(chatId, messageId, inlineMessageId, text, options);
    } catch (error) {
        const telegramError = error as TelegramError;
        
        if (telegramError.response?.error_code === 403) {
            if (telegramError.response.description?.includes('bot was blocked by the user')) {
                LogEngine.warn('Bot was blocked by user during message edit - cleaning up user data', { 
                    chatId,
                    messageId 
                });
                
                // Clean up blocked user from storage
                await cleanupBlockedUser(chatId);
                return null;
            }
            if (telegramError.response.description?.includes('chat not found')) {
                LogEngine.warn('Chat not found during message edit - cleaning up chat data', { 
                    chatId,
                    messageId 
                });
                
                // Clean up chat that no longer exists
                await cleanupBlockedUser(chatId);
                return null;
            }
        }
        
        if (telegramError.response?.error_code === 429) {
            LogEngine.warn('Rate limit exceeded during message edit', { 
                chatId, 
                messageId,
                retryAfter: telegramError.response.parameters?.retry_after 
            });
            return null;
        }
        
        // For message not found or already edited, just log and continue
        if (telegramError.response?.error_code === 400 && 
            (telegramError.response.description?.includes('message to edit not found') || 
             telegramError.response.description?.includes('message is not modified'))) {
            LogEngine.debug('Message edit failed - message not found or already modified', { 
                chatId, 
                messageId 
            });
            return null;
        }
        
        // For other errors, log and re-throw
        LogEngine.error('Error editing message', {
            error: telegramError.message,
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
 * @param chatId - The chat ID of the blocked user
 */
async function cleanupBlockedUser(chatId: number): Promise<void> {
    try {
        LogEngine.info('Starting cleanup for blocked user', { chatId });
        
        // Get BotsStore instance
        const botsStore = BotsStore.getInstance();
        
        // 1. Get all tickets for this chat
        const tickets = await botsStore.getTicketsForChat(chatId);
        
        if (tickets.length > 0) {
            LogEngine.info(`Found ${tickets.length} tickets to clean up for blocked user`, { 
                chatId, 
                ticketIds: tickets.map((t: any) => t.conversationId) 
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
        const err = error as Error;
        LogEngine.error('Error cleaning up blocked user data', {
            error: err.message,
            stack: err.stack,
            chatId
        });
        // Don't throw - cleanup failure shouldn't crash the bot
    }
}
