/**
 * Main Bot Application Entry Point
 * 
 * This file is the entry point for the Telegram bot application. It handles the bot
 * initialization, configures middleware, sets up command handlers, and starts the bot.
 * 
 * Potential Improvements:
 * - Add more robust error handling
 * - Implement structured logging
 * - Add graceful shutdown hooks
 * - Add configuration validation
 */
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import { createBot, configureCommands, startPolling, safeReply } from './bot.js';
import { startCommand, helpCommand, versionCommand, supportCommand, cancelCommand, resetCommand, processSupportConversation } from './commands/index.js';
import { handleMessage } from './events/message.js';
import { db } from './database/connection.js';
import { BotsStore } from './sdk/bots-brain/index.js';
import { WebhookConsumer } from './sdk/unthread-webhook/index.js';
import { TelegramWebhookHandler } from './handlers/webhookMessage.js';
import packageJSON from '../package.json' with { type: 'json' };
import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * Initialize the bot with the token from environment variables
 * 
 * Possible Bugs:
 * - No validation if TELEGRAM_BOT_TOKEN is missing or invalid
 * - No error handling for bot creation failures
 * 
 * Enhancement Opportunities:
 * - Add environment variable validation
 * - Add fallback mechanisms for missing configuration
 */
const bot = createBot(process.env.TELEGRAM_BOT_TOKEN);

/**
 * Global middleware for logging incoming messages
 * 
 * Possible Bugs:
 * - No error handling if ctx.message is undefined or doesn't have text property
 * - Middleware doesn't handle non-text messages
 * 
 * Enhancement Opportunities:
 * - Add more comprehensive logging for different message types
 * - Add performance metrics collection
 * - Add rate limiting middleware
 * - Add user tracking/analytics
 */
bot.use(async (ctx, next) => {
    try {
        if (ctx.message) {
            // Determine message type
            let messageType = 'text';
            if (ctx.message.photo) messageType = 'photo';
            else if (ctx.message.document) messageType = 'document';
            else if (ctx.message.video) messageType = 'video';
            else if (ctx.message.audio) messageType = 'audio';
            else if (ctx.message.voice) messageType = 'voice';
            else if (ctx.message.video_note) messageType = 'video_note';
            else if (ctx.message.sticker) messageType = 'sticker';
            else if (!ctx.message.text) messageType = 'other';
            
            LogEngine.debug('Message received', {
                chatId: ctx.chat.id,
                userId: ctx.from?.id,
                type: messageType,
                hasText: !!ctx.message.text,
                isCommand: ctx.message.text?.startsWith('/'),
                textPreview: ctx.message.text?.substring(0, 30)
            });
        }
        await next();
    } catch (error) {
        LogEngine.error('Error in bot middleware', {
            error: error.message,
            stack: error.stack,
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
 * 
 * Possible Bugs:
 * - Limited set of commands
 * - No help text for commands
 * 
 * Enhancement Opportunities:
 * - Add more useful commands
 * - Add command categorization
 * - Add dynamic command registration
 * - Implement command access control
 */

// Middleware for command handling with proper chat type support
const commandMiddleware = async (ctx, next) => {
    try {
        // Allow all commands in both private and group chats
        // The individual command handlers will determine the appropriate response
        return await next();
    } catch (error) {
        LogEngine.error('Error in command middleware', {
            error: error.message,
            chatId: ctx.chat?.id,
            command: ctx.message?.text
        });
    }
};

// Wrap command handlers with error handling
const wrapCommandHandler = (handler, commandName) => {
    return async (ctx) => {
        try {
            LogEngine.debug(`Executing ${commandName} command`, {
                chatId: ctx.chat?.id,
                chatType: ctx.chat?.type,
                userId: ctx.from?.id
            });
            await handler(ctx);
        } catch (error) {
            LogEngine.error(`Error in ${commandName} command`, {
                error: error.message,
                stack: error.stack,
                chatId: ctx.chat?.id,
                userId: ctx.from?.id
            });
            
            // Try to send error message safely
            try {
                await safeReply(ctx, `Sorry, there was an error processing the ${commandName} command.`);
            } catch (replyError) {
                LogEngine.error(`Failed to send error reply for ${commandName}`, {
                    error: replyError.message,
                    chatId: ctx.chat?.id
                });
            }
        }
    };
};

bot.start(commandMiddleware, wrapCommandHandler(startCommand, 'start'));
bot.help(commandMiddleware, wrapCommandHandler(helpCommand, 'help'));
bot.command('version', commandMiddleware, wrapCommandHandler(versionCommand, 'version'));
bot.command('support', commandMiddleware, wrapCommandHandler(supportCommand, 'support'));
bot.command('cancel', commandMiddleware, wrapCommandHandler(cancelCommand, 'cancel'));
bot.command('reset', commandMiddleware, wrapCommandHandler(resetCommand, 'reset'));

// Register message handlers
bot.on('message', handleMessage);

// Register callback query handler for buttons
bot.on('callback_query', async (ctx) => {
    try {
        // Route callback queries through the processSupportConversation function
        await processSupportConversation(ctx);
    } catch (error) {
        LogEngine.error('Error handling callback query', {
            error: error.message,
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
    LogEngine.error('Failed to initialize database or storage', {
        error: error.message
    });
    process.exit(1);
}

/**
 * Webhook Consumer and Handler initialization
 * 
 * Initialize the webhook consumer to listen for Unthread events
 * and the handler to process agent messages
 */
let webhookConsumer;
let webhookHandler;

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
    LogEngine.error('Failed to initialize webhook consumer', {
        error: error.message
    });
    // Don't exit - bot can still work for ticket creation without webhook processing
    LogEngine.warn('Bot will continue without webhook processing capabilities');
}

/**
 * Bot initialization and startup
 * 
 * Possible Bugs:
 * - No error handling if bot.telegram.getMe() fails
 * - No retry mechanism for connection issues
 * 
 * Enhancement Opportunities:
 * - Add health check endpoint
 * - Implement proper shutdown mechanism
 * - Add startup status reporting
 * - Consider webhook mode for production
 */
bot.botInfo = await bot.telegram.getMe();
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
 * 
 * Possible Bugs:
 * - No error handling for polling failures
 * - No timeout or retry mechanism for polling
 * 
 * Enhancement Opportunities:
 * - Implement webhook mode for better performance
 * - Add graceful shutdown on SIGINT/SIGTERM
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
bot.catch(async (error, ctx) => {
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
 * @param {number} chatId - The chat ID of the blocked user
 */
async function cleanupBlockedUserGlobal(chatId) {
    try {
        LogEngine.info('Starting global cleanup for blocked user', { chatId });
        
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
        LogEngine.error('Error during shutdown', { error: error.message });
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
        LogEngine.error('Error during shutdown', { error: error.message });
        process.exit(1);
    }
});
