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
import { Telegraf } from 'telegraf';

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