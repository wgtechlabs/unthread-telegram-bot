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

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get directory path for importing package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    ctx.reply('Available commands:\n/start - Start the bot\n/help - Show this help message\n/version - Show the bot version');
};

/**
 * Handler for the /version command
 * 
 * This command shows the current version of the bot from package.json.
 * 
 * @param {object} ctx - The Telegraf context object
 * 
 * Possible Bugs:
 * - Error handling if package.json doesn't exist or has no version
 * 
 * Enhancement Opportunities:
 * - Add more version-related information such as release date or changelog
 * - Include git commit information if available
 * - Add link to GitHub repository
 */
const versionCommand = (ctx) => {
    try {
        // Read package.json from project root (2 levels up from commands folder)
        const packagePath = resolve(__dirname, '../../package.json');
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
        ctx.reply(`Bot version: ${packageJson.version}`);
    } catch (error) {
        ctx.reply('Error retrieving version information.');
        console.error('Error in versionCommand:', error);
    }
};

export {
    startCommand,
    helpCommand,
    versionCommand,
};