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

import packageJSON from '../../package.json' with { type: 'json' };
import * as logger from '../utils/logger.js';

// Store user conversation states
const userStates = new Map();

// Support form field enum
const SupportField = {
  TITLE: 'title',
  DETAILS: 'details',
  EMAIL: 'email',
  COMPLETE: 'complete'
};

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
    ctx.reply('Available commands:\n/start - Start the bot\n/help - Show this help message\n/version - Show the bot version\n/support - Create a support ticket');
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
        ctx.reply(`Bot version: ${packageJSON.version}`);
    } catch (error) {
        ctx.reply('Error retrieving version information.');
        console.error('Error in versionCommand:', error);
    }
};

/**
 * Initializes a support ticket conversation
 * 
 * @param {object} ctx - The Telegraf context object
 */
const supportCommand = async (ctx) => {
    try {
        // Initialize state for this user
        const userId = ctx.from.id;
        userStates.set(userId, {
            currentField: SupportField.TITLE,
            ticket: {
                title: '',
                details: '',
                email: '',
                name: ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
                company: ctx.chat && ctx.chat.type !== 'private' ? ctx.chat.title : 'Individual Support'
            }
        });

        // Log the support ticket creation
        logger.info(`User ${ctx.from.username || ctx.from.id} started a support ticket in ${userStates.get(userId).ticket.company}`);
        
        // Ask for the first field
        await ctx.reply("Let's create a support ticket. Please provide the following information:");
        await ctx.reply("Title:");
    } catch (error) {
        logger.error(`Error in supportCommand: ${error.message}`);
        await ctx.reply("Sorry, there was an error starting the support ticket process. Please try again later.");
    }
};

/**
 * Processes a message in the context of an ongoing support ticket conversation
 * 
 * @param {object} ctx - The Telegraf context object
 * @returns {boolean} - True if the message was processed as part of a support conversation
 */
export const processSupportConversation = async (ctx) => {
    try {
        // Check if this user has an active support ticket conversation
        const userId = ctx.from?.id;
        if (!userId || !userStates.has(userId) || !ctx.message?.text) {
            return false;
        }

        const userState = userStates.get(userId);
        const messageText = ctx.message.text.trim();

        // Handle commands in the middle of a conversation
        if (messageText.startsWith('/')) {
            // Allow /cancel to abort the process
            if (messageText === '/cancel') {
                userStates.delete(userId);
                await ctx.reply("Support ticket creation cancelled.");
                return true;
            }
            // Let other commands pass through
            return false;
        }

        // Update the current field and move to the next one
        switch (userState.currentField) {
            case SupportField.TITLE:
                userState.ticket.title = messageText;
                userState.currentField = SupportField.DETAILS;
                await ctx.reply("Details:");
                break;
                
            case SupportField.DETAILS:
                userState.ticket.details = messageText;
                userState.currentField = SupportField.EMAIL;
                await ctx.reply("Email (optional, type 'skip' to leave blank):");
                break;
                
            case SupportField.EMAIL:
                if (messageText.toLowerCase() !== 'skip') {
                    userState.ticket.email = messageText;
                }
                userState.currentField = SupportField.COMPLETE;
                
                // Generate and show the preview
                const ticket = userState.ticket;
                const previewMessage = `📩 Support Ticket Preview\n\n` +
                    `📋 Title: ${ticket.title}\n\n` +
                    `📝 Details: ${ticket.details}\n\n` +
                    `👤 Name: ${ticket.name}\n` +
                    `🏢 Company: ${ticket.company}\n` +
                    `${ticket.email ? `📧 Email: ${ticket.email}\n` : ''}` +
                    `\nReady to submit? Type 'yes' to confirm or 'no' to cancel.`;
                
                await ctx.reply(previewMessage);
                break;
                
            case SupportField.COMPLETE:
                if (messageText.toLowerCase() === 'yes') {
                    // Submit the ticket (this would connect to the Unthread API)
                    await ctx.reply("Thank you! Your support ticket has been submitted.");
                    logger.info(`Support ticket submitted by ${userState.ticket.name}: ${userState.ticket.title}`);
                    // Here you would add code to actually submit to Unthread
                } else {
                    await ctx.reply("Support ticket creation cancelled.");
                }
                // Clear the state regardless of the answer
                userStates.delete(userId);
                break;
        }
        
        // We handled this message as part of a support conversation
        return true;
        
    } catch (error) {
        logger.error(`Error in processSupportConversation: ${error.message}`);
        return false;
    }
};

export {
    startCommand,
    helpCommand,
    versionCommand,
    supportCommand,
};