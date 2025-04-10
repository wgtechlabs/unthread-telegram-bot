/**
 * Bot Commands Module
 * 
 * This module defines command handlers for the Telegram bot.
 * Each command is exported as a function that can be attached to the bot instance.
 * 
 * Potential Improvements:
 * - Add more useful commands
 * - Organize commands by category
 * - Add command argument validation
 * - Implement interactive commands with inline keyboards
 */

/**
 * Handler for the /start command
 * 
 * This command welcomes the user and provides basic instructions.
 * 
 * @param {object} ctx - The Telegraf context object
 * 
 * Possible Bugs:
 * - No personalization for different users
 * - No tracking of new users
 * 
 * Enhancement Opportunities:
 * - Add personalized welcome message with user's name
 * - Add onboarding flow for new users
 * - Store user information for future interactions
 * - Add rich media (images, buttons) to the welcome message
 */
const startCommand = (ctx) => {
    ctx.reply('Welcome! Use /help to see available commands.');
};

/**
 * Handler for the /help command
 * 
 * This command shows a list of available commands and their descriptions.
 * 
 * @param {object} ctx - The Telegraf context object
 * 
 * Possible Bugs:
 * - Manual maintenance of command list can get out of sync with actual commands
 * - No categorization or organization of commands
 * 
 * Enhancement Opportunities:
 * - Dynamically generate command list based on registered commands
 * - Add command categories
 * - Add examples of how to use commands
 * - Add inline keyboard buttons for command selection
 * - Add pagination for large command lists
 */
const helpCommand = (ctx) => {
    ctx.reply('Available commands:\n/start - Start the bot\n/help - Show this help message');
};

export {
    startCommand,
    helpCommand,
};