/**
 * Unthread Telegram Bot - Command Handlers Module
 * 
 * Defines and implements all bot command handlers for user interactions with the
 * Unthread Telegram Bot. Each command provides specific functionality for ticket
 * management, user support, and bot information.
 * 
 * Available Commands:
 * - /start: Welcome message and bot introduction
 * - /help: Display available commands and usage instructions
 * - /support: Initiate support ticket creation with form collection
 * - /version: Show bot version and build information
 * - /about: Display detailed bot information and capabilities
 * - /cancel: Cancel ongoing support form or operation
 * - /reset: Reset user conversation state and clear form data
 * 
 * Support Flow:
 * - Multi-step form collection (summary, email)
 * - State persistence using Bots Brain unified storage
 * - Automatic ticket creation in Unthread platform
 * - Real-time validation and error handling
 * 
 * Features:
 * - Context-aware responses for different chat types
 * - Form validation with email format checking
 * - Conversation state management and cleanup * - Integration with Unthread API for ticket creation
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import packageJSON from '../../package.json' with { type: 'json' };
import { LogEngine } from '@wgtechlabs/log-engine';
import { Markup } from 'telegraf';
import * as unthreadService from '../services/unthread.js';
import { safeReply, safeEditMessageText } from '../bot.js';
import type { BotContext, SupportField, SupportFormState } from '../types/index.js';
import { BotsStore } from '../sdk/bots-brain/index.js';

// Support form field enum
const SupportFieldEnum = {
  SUMMARY: 'summary' as const,
  EMAIL: 'email' as const,
  COMPLETE: 'complete' as const
};

/**
 * Handler for the /start command
 * 
 * This command welcomes the user and provides different information based on chat type.
 * For private chats, it shows bot information. For group chats, it provides support instructions.
 */
const startCommand = async (ctx: BotContext): Promise<void> => {
    if (ctx.chat?.type === 'private') {
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
• 📚 Documentation: [GitHub Repository](https://github.com/wgtechlabs/unthread-telegram-bot)
• 🐛 Report Issues: [GitHub Issues](https://github.com/wgtechlabs/unthread-telegram-bot/issues)
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
 * This command shows available commands and usage information for both private and group chats.
 */
const helpCommand = async (ctx: BotContext): Promise<void> => {
    const helpText = `🤖 **Available Commands:**

• \`/start\` - Welcome message and instructions
• \`/help\` - Show this help message  
• \`/version\` - Show bot version information
• \`/about\` - Show comprehensive bot information
• \`/support\` - Create a new support ticket
• \`/cancel\` - Cancel ongoing support ticket creation
• \`/reset\` - Reset your support conversation state

**How to create a support ticket:**
1. Use \`/support\` command in a group chat
2. Provide your issue summary when prompted
3. Provide your email address when prompted
4. The bot will create a ticket and notify you

**Note:** Support tickets can only be created in group chats.`;

    await safeReply(ctx, helpText, { parse_mode: 'Markdown' });
};

/**
 * Handler for the /version command
 * 
 * This command shows the current version of the bot and additional information.
 */
const versionCommand = async (ctx: BotContext): Promise<void> => {
    try {
        const versionInfo = `💜 **Unthread Telegram Bot**
*Ticketing support for customers and partners—right in Telegram.*

**Version:** ${packageJSON.version}
**Developer:** Waren Gonzaga, WG Technology Labs
**License:** ${packageJSON.license}

**Repository:** [GitHub](https://github.com/wgtechlabs/unthread-telegram-bot)
**Report Issues:** [GitHub Issues](https://github.com/wgtechlabs/unthread-telegram-bot/issues)

**Runtime Information:**
• Node.js Version: ${process.version}
• Platform: ${process.platform}
• Bot Name: ${packageJSON.name}`;

        await safeReply(ctx, versionInfo, { parse_mode: 'Markdown' });
    } catch (error) {
        const err = error as Error;
        await safeReply(ctx, 'Error retrieving version information.');
        LogEngine.error('Error in versionCommand', {
            error: err.message,
            stack: err.stack
        });
    }
};

/**
 * Handler for the /about command
 * 
 * This command shows comprehensive information about the Unthread Telegram Bot.
 */
const aboutCommand = async (ctx: BotContext): Promise<void> => {
    try {
        const aboutText = `💜 **Unthread Telegram Bot**
*Ticketing support for customers and partners—right in Telegram.*

**Version:** ${packageJSON.version}
**Developer:** Waren Gonzaga, WG Technology Labs
**License:** ${packageJSON.license}

**Overview:**
Enable customers and business partners to open support tickets directly within Telegram group chats. This bot connects to your Unthread dashboard, ensuring real-time updates, threaded discussions, and smooth issue tracking.

**How it works:**

1. Add to a Telegram group
2. Run \`/support\`
3. Follow the guided prompts

**Links:**
• [GitHub Repo](https://github.com/wgtechlabs/unthread-telegram-bot)
• [Issue Tracker](https://github.com/wgtechlabs/unthread-telegram-bot/issues)

⚠️ **Group chats only** — DMs not supported.`;

        await safeReply(ctx, aboutText, { parse_mode: 'Markdown' });
    } catch (error) {
        const err = error as Error;
        await safeReply(ctx, 'Error retrieving about information.');
        LogEngine.error('Error in aboutCommand', {
            error: err.message,
            stack: err.stack
        });
    }
};

/**
 * Initializes a support ticket conversation
 */
const supportCommand = async (ctx: BotContext): Promise<void> => {
    try {
        // Only allow support tickets in group chats
        if (ctx.chat?.type === 'private') {
            const privateMessage = `❌ **Support tickets can only be created in group chats.**

🎫 **How to get support:**
1. Add this bot to your support group chat
2. Use \`/support\` command in the group chat
3. Follow the prompts to create your ticket

**Why group chats only?**
This bot is designed for team-based customer support workflows where multiple team members can collaborate on tickets.

**Need help?**
• 📚 Documentation: [GitHub Repository](https://github.com/wgtechlabs/unthread-telegram-bot)
• 🐛 Report Issues: [GitHub Issues](https://github.com/wgtechlabs/unthread-telegram-bot/issues)`;

            await safeReply(ctx, privateMessage, { parse_mode: 'Markdown' });
            return;
        }
        
        if (!ctx.from || !ctx.chat) {
            await safeReply(ctx, "❌ Error: Unable to identify user or chat.");
            return;
        }
        
        // Initialize state for this user using BotsStore
        const telegramUserId = ctx.from.id;
        const chatTitle = 'title' in ctx.chat ? ctx.chat.title : 'Group Chat';
        const userStateData: SupportFormState & { ticket: any; messageIds?: number[] } = {
            field: SupportFieldEnum.SUMMARY as SupportField,
            initiatedBy: telegramUserId, // Track who initiated the support request
            initiatedInChat: ctx.chat.id, // Track which chat the support was initiated in
            messageIds: [], // Store message IDs to edit later
            ticket: {
                summary: '',
                email: '',
                name: ctx.from.username || `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
                company: chatTitle,
                chatId: ctx.chat.id
            }
        };
        
        // Store user state using BotsStore
        await BotsStore.setUserState(telegramUserId, userStateData);
        
        // Ask for the first field and store the message ID
        const summaryMessage = await safeReply(ctx, `🎫 **Let's create a support ticket!**\n\n<b>${ctx.from.first_name || ctx.from.username}</b>, please provide a brief summary of your issue:`, { parse_mode: 'HTML' });
        
        // Store the message ID for later editing
        if (summaryMessage) {
            userStateData.messageIds = [summaryMessage.message_id];
            await BotsStore.setUserState(telegramUserId, userStateData);
        }
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in supportCommand', {
            error: err.message,
            stack: err.stack,
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
 * @returns True if the message was processed as part of a support conversation
 */
export const processSupportConversation = async (ctx: BotContext): Promise<boolean> => {
    try {
        // Check if this user has an active support ticket conversation
        const telegramUserId = ctx.from?.id;
        if (!telegramUserId) {
            LogEngine.debug('No telegram user ID found in processSupportConversation');
            return false;
        }
        
        LogEngine.debug('processSupportConversation called', {
            telegramUserId,
            chatId: ctx.chat?.id,
            hasMessage: !!ctx.message,
            messageText: ctx.message && 'text' in ctx.message ? ctx.message.text : 'no text'
        });
        
        const userState = await BotsStore.getUserState(telegramUserId);
        
        LogEngine.debug('User state retrieval result', {
            telegramUserId,
            hasUserState: !!userState,
            userState: userState ? JSON.stringify(userState) : 'null'
        });
        
        if (!userState) {
            LogEngine.debug('No user state found, returning false');
            return false;
        }
        
        LogEngine.debug('Found active support conversation', {
            telegramUserId,
            currentField: userState.currentField || userState.field,
            chatId: ctx.chat?.id
        });
        
        // Check if there's any active support conversation in this chat
        const chatId = ctx.chat?.id;
        if (chatId && !userState) {
            // No active support conversation for this user
            return false;
        }
        
        // Check if this message is from the user who initiated the support request
        // and in the same chat where it was initiated
        if (userState && userState.initiatedBy && userState.initiatedBy !== telegramUserId) {
            // This message is from a different user, ignore it silently
            LogEngine.debug('Ignoring message from different user during support flow', {
                messageFrom: telegramUserId,
                supportInitiatedBy: userState.initiatedBy,
                chatId: ctx.chat?.id
            });
            return false;
        }
        
        if (userState && userState.initiatedInChat && userState.initiatedInChat !== ctx.chat?.id) {
            // This message is from a different chat, ignore it
            LogEngine.debug('Ignoring message from different chat during support flow', {
                messageFromChat: ctx.chat?.id,
                supportInitiatedInChat: userState.initiatedInChat,
                userId: telegramUserId
            });
            return false;
        }
        
        // Debug logging to understand the current state
        LogEngine.info('Found active support conversation state', {
            telegramUserId,
            currentField: userState.currentField || userState.field,
            hasTicket: !!userState.ticket,
            chatType: ctx.chat?.type,
            chatId: ctx.chat?.id
        });

        // Handle callback queries (button clicks)
        if (ctx.callbackQuery) {
            if ('data' in ctx.callbackQuery) {
                const callbackData = ctx.callbackQuery.data;
                
                if (callbackData === 'skip_email') {
                    if ((userState.currentField || userState.field) === SupportFieldEnum.EMAIL) {
                        // Edit the message to remove buttons first
                        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
                            await safeEditMessageText(
                                ctx,
                                ctx.chat!.id,
                                ctx.callbackQuery.message.message_id,
                                undefined,
                                `📧 **Email skipped** - We'll use an auto-generated email for your ticket.`,
                                { parse_mode: 'Markdown' }
                            );
                        }
                        
                        // Process as if user typed "skip"
                        await handleEmailField(ctx, userState, 'skip');
                    }
                } else if (callbackData === 'confirm_summary') {
                    // User confirmed the summary, move to email field
                    userState.currentField = SupportFieldEnum.EMAIL;
                    userState.field = SupportFieldEnum.EMAIL;
                    
                    // Update user state in BotsStore
                    await BotsStore.setUserState(telegramUserId, userState);
                    
                    // Edit the confirmation message to remove buttons and show confirmation
                    if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
                        await safeEditMessageText(
                            ctx,
                            ctx.chat!.id,
                            ctx.callbackQuery.message.message_id,
                            undefined,
                            `✅ **Summary Confirmed!**\n\n━━━━━━━━━━━━━━\n"${userState.ticket.summary}"\n━━━━━━━━━━━━━━`,
                            { parse_mode: 'Markdown' }
                        );
                    }
                    
                    // Ask for email with skip button
                    await safeReply(ctx,
                        "📧 **Now let's get your contact information.**\n\nPlease provide your email address or skip this step:",
                        {
                            parse_mode: 'Markdown',
                            ...Markup.inlineKeyboard([
                                Markup.button.callback('Skip Email', 'skip_email')
                            ])
                        }
                    );
                } else if (callbackData === 'revise_summary') {
                    // User wants to revise the summary, ask again
                    
                    // Edit the confirmation message to remove buttons
                    if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
                        await safeEditMessageText(
                            ctx,
                            ctx.chat!.id,
                            ctx.callbackQuery.message.message_id,
                            undefined,
                            `📝 **Please provide a revised description of your issue.**\n\nInclude any additional details that might help our team understand and resolve your problem:`,
                            { parse_mode: 'Markdown' }
                        );
                    }
                    
                    // Clear the existing summary so they can provide a new one
                    userState.ticket.summary = '';
                    // Reset the field to SUMMARY so user can provide a new summary
                    userState.currentField = SupportFieldEnum.SUMMARY;
                    userState.field = SupportFieldEnum.SUMMARY;
                    await BotsStore.setUserState(telegramUserId, userState);
                }
            }
            // Answer the callback query to remove the "loading" state of the button
            await ctx.answerCbQuery();
            // Important: We need to return true here to indicate we handled the callback
            return true;
        }

        // If we reach here but there's no message (e.g., callback query without message), return false
        if (!ctx.message) {
            return false;
        }

        // Require text message for normal processing
        if (!('text' in ctx.message) || !ctx.message.text) {
            return false;
        }

        const messageText = ctx.message.text.trim();

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
        const currentField = userState.currentField || userState.field;
        
        switch (currentField) {
            case SupportFieldEnum.SUMMARY: {
                // Check if user already provided a summary and is waiting for confirmation
                if (userState.ticket.summary && userState.ticket.summary.trim() !== '') {
                    // Check if user is trying to confirm or revise via text
                    const lowerText = messageText.toLowerCase().trim();
                    if (lowerText === 'confirm' || lowerText === 'yes' || lowerText === 'proceed') {
                        // User confirmed via text, move to email field
                        userState.currentField = SupportFieldEnum.EMAIL;
                        userState.field = SupportFieldEnum.EMAIL;
                        
                        await BotsStore.setUserState(telegramUserId, userState);
                        
                        const emailMessage = await safeReply(ctx,
                            "📧 **Now let's get your contact information.**\n\nPlease provide your email address or skip this step:",
                            {
                                parse_mode: 'Markdown',
                                ...Markup.inlineKeyboard([
                                    Markup.button.callback('Skip Email', 'skip_email')
                                ])
                            }
                        );
                        
                        // Store the email message ID for later editing
                        if (emailMessage && userState.messageIds) {
                            userState.messageIds.push(emailMessage.message_id);
                            await BotsStore.setUserState(telegramUserId, userState);
                        }
                        return true;
                    } else if (lowerText === 'revise' || lowerText === 'no' || lowerText === 'edit') {
                        // User wants to revise via text
                        await safeReply(ctx, 
                            "📝 **Please provide a revised description of your issue.**\n\nInclude any additional details that might help our team understand and resolve your problem:", 
                            { parse_mode: 'Markdown' }
                        );
                        // Clear the existing summary so they can provide a new one
                        userState.ticket.summary = '';
                        await BotsStore.setUserState(telegramUserId, userState);
                        return true;
                    } else {
                        // User provided a new description, replace the old one
                        userState.ticket.summary = messageText;
                    }
                } else {
                    // First time providing summary
                    userState.ticket.summary = messageText;
                }
                
                // Show confirmation message with the summary and ask for confirmation
                const confirmationMessage = `📋 **Ticket Summary Preview:**\n\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `"${userState.ticket.summary}"\n` +
                    `━━━━━━━━━━━━━━\n\n` +
                    `❓ **Is this description complete?**\n\n` +
                    `• **Yes**: Proceed to the next step\n` +
                    `• **No**: Revise your description`;
                
                const confirmationReply = await safeReply(ctx, confirmationMessage, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback('✅ Yes, complete', 'confirm_summary'),
                            Markup.button.callback('📝 No, revise', 'revise_summary')
                        ]
                    ])
                });
                
                // Store the confirmation message ID for later editing
                if (confirmationReply && userState.messageIds) {
                    userState.messageIds.push(confirmationReply.message_id);
                }
                
                // Update user state but don't change field yet - wait for confirmation
                await BotsStore.setUserState(telegramUserId, userState);
                break;
            }
                
            case SupportFieldEnum.EMAIL: {
                await handleEmailField(ctx, userState, messageText);
                break;
            }
        }
        
        // We handled this message as part of a support conversation
        return true;
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in processSupportConversation', {
            error: err.message,
            stack: err.stack,
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
 * Processes the email input step of the support ticket conversation and completes ticket creation.
 *
 * If the user enters "skip", an auto-generated email is used. The function then finalizes the ticket by interacting with external services to create the customer, user, and ticket records, updates the user with confirmation or error messages, and clears the user's conversation state.
 */
async function handleEmailField(ctx: BotContext, userState: any, messageText: string): Promise<void> {
    try {
        const telegramUserId = ctx.from?.id;
        if (!telegramUserId || !ctx.chat) {
            return;
        }
        
        // Check if user wants to skip
        if (messageText.toLowerCase() === 'skip') {
            // Generate email in format {username_id@telegram.user}
            const username = ctx.from?.username || 'user';
            userState.ticket.email = `${username}_${telegramUserId}@telegram.user`;
        } else {
            userState.ticket.email = messageText;
        }
        
        // Mark the ticket as complete
        userState.currentField = SupportFieldEnum.COMPLETE;
        userState.field = SupportFieldEnum.COMPLETE;
        
        // Get necessary information for ticket creation
        const groupChatName = 'title' in ctx.chat ? ctx.chat.title : 'Group Chat';
        const username = ctx.from?.username;
        const summary = userState.ticket.summary;
        
        // Send a waiting message
        const waitingMsg = await safeReply(ctx, "Creating your support ticket... Please wait.");
        if (!waitingMsg) {
            return;
        }
        
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
            
            // Create success message with user identification and summary
            const userName = ctx.from?.first_name || ctx.from?.username || 'User';
            const successMessage = `📋 **Support Ticket Created Successfully!**\n\n` +
                `**Ticket #${ticketNumber}**\n` +
                `**Started By:** ${userName}\n\n` +
                `${summary}\n\n` +
                `Your issue has been submitted and our team will be in touch soon.\n\n` +
                `💬 **Reply to this message** to add more information to your ticket.`;
            
            // Send the success message
            const confirmationMsg = await safeEditMessageText(
                ctx,
                ctx.chat.id, 
                waitingMsg.message_id, 
                undefined, 
                successMessage,
                { parse_mode: 'Markdown' }
            );
            
            if (confirmationMsg) {
                // Register this confirmation message so we can track replies to it
                await unthreadService.registerTicketConfirmation({
                    messageId: confirmationMsg.message_id,
                    ticketId: ticketId,
                    friendlyId: ticketNumber,
                    customerId: customerId,
                    chatId: ctx.chat.id,
                    telegramUserId: telegramUserId
                });
                
                // Clean up previous messages to reduce clutter
                if (userState.messageIds && userState.messageIds.length > 0) {
                    for (const messageId of userState.messageIds) {
                        try {
                            await ctx.telegram.editMessageText(
                                ctx.chat.id,
                                messageId,
                                undefined,
                                "✅ _Support ticket creation completed._",
                                { parse_mode: 'Markdown' }
                            );
                        } catch (error) {
                            // Ignore errors when editing messages (they might be deleted or too old)
                            LogEngine.debug('Could not edit previous message', {
                                messageId,
                                error: (error as Error).message
                            });
                        }
                    }
                }
            }
            
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
            const err = error as Error;
            // Handle API errors
            LogEngine.error('Error creating support ticket', {
                error: err.message,
                stack: err.stack,
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
                undefined,
                `⚠️ Error creating support ticket: ${err.message}. Please try again later.`
            );
        }
        
        // Clear the user's state using BotsStore
        if (telegramUserId) {
            await BotsStore.clearUserState(telegramUserId);
        }
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleEmailField', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            messageText: messageText?.substring(0, 100) // Log first 100 chars for context
        });
        await safeReply(ctx, "Sorry, there was an error processing your support ticket. Please try again later.");
        
        // Clean up user state using BotsStore
        if (ctx.from?.id) {
            await BotsStore.clearUserState(ctx.from.id);
        }
    }
}

/**
 * Handler for the /cancel command
 * 
 * This command cancels any ongoing support ticket creation process.
 */
const cancelCommand = async (ctx: BotContext): Promise<void> => {
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
            currentField: userState.currentField || userState.field
        });
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in cancelCommand', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id
        });
        await safeReply(ctx, "Sorry, there was an error cancelling the support ticket process.");
    }
};

/**
 * Resets the user's support conversation state (for debugging)
 */
const resetCommand = async (ctx: BotContext): Promise<void> => {
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
        const err = error as Error;
        LogEngine.error('Error in resetCommand', {
            error: err.message,
            telegramUserId: ctx.from?.id
        });
        await safeReply(ctx, "❌ Error resetting state. Please try again.");
    }
};

export {
    startCommand,
    helpCommand,
    versionCommand,
    aboutCommand,
    supportCommand,
    cancelCommand,
    resetCommand
};
