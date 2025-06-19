/**
 * Main Bot Application Entry Point
 * 
 * This file is the entry point for the Telegram bot application. It handles the bot
 * initialization, configures middleware, sets up command handlers, and starts the bot.
 */
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { createBot, startPolling, safeReply } from './bot.js';
import { 
    startCommand, 
    helpCommand, 
    versionCommand, 
    aboutCommand,
    supportCommand, 
    cancelCommand, 
    resetCommand, 
    processSupportConversation 
} from './commands/index.js';
import { handleMessage } from './events/message.js';
import { db } from './database/connection.js';
import { BotsStore } from './sdk/bots-brain/index.js';
import { WebhookConsumer } from './sdk/unthread-webhook/index.js';
import { TelegramWebhookHandler } from './handlers/webhookMessage.js';
import packageJSON from '../package.json' with { type: 'json' };
import { LogEngine } from '@wgtechlabs/log-engine';
import type { BotContext } from './types/index.js';

/**
 * Initialize the bot with the token from environment variables
 */
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
if (!telegramToken) {
    LogEngine.error('TELEGRAM_BOT_TOKEN is required but not found in environment variables');
    process.exit(1);
}

const bot = createBot(telegramToken);

/**
 * Global middleware for logging incoming messages
 */
bot.use(async (ctx: BotContext, next) => {
    try {
        if (ctx.message) {
            // Determine message type
            let messageType = 'text';
            if ('photo' in ctx.message) messageType = 'photo';
            else if ('document' in ctx.message) messageType = 'document';
            else if ('video' in ctx.message) messageType = 'video';
            else if ('audio' in ctx.message) messageType = 'audio';
            else if ('voice' in ctx.message) messageType = 'voice';
            else if ('video_note' in ctx.message) messageType = 'video_note';
            else if ('sticker' in ctx.message) messageType = 'sticker';
            else if (!('text' in ctx.message)) messageType = 'other';
            
            LogEngine.debug('Message received', {
                chatId: ctx.chat?.id,
                userId: ctx.from?.id,
                type: messageType,
                hasText: 'text' in ctx.message && !!ctx.message.text,
                isCommand: 'text' in ctx.message && ctx.message.text?.startsWith('/'),
                textPreview: 'text' in ctx.message ? ctx.message.text?.substring(0, 30) : undefined
            });
        }
        await next();
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in bot middleware', {
            error: err.message,
            stack: err.stack,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
        });
        
        // Don't re-throw the error to prevent bot crash
        // Just log it and continue
    }
});

/**
 * Command handler registration
 * 
 * Commands are restricted to private chats only to prevent spam in group chats
 */

// Middleware for command handling with proper chat type support
const commandMiddleware = async (ctx: BotContext, next: () => Promise<void>) => {
    try {
        // Allow all commands in both private and group chats
        // The individual command handlers will determine the appropriate response
        return await next();
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in command middleware', {
            error: err.message,
            chatId: ctx.chat?.id,
            command: ctx.message && 'text' in ctx.message ? ctx.message.text : undefined
        });
    }
};

// Wrap command handlers with error handling
const wrapCommandHandler = (handler: (ctx: BotContext) => Promise<void>, commandName: string) => {
    return async (ctx: BotContext) => {
        try {
            LogEngine.debug(`Executing ${commandName} command`, {
                chatId: ctx.chat?.id,
                chatType: ctx.chat?.type,
                userId: ctx.from?.id
            });
            await handler(ctx);
        } catch (error) {
            const err = error as Error;
            LogEngine.error(`Error in ${commandName} command`, {
                error: err.message,
                stack: err.stack,
                chatId: ctx.chat?.id,
                userId: ctx.from?.id
            });
            
            // Try to send error message safely
            try {
                await safeReply(ctx, `Sorry, there was an error processing the ${commandName} command.`);
            } catch (replyError) {
                const replyErr = replyError as Error;
                LogEngine.error(`Failed to send error reply for ${commandName}`, {
                    error: replyErr.message,
                    chatId: ctx.chat?.id
                });
            }
        }
    };
};

bot.start(commandMiddleware, wrapCommandHandler(startCommand, 'start'));
bot.help(commandMiddleware, wrapCommandHandler(helpCommand, 'help'));
bot.command('version', commandMiddleware, wrapCommandHandler(versionCommand, 'version'));
bot.command('about', commandMiddleware, wrapCommandHandler(aboutCommand, 'about'));
bot.command('support', commandMiddleware, wrapCommandHandler(supportCommand, 'support'));
bot.command('cancel', commandMiddleware, wrapCommandHandler(cancelCommand, 'cancel'));
bot.command('reset', commandMiddleware, wrapCommandHandler(resetCommand, 'reset'));

// Test handler - this should catch ALL text messages
bot.use(async (ctx, next) => {
    if (ctx.message && 'text' in ctx.message) {
        // Try to process support conversation for ALL text messages, not just replies
        if (!ctx.message.text?.startsWith('/')) {
            const handled = await processSupportConversation(ctx);
            if (handled) {
                return; // Don't continue processing
            }
        }
    }
    return next();
});

// Register message handlers with middleware
bot.on('text', async (ctx, next) => {
    // Skip commands - let Telegraf handle them with the command handlers
    if (ctx.message.text?.startsWith('/')) {
        return;
    }
    
    await handleMessage(ctx, next);
});

// Also register the original message handler for non-text messages (photos, etc.)
bot.on('message', async (ctx, next) => {
    // Only handle non-text messages here
    if ('text' in ctx.message) {
        return; // Text messages are handled by the 'text' handler above
    }
    
    await handleMessage(ctx, next);
});

// Register callback query handler for buttons
bot.on('callback_query', async (ctx) => {
    try {
        // Route callback queries through the processSupportConversation function
        await processSupportConversation(ctx);
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error handling callback query', {
            error: err.message,
            userId: ctx.from?.id
        });
    }
});

/**
 * Database and Storage initialization
 * 
 * Initialize database connection and storage layers before starting the bot
 */
try {
    await db.connect();
    LogEngine.info('Database initialized successfully');
    
    // Initialize the BotsStore with database connection and platform Redis URL
    await BotsStore.initialize(db, process.env.PLATFORM_REDIS_URL);
    LogEngine.info('BotsStore initialized successfully');
} catch (error) {
    const err = error as Error;
    LogEngine.error('Failed to initialize database or storage', {
        error: err.message
    });
    process.exit(1);
}

/**
 * Webhook Consumer and Handler initialization
 * 
 * Initialize the webhook consumer to listen for Unthread events
 * and the handler to process agent messages
 */
let webhookConsumer: WebhookConsumer | undefined;
let webhookHandler: TelegramWebhookHandler | undefined;

try {
    // Check if webhook Redis URL is available before initializing webhook consumer
    if (process.env.WEBHOOK_REDIS_URL) {
        // Initialize webhook consumer with dedicated webhook Redis URL
        webhookConsumer = new WebhookConsumer({
            redisUrl: process.env.WEBHOOK_REDIS_URL,
            queueName: 'unthread-events'
        });

        // Initialize webhook handler
        const botsStore = BotsStore.getInstance();
        webhookHandler = new TelegramWebhookHandler(bot, botsStore);

        // Subscribe to agent message events from dashboard
        webhookConsumer.subscribe('message_created', 'dashboard', 
            webhookHandler.handleMessageCreated.bind(webhookHandler)
        );

        // Subscribe to conversation status update events from dashboard
        if (typeof webhookHandler.handleConversationUpdated === 'function') {
            webhookConsumer.subscribe('conversation_updated', 'dashboard', 
                webhookHandler.handleConversationUpdated.bind(webhookHandler)
            );
        } else {
            LogEngine.warn('Webhook handler does not implement handleConversationUpdated; skipping subscription.');
        }

        // Start the webhook consumer
        await webhookConsumer.start();
        LogEngine.info('Webhook consumer started successfully');
    } else {
        LogEngine.warn('Webhook Redis URL not configured - webhook processing disabled');
        LogEngine.info('Bot will run in basic mode (ticket creation only)');
    }

} catch (error) {
    const err = error as Error;
    LogEngine.error('Failed to initialize webhook consumer', {
        error: err.message
    });
    // Don't exit - bot can still work for ticket creation without webhook processing
    LogEngine.warn('Bot will continue without webhook processing capabilities');
}

/**
 * Bot initialization and startup
 */
bot.botInfo = await bot.telegram.getMe();

// Set bot commands for Telegram UI
await bot.telegram.setMyCommands([
    { command: 'start', description: 'Start the bot and get welcome message' },
    { command: 'help', description: 'Show available commands and their descriptions' },
    { command: 'version', description: 'Show the bot version' },
    { command: 'about', description: 'Show comprehensive bot information' },
    { command: 'support', description: 'Create a support ticket (group chats only)' },
    { command: 'cancel', description: 'Cancel ongoing support ticket creation' },
    { command: 'reset', description: 'Reset your support conversation state' }
]);

LogEngine.info('Bot initialized successfully', {
    username: bot.botInfo.username,
    botId: bot.botInfo.id,
    version: packageJSON.version,
    nodeVersion: process.version,
    platform: process.platform
});

LogEngine.info('Bot is running and listening for messages...');

/**
 * Start polling for updates
 */
startPolling(bot);

/**
 * Global error handling middleware for Telegram API errors
 * 
 * Catches and handles common Telegram API errors like:
 * - 403: Bot was blocked by user
 * - 400: Chat not found
 * - 429: Too Many Requests
 */
bot.catch(async (error: any, ctx?: BotContext) => {
    LogEngine.error('Telegram Bot Error', {
        error: error.message,
        errorCode: error.response?.error_code,
        description: error.response?.description,
        chatId: ctx?.chat?.id,
        userId: ctx?.from?.id,
        method: error.on?.method,
        payload: error.on?.payload
    });
    
    // Handle specific error types
    if (error.response?.error_code === 403) {
        if (error.response.description?.includes('bot was blocked by the user')) {
            LogEngine.warn('Bot was blocked by user - cleaning up user data', {
                chatId: ctx?.chat?.id,
                userId: ctx?.from?.id
            });
            
            // Clean up blocked user data (solution from GitHub issue #1513)
            if (ctx?.chat?.id) {
                await cleanupBlockedUserGlobal(ctx.chat.id);
            }
            
            return; // Silently skip blocked users
        }
        if (error.response.description?.includes('chat not found')) {
            LogEngine.warn('Chat not found - cleaning up chat data', {
                chatId: ctx?.chat?.id
            });
            
            // Clean up chat that no longer exists
            if (ctx?.chat?.id) {
                await cleanupBlockedUserGlobal(ctx.chat.id);
            }
            
            return;
        }
    }
    
    if (error.response?.error_code === 429) {
        LogEngine.warn('Rate limit exceeded, backing off', {
            chatId: ctx?.chat?.id,
            retryAfter: error.response.parameters?.retry_after
        });
        return;
    }
    
    // For other errors, log but don't crash
    LogEngine.error('Unhandled Telegram error', {
        error: error.message,
        stack: error.stack
    });
});

/**
 * Clean up user data when bot is blocked or chat is not found
 * This implements the fix from GitHub issue telegraf/telegraf#1513
 * Global version for use in error handlers
 * 
 * @param chatId - The chat ID of the blocked user
 */
async function cleanupBlockedUserGlobal(chatId: number): Promise<void> {
    try {
        LogEngine.info('Starting global cleanup for blocked user', { chatId });
        
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

/**
 * Graceful shutdown handler
 * 
 * Properly close database connections, stop webhook consumer, and stop the bot on shutdown
 */
process.on('SIGINT', async () => {
    LogEngine.info('Received SIGINT, shutting down gracefully...');
    try {
        if (webhookConsumer) {
            await webhookConsumer.stop();
            LogEngine.info('Webhook consumer stopped');
        }
        await BotsStore.shutdown();
        LogEngine.info('BotsStore shutdown complete');
        await db.close();
        LogEngine.info('Database connections closed');
        process.exit(0);
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error during shutdown', { error: err.message });
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    LogEngine.info('Received SIGTERM, shutting down gracefully...');
    try {
        if (webhookConsumer) {
            await webhookConsumer.stop();
            LogEngine.info('Webhook consumer stopped');
        }
        await BotsStore.shutdown();
        LogEngine.info('BotsStore shutdown complete');
        await db.close();
        LogEngine.info('Database connections closed');
        process.exit(0);
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error during shutdown', { error: err.message });
        process.exit(1);
    }
});
