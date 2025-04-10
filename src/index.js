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
import { createBot, configureCommands, onText, startPolling } from './bot.js';
import { startCommand, helpCommand, versionCommand } from './commands/index.js';
import packageJSON from '../package.json' with { type: 'json' };
import * as logger from './utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

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
    logger.info(`Received a message: ${ctx.message.text}`);
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

// Text pattern handlers section
/**
 * Add any text handlers if needed
 * Example: onText(bot, /some pattern/, (ctx) => { "handler" });
 * 
 * Enhancement Opportunities:
 * - Add natural language processing capabilities
 * - Implement conversation flows
 * - Add AI-powered responses
 */
// onText(bot, /some pattern/, (ctx) => { /* handler */ });

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
logger.info(`Bot started with username: @${bot.botInfo.username}`);
logger.info(`Bot version: ${packageJSON.version}`);
logger.info(`Bot ID: ${bot.botInfo.id}`);
logger.info('Bot is running...');
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
