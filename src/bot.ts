/**
 * Core Bot Utilities - Bot lifecycle and safe message operations
 * 
 * Key Features:
 * - Bot instance creation and configuration
 * - Safe message sending with blocked user detection
 * - Error handling and user cleanup
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc1
 * @since 2025
 */
import { Telegraf } from 'telegraf';
import type { ExtraEditMessageText, ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotsStore } from './sdk/bots-brain/index.js';
import { BotContext, TelegramError } from './types/index.js';

/**
 * Creates a new Telegraf bot instance
 * 
 * @param token - Telegram Bot API token
 * @returns Initialized bot instance
 */
export function createBot(token: string): Telegraf<BotContext> {
    if (!token) {
        throw new Error('Telegram bot token is required');
    }
    return new Telegraf<BotContext>(token);
}



/**
 * Starts bot polling to receive Telegram updates
 */
export function startPolling(bot: Telegraf<BotContext>): void {
    bot.launch();
}


/**
 * Replies to a message in the given context, handling errors such as blocked users, missing chats, and rate limits.
 *
 * If the bot is blocked or the chat is not found, associated user data is cleaned up and null is returned. If rate limits are exceeded, a warning is logged and null is returned. Other errors are logged and re-thrown.
 *
 * @param ctx - The Telegraf context for the incoming message
 * @param text - The reply message text
 * @param options - Optional parameters for the reply
 * @returns The sent message object, or null if the reply could not be sent due to blocking, missing chat, or rate limiting
 */
export async function safeReply(
    ctx: BotContext, 
    text: string, 
    options: ExtraReplyMessage = {}
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
 * Attempts to edit the text of a Telegram message, handling common errors such as blocked users, missing chats, rate limits, and non-critical edit failures.
 *
 * If the bot is blocked or the chat is not found, associated user data is cleaned up and `null` is returned. Rate limit errors also result in `null`. If the message is not found or already modified, the error is logged and `null` is returned. Other errors are logged and re-thrown.
 *
 * @param ctx - The Telegraf context object
 * @param chatId - The target chat ID
 * @param messageId - The ID of the message to edit
 * @param inlineMessageId - The inline message ID, if applicable
 * @param text - The new text for the message
 * @param options - Additional options for editing the message
 * @returns The edited message object, or `null` if the operation fails due to handled errors
 */
export async function safeEditMessageText(
    ctx: BotContext, 
    chatId: number, 
    messageId: number, 
    inlineMessageId: string | undefined, 
    text: string, 
    options: ExtraEditMessageText = {}
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
 * Cleans up all local data associated with a chat when the bot is blocked or the chat is not found.
 *
 * Removes tickets and customer mappings related to the specified chat from persistent storage. User state data is not explicitly removed but will expire automatically. Errors during cleanup are logged but do not interrupt bot operation.
 *
 * @param chatId - The Telegram chat ID to clean up data for
 */
export async function cleanupBlockedUser(chatId: number): Promise<void> {
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
        // User states are keyed by telegram user ID, not chat ID
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
