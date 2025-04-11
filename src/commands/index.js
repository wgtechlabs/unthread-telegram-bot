/**
 * Bot Commands Module
 * 
 * This module defines command handlers for the Telegram bot.
 * Each command is exported as a function that can be attached to the bot instance.
 */

import packageJSON from '../../package.json' with { type: 'json' };
import * as logger from '../utils/logger.js';
import { Markup } from 'telegraf';

// Store user conversation states
const userStates = new Map();

// Support form field enum
const SupportField = {
  SUMMARY: 'summary',
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
            currentField: SupportField.SUMMARY,
            ticket: {
                summary: '',
                email: '',
                name: ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
                company: ctx.chat && ctx.chat.type !== 'private' ? ctx.chat.title : 'Individual Support'
            }
        });
        
        // Ask for the first field
        await ctx.reply("Let's create a support ticket. Please provide your issue summary:");
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
        if (!userId || !userStates.has(userId)) {
            return false;
        }

        // Handle callback queries (button clicks)
        if (ctx.callbackQuery) {
            if (ctx.callbackQuery.data === 'skip_email') {
                const userState = userStates.get(userId);
                if (userState.currentField === SupportField.EMAIL) {
                    // Process as if user typed "skip"
                    await handleEmailField(ctx, userState, 'skip');
                    // Answer the callback query to remove the "loading" state of the button
                    await ctx.answerCbQuery();
                    return true;
                }
            }
            // Important: We need to return true here to indicate we handled the callback
            return true;
        }

        // Require text message for normal processing
        if (!ctx.message?.text) {
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
            case SupportField.SUMMARY:
                userState.ticket.summary = messageText;
                userState.currentField = SupportField.EMAIL;
                
                // Ask for email with skip button
                await ctx.reply(
                    "Please provide your email address or skip this step:",
                    Markup.inlineKeyboard([
                        Markup.button.callback('Skip', 'skip_email')
                    ])
                );
                break;
                
            case SupportField.EMAIL:
                await handleEmailField(ctx, userState, messageText);
                break;
        }
        
        // We handled this message as part of a support conversation
        return true;
        
    } catch (error) {
        logger.error(`Error in processSupportConversation: ${error.message}`);
        return false;
    }
};

/**
 * Handles the email field input and completes the ticket process
 * 
 * @param {object} ctx - The Telegraf context object
 * @param {object} userState - The user's conversation state
 * @param {string} messageText - The text message from the user
 */
async function handleEmailField(ctx, userState, messageText) {
    const userId = ctx.from?.id;
    
    // Check if user wants to skip
    if (messageText.toLowerCase() === 'skip') {
        // Generate email in format {username_id@telegram.user}
        const username = ctx.from.username || 'user';
        userState.ticket.email = `${username}_${userId}@telegram.user`;
    } else {
        userState.ticket.email = messageText;
    }
    
    // Complete the ticket process
    userState.currentField = SupportField.COMPLETE;
    
    // Get the chat name
    const chatName = ctx.chat.type !== 'private' ? ctx.chat.title : 'Individual Support';
    
    // Generate ticket title in format [Telegram Ticket] {group chat name}
    const ticketTitle = `[Telegram Ticket] ${chatName}`;
    
    // Generate customer name in format [Telegram] {group chat name}
    const customerName = `[Telegram] ${chatName}`;
    
    // Generate the ticket information
    const ticket = userState.ticket;
    const ticketMessage = `📩 Support Ticket Created\n\n` +
        `🎫 Title: ${ticketTitle}\n\n` +
        `📝 Summary: ${ticket.summary}\n\n` +
        `👤 From: ${ticket.name}\n` +
        `👥 Customer: ${customerName}\n` +
        `📧 Email: ${ticket.email}`;
    
    await ctx.reply(ticketMessage);
    
    // Clear the user's state
    if (userId) {
        userStates.delete(userId);
    }
}

export {
    startCommand,
    helpCommand,
    versionCommand,
    supportCommand,
};