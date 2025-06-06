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

import { createBot, configureCommands, startPolling } from './bot.js';
import { startCommand, helpCommand, versionCommand, supportCommand, processSupportConversation } from './commands/index.js';
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
    if (ctx.message) {
        LogEngine.debug('Message received', {
            chatId: ctx.chat.id,
            userId: ctx.from?.id,
            type: ctx.message.text ? 'text' : 'media'
        });
    }
    await next();
});

/**
 * Command handler registration
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
bot.start(startCommand);
bot.help(helpCommand);
bot.command('version', versionCommand);
bot.command('support', supportCommand);

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
