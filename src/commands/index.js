/**
 * Bot Commands Module
 * 
 * This module defines command handlers for the Telegram bot.
 * Each command is exported as a function that can be attached to the bot instance.
 */

import packageJSON from '../../package.json' with { type: 'json' };
import { LogEngine } from '@wgtechlabs/log-engine';
import { Markup } from 'telegraf';
import { BotsStore } from '../sdk/bots-brain/index.js';
import * as unthreadService from '../services/unthread.js';
import { safeReply, safeEditMessageText } from '../bot.js';

// Support form field enum
const SupportField = {
  SUMMARY: 'summary',
  EMAIL: 'email',
  COMPLETE: 'complete'
};

/**
 * Handler for the /start command
 * 
 * This command welcomes the user and provides different information based on chat type.
 * For private chats, it shows bot information. For group chats, it provides support instructions.
 * 
 * @param {object} ctx - The Telegraf context object
 */
const startCommand = async (ctx) => {
    if (ctx.chat.type === 'private') {
        // Private chat - show bot information
        const botInfo = `🤖 **Unthread Support Bot**

**Version:** ${packageJSON.version}
**Developer:** ${packageJSON.author}
**License:** ${packageJSON.license}

**About:**
This bot is designed to help you create support tickets in group chats. It integrates with Unthread to streamline your customer support workflow.

**How to use:**
• Add this bot to your support group chat
• Use \`/support\` command in the group to create tickets
• The bot will guide you through the ticket creation process

**Links:**
• 📚 Documentation: [GitHub Repository](https://github.com/WarenGonzaga/unthread-telegram-bot)
• 🐛 Report Issues: [GitHub Issues](https://github.com/WarenGonzaga/unthread-telegram-bot/issues)
• 💬 Support: Contact through group chat where this bot is added

**Note:** Support ticket creation is only available in group chats, not in private messages.`;

        await safeReply(ctx, botInfo, { parse_mode: 'Markdown' });
    } else {
        // Group chat - show support instructions
        await safeReply(ctx, `Welcome to the support bot! 🎫

Use \`/support\` to create a new support ticket.
Use \`/help\` to see all available commands.`, { parse_mode: 'Markdown' });
    }
};

/**
 * Handler for the /help command
 * 
 * This command shows different help information based on chat type.
 * For private chats, it shows bot information. For group chats, it shows available commands.
 * 
 * @param {object} ctx - The Telegraf context object
 */
const helpCommand = async (ctx) => {
    if (ctx.chat.type === 'private') {
        // Private chat - redirect to bot information
        await startCommand(ctx);
    } else {
        // Group chat - show available commands
        const helpText = `🤖 **Available Commands:**

• \`/start\` - Welcome message and instructions
• \`/help\` - Show this help message  
• \`/version\` - Show bot version information
• \`/support\` - Create a new support ticket
• \`/cancel\` - Cancel ongoing support ticket creation
• \`/reset\` - Reset your support conversation state

**How to create a support ticket:**
1. Use \`/support\` command in this group
2. Provide your issue summary when prompted
3. Provide your email address when prompted
4. The bot will create a ticket and notify you

**Note:** Support tickets can only be created in group chats.`;

        await safeReply(ctx, helpText, { parse_mode: 'Markdown' });
    }
};

/**
 * Handler for the /version command
 * 
 * This command shows the current version of the bot and additional information.
 * 
 * @param {object} ctx - The Telegraf context object
 */
const versionCommand = async (ctx) => {
    try {
        const versionInfo = `🤖 **Bot Information:**

**Version:** ${packageJSON.version}
**Name:** ${packageJSON.name}
**Description:** ${packageJSON.description}
**Developer:** ${packageJSON.author}
**License:** ${packageJSON.license}

**Repository:** [GitHub](https://github.com/WarenGonzaga/unthread-telegram-bot)
**Report Issues:** [GitHub Issues](https://github.com/WarenGonzaga/unthread-telegram-bot/issues)

**Node.js Version:** ${process.version}
**Platform:** ${process.platform}`;

        await safeReply(ctx, versionInfo, { parse_mode: 'Markdown' });
    } catch (error) {
        await safeReply(ctx, 'Error retrieving version information.');
        LogEngine.error('Error in versionCommand', {
            error: error.message,
            stack: error.stack
        });
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
            const privateMessage = `❌ **Support tickets can only be created in group chats.**

🎫 **How to get support:**
1. Add this bot to your support group chat
2. Use \`/support\` command in the group chat
3. Follow the prompts to create your ticket

**Why group chats only?**
This bot is designed for team-based customer support workflows where multiple team members can collaborate on tickets.

**Need help?**
• 📚 Documentation: [GitHub Repository](https://github.com/WarenGonzaga/unthread-telegram-bot)
• 🐛 Report Issues: [GitHub Issues](https://github.com/WarenGonzaga/unthread-telegram-bot/issues)`;

            await safeReply(ctx, privateMessage, { parse_mode: 'Markdown' });
            return;
        }
        
        // Initialize state for this user using BotsStore
        const telegramUserId = ctx.from.id;
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
        await BotsStore.setUserState(telegramUserId, userStateData);
        
        // Ask for the first field
        await safeReply(ctx, "🎫 **Let's create a support ticket!**\n\nPlease provide a brief summary of your issue:", { parse_mode: 'Markdown' });
    } catch (error) {
        LogEngine.error('Error in supportCommand', {
            error: error.message,
            stack: error.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
        await safeReply(ctx, "❌ Sorry, there was an error starting the support ticket process. Please try again later.");
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
        const telegramUserId = ctx.from?.id;
        if (!telegramUserId) {
            return false;
        }
        
        const userState = await BotsStore.getUserState(telegramUserId);
        if (!userState) {
            return false;
        }
        
        // Debug logging to understand the current state
        LogEngine.info('Found active support conversation state', {
            telegramUserId,
            currentField: userState.currentField,
            hasTicket: !!userState.ticket,
            chatType: ctx.chat?.type,
            chatId: ctx.chat?.id
        });

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

        const messageText = ctx.message?.text?.trim() || '';

        // Handle commands in the middle of a conversation
        if (messageText.startsWith('/')) {
            // Allow /cancel to abort the process
            if (messageText === '/cancel') {
                await BotsStore.clearUserState(telegramUserId);
                await safeReply(ctx, "Support ticket creation cancelled.");
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
                await BotsStore.setUserState(telegramUserId, userState);
                
                // Ask for email with skip button
                await safeReply(ctx,
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
        LogEngine.error('Error in processSupportConversation', {
            error: error.message,
            stack: error.stack,
            telegramUserId: ctx.from?.id,
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
        const telegramUserId = ctx.from?.id;
        
        // Check if user wants to skip
        if (messageText.toLowerCase() === 'skip') {
            // Generate email in format {username_id@telegram.user}
            const username = ctx.from.username || 'user';
            userState.ticket.email = `${username}_${telegramUserId}@telegram.user`;
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
        const waitingMsg = await safeReply(ctx, "Creating your support ticket... Please wait.");
        
        try {
            // Step 1: Get or create customer for this group chat
            const customerData = await unthreadService.getOrCreateCustomer(groupChatName, ctx.chat.id);
            const customerId = customerData.id;
            
            // Step 2: Get or create user information  
            const userData = await unthreadService.getOrCreateUser(telegramUserId, username);
            
            // Step 3: Create a ticket with the customer ID and user data
            const ticketResponse = await unthreadService.createTicket({
                groupChatName,
                customerId,
                summary,
                onBehalfOf: userData
            });
            
            // Step 4: Generate success message with ticket ID
            const ticketNumber = ticketResponse.friendlyId;
            const ticketId = ticketResponse.id;
            
            // Create success message
            let successMessage = `🎫 Support Ticket Created Successfully!\n\n` +
                `Ticket #${ticketNumber}\n\n` +
                `Your issue has been submitted and our team will be in touch soon. ` +
                `Reply to this message to add more information to your ticket.`;
            
            // Send the success message
            const confirmationMsg = await safeEditMessageText(
                ctx,
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
                telegramUserId: telegramUserId
            });
            
            // Log successful ticket creation
            LogEngine.info('Support ticket created successfully', {
                ticketNumber,
                ticketId,
                customerId,
                telegramUserId,
                username,
                groupChatName,
                email: userState.ticket.email,
                summaryLength: summary?.length
            });
            
        } catch (error) {
            // Handle API errors
            LogEngine.error('Error creating support ticket', {
                error: error.message,
                stack: error.stack,
                groupChatName,
                telegramUserId,
                username,
                summaryLength: summary?.length
            });
            
            // Update the waiting message with an error
            await safeEditMessageText(
                ctx,
                ctx.chat.id,
                waitingMsg.message_id,
                null,
                `⚠️ Error creating support ticket: ${error.message}. Please try again later.`
            );
        }
        
        // Clear the user's state using BotsStore
        if (telegramUserId) {
            await BotsStore.clearUserState(telegramUserId);
        }
    } catch (error) {
        LogEngine.error('Error in handleEmailField', {
            error: error.message,
            stack: error.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            messageText: messageText?.substring(0, 100) // Log first 100 chars for context
        });
        await safeReply(ctx, "Sorry, there was an error processing your support ticket. Please try again later.");
        
        // Clean up user state using BotsStore
        await BotsStore.clearUserState(ctx.from?.id);
    }
}

export {
    startCommand,
    helpCommand,
    versionCommand,
    supportCommand,
    cancelCommand,
    resetCommand
};

/**
 * Handler for the /cancel command
 * 
 * This command cancels any ongoing support ticket creation process.
 * 
 * @param {object} ctx - The Telegraf context object
 * 
 * Enhancement Opportunities:
 * - Add confirmation dialog before cancelling
 * - Provide reason for cancellation tracking
 */
const cancelCommand = async (ctx) => {
    try {
        const telegramUserId = ctx.from?.id;
        if (!telegramUserId) {
            await safeReply(ctx, "Unable to process cancel request.");
            return;
        }

        // Check if user has an active support ticket conversation
        const userState = await BotsStore.getUserState(telegramUserId);
        
        if (!userState) {
            await safeReply(ctx, "❌ No active support ticket creation process to cancel.");
            return;
        }

        // Clear the user's state
        await BotsStore.clearUserState(telegramUserId);
        
        await safeReply(ctx, "✅ Support ticket creation has been cancelled.");
        
        LogEngine.info('Support ticket creation cancelled by user', {
            telegramUserId,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            currentField: userState.currentField
        });
        
    } catch (error) {
        LogEngine.error('Error in cancelCommand', {
            error: error.message,
            stack: error.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id
        });
        await safeReply(ctx, "Sorry, there was an error cancelling the support ticket process.");
    }
};

/**
 * Resets the user's support conversation state (for debugging)
 * 
 * @param {object} ctx - The Telegraf context object
 */
const resetCommand = async (ctx) => {
    try {
        const telegramUserId = ctx.from?.id;
        if (!telegramUserId) {
            await safeReply(ctx, "Error: Unable to identify user.");
            return;
        }
        
        const userState = await BotsStore.getUserState(telegramUserId);
        if (userState) {
            await BotsStore.clearUserState(telegramUserId);
            await safeReply(ctx, "✅ Your support conversation state has been reset.");
            LogEngine.info('User state cleared via reset command', { telegramUserId });
        } else {
            await safeReply(ctx, "ℹ️ No active support conversation state found.");
        }
    } catch (error) {
        LogEngine.error('Error in resetCommand', {
            error: error.message,
            telegramUserId: ctx.from?.id
        });
        await safeReply(ctx, "❌ Error resetting state. Please try again.");
    }
};