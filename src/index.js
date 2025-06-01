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
import { handleMessage, registerTextPattern } from './events/message.js';
import packageJSON from '../package.json' with { type: 'json' };
import * as logger from './utils/logger.js';

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
    if (ctx.message && ctx.message.text) {
        logger.debug('Received text message', {
            messageId: ctx.message.message_id,
            chatId: ctx.chat.id,
            chatType: ctx.chat.type,
            chatTitle: ctx.chat.title,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            firstName: ctx.from?.first_name,
            messageLength: ctx.message.text.length,
            isCommand: ctx.message.text.startsWith('/'),
            isReply: !!ctx.message.reply_to_message
        });
    } else if (ctx.message) {
        logger.debug('Received non-text message', {
            messageId: ctx.message.message_id,
            chatId: ctx.chat.id,
            chatType: ctx.chat.type,
            chatTitle: ctx.chat.title,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            messageType: Object.keys(ctx.message).find(key => 
                ['photo', 'document', 'sticker', 'video', 'audio', 'voice', 'animation'].includes(key)
            ) || 'unknown'
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

/**
 * Register pattern-based message handlers
 * 
 * Use the registerTextPattern function from events/message.js to register
 * handlers for specific message patterns.
 * 
 * Example:
 * registerTextPattern(/hello/i, (ctx) => ctx.reply('Hello there!'));
 */
// Add your pattern-based message handlers here

// Register message handlers
bot.on('message', handleMessage);

// Register callback query handler for buttons
bot.on('callback_query', async (ctx) => {
    try {
        // Route callback queries through the processSupportConversation function
        await processSupportConversation(ctx);
    } catch (error) {
        logger.error('Error handling callback query', {
            error: error.message,
            stack: error.stack,
            callbackData: ctx.callbackQuery?.data,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id
        });
    }
});

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
logger.success('Bot initialized successfully', {
    username: bot.botInfo.username,
    botId: bot.botInfo.id,
    version: packageJSON.version,
    nodeVersion: process.version,
    platform: process.platform
});
logger.info('Bot is running and listening for messages...');
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
