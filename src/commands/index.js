/**
 * Bot Commands Module
 * 
 * This module defines command handlers for the Telegram bot.
 * Each command is exported as a function that can be attached to the bot instance.
 */

import packageJSON from '../../package.json' with { type: 'json' };
import * as logger from '../utils/logger.js';
import { Markup } from 'telegraf';
import { BotsStore } from '../sdk/bots-brain/index.js';
import * as unthreadService from '../services/unthread.js';

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
        // Only allow support tickets in group chats
        if (ctx.chat.type === 'private') {
            await ctx.reply("Support tickets can only be created in group chats.");
            return;
        }
        
        // Initialize state for this user using BotsStore
        const userId = ctx.from.id;
        const userStateData = {
            currentField: SupportField.SUMMARY,
            ticket: {
                summary: '',
                email: '',
                name: ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
                company: ctx.chat && ctx.chat.type !== 'private' ? ctx.chat.title : 'Individual Support',
                chatId: ctx.chat.id
            }
        };
        
        // Store user state using BotsStore
        await BotsStore.setUserState(userId, userStateData);
        
        // Ask for the first field
        await ctx.reply("Let's create a support ticket. Please provide your issue summary:");
    } catch (error) {
        logger.error('Error in supportCommand', {
            error: error.message,
            stack: error.stack,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
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
        if (!userId) {
            return false;
        }
        
        const userState = await BotsStore.getUserState(userId);
        if (!userState) {
            return false;
        }

        // Handle callback queries (button clicks)
        if (ctx.callbackQuery) {
            if (ctx.callbackQuery.data === 'skip_email') {
                if (userState.currentField === SupportField.EMAIL) {
                    // Process as if user typed "skip"
                    await handleEmailField(ctx, userState, 'skip');
                }
            }
            // Answer the callback query to remove the "loading" state of the button
            await ctx.answerCbQuery();
            // Important: We need to return true here to indicate we handled the callback
            return true;
        }

        // Require text message for normal processing
        if (!ctx.message?.text) {
            return false;
        }

        const messageText = ctx.message.text.trim();

        // Handle commands in the middle of a conversation
        if (messageText.startsWith('/')) {
            // Allow /cancel to abort the process
            if (messageText === '/cancel') {
                await BotsStore.clearUserState(userId);
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
                
                // Update user state in BotsStore
                await BotsStore.setUserState(userId, userState);
                
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
        logger.error('Error in processSupportConversation', {
            error: error.message,
            stack: error.stack,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            hasMessage: !!ctx.message,
            isCallbackQuery: !!ctx.callbackQuery
        });
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
    try {
        const userId = ctx.from?.id;
        
        // Check if user wants to skip
        if (messageText.toLowerCase() === 'skip') {
            // Generate email in format {username_id@telegram.user}
            const username = ctx.from.username || 'user';
            userState.ticket.email = `${username}_${userId}@telegram.user`;
        } else {
            userState.ticket.email = messageText;
        }
        
        // Mark the ticket as complete
        userState.currentField = SupportField.COMPLETE;
        
        // Get necessary information for ticket creation
        const groupChatName = ctx.chat.title;
        const username = ctx.from.username;
        const summary = userState.ticket.summary;
        
        // Send a waiting message
        const waitingMsg = await ctx.reply("Creating your support ticket... Please wait.");
        
        try {
            // Step 1: Get or create customer using bots-brain SDK (handles cache hierarchy internally)
            const customer = await BotsStore.getOrCreateCustomer(
                ctx.chat.id,
                groupChatName,
                (chatTitle) => unthreadService.createCustomer(chatTitle)
            );
            
            const customerId = customer.unthreadCustomerId;
            
            logger.debug('Customer resolved via bots-brain SDK', {
                customerId,
                chatId: ctx.chat.id,
                groupChatName,
                fromCache: !!customer.storedAt
            });
            
            // Step 2: Create a ticket with the customer ID
            const ticketResponse = await unthreadService.createTicket({
                groupChatName,
                customerId,
                summary,
                username,
                userId
            });
            
            // Step 3: Generate success message with ticket ID
            const ticketNumber = ticketResponse.friendlyId;
            const ticketId = ticketResponse.id;
            
            // Create success message
            const successMessage = `🎫 Support Ticket Created Successfully!\n\n` +
                `Ticket #${ticketNumber}\n\n` +
                `Your issue has been submitted and our team will be in touch soon. ` +
                `Reply to this message to add more information to your ticket.`;
            
            // Send the success message
            const confirmationMsg = await ctx.telegram.editMessageText(
                ctx.chat.id, 
                waitingMsg.message_id, 
                null, 
                successMessage
            );
            
            // Register this confirmation message so we can track replies to it
            await unthreadService.registerTicketConfirmation({
                messageId: confirmationMsg.message_id,
                ticketId: ticketId,
                friendlyId: ticketNumber,
                customerId: customerId,
                chatId: ctx.chat.id,
                userId: userId
            });
            
            // Log successful ticket creation
            logger.success('Support ticket created successfully', {
                ticketNumber,
                ticketId,
                customerId,
                userId,
                username,
                groupChatName,
                email: userState.ticket.email,
                summaryLength: summary?.length
            });
            
        } catch (error) {
            // Handle API errors
            logger.error('Error creating support ticket', {
                error: error.message,
                stack: error.stack,
                groupChatName,
                userId,
                username,
                summaryLength: summary?.length
            });
            
            // Update the waiting message with an error
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `⚠️ Error creating support ticket: ${error.message}. Please try again later.`
            );
        }
        
        // Clear the user's state using BotsStore
        if (userId) {
            await BotsStore.clearUserState(userId);
        }
    } catch (error) {
        logger.error('Error in handleEmailField', {
            error: error.message,
            stack: error.stack,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            messageText: messageText?.substring(0, 100) // Log first 100 chars for context
        });
        await ctx.reply("Sorry, there was an error processing your support ticket. Please try again later.");
        
        // Clean up user state using BotsStore
        await BotsStore.clearUserState(ctx.from?.id);
    }
}

export {
    startCommand,
    helpCommand,
    versionCommand,
    supportCommand,
};