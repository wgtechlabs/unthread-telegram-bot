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
 * - /setup: Configure group chat for support tickets (admin only)
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
import { generateCustomerName, createCustomerWithName, handleUnthreadApiError, validateCustomerExists, getCustomerDetails } from '../services/unthread.js';
import { safeReply, safeEditMessageText } from '../bot.js';
import { validateAdminAccess, logPermissionEvent } from '../utils/permissions.js';
import { isAdminUser } from '../config/env.js';
import { checkAndPromptBotAdmin, isBotAdmin, handleRetryBotAdminCheck, sendBotAdminHelpMessage } from '../utils/botPermissions.js';
import type { BotContext, SupportField, SupportFormState, ProfileUpdateState } from '../types/index.js';
import { BotsStore } from '../sdk/bots-brain/index.js';

// Support form field enum
const SupportFieldEnum = {
  SUMMARY: 'summary' as const,
  EMAIL: 'email' as const,
  COMPLETE: 'complete' as const,
  PROFILE_EMAIL_UPDATE: 'profile_email_update' as const
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
 * Generate help text for regular users (non-admin)
 */
const generateRegularUserHelp = (): string => {
    return `🤖 **Available Commands:**

**Create Support Tickets:**
• \`/support\` - Create a new support ticket
• \`/cancel\` - Cancel ongoing ticket creation

**Profile Management:**
• \`/profile\` - View and update your email profile

**Information:**
• \`/help\` - Show this help message
• \`/about\` - Show detailed bot information

**How to create a support ticket:**
1. Use \`/support\` command in a group chat
2. Provide your issue summary when prompted
3. Provide your email address when prompted
4. The bot will create a ticket and notify you

**Note:** Support tickets can only be created in group chats.`;
};

/**
 * Generate help text for admin users (all commands)
 */
const generateAdminUserHelp = (): string => {
    return `🤖 **Available Commands:**

**Create Support Tickets:**
• \`/support\` - Create a new support ticket
• \`/cancel\` - Cancel ongoing ticket creation
• \`/reset\` - Reset your support conversation state

**Profile Management:**
• \`/profile\` - View and update your email profile

**Administration:**
• \`/setup\` - Configure group for support tickets

**Information:**
• \`/help\` - Show this help message
• \`/version\` - Show bot version information
• \`/about\` - Show detailed bot information
• \`/start\` - Welcome message and instructions

**How to create a support ticket:**
1. Use \`/support\` command in a group chat
2. Provide your issue summary when prompted
3. Provide your email address when prompted
4. The bot will create a ticket and notify you

**For Administrators:**
• Use \`/setup\` to configure group chat settings
• Only authorized users can run admin commands

**Note:** Support tickets can only be created in group chats.`;
};

/**
 * Handler for the /help command
 * 
 * This command shows available commands and usage information based on user permissions.
 * Regular users see essential commands only, while admins see all commands.
 */
const helpCommand = async (ctx: BotContext): Promise<void> => {
    const telegramUserId = ctx.from?.id;
    
    if (!telegramUserId) {
        LogEngine.warn('Help command: No user ID in context', {
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
        await safeReply(ctx, '❌ Unable to determine user permissions. Please try again.', { parse_mode: 'Markdown' });
        return;
    }
    
    // Check if user is admin
    const isAdmin = isAdminUser(telegramUserId);
    
    // Generate appropriate help text based on user role
    const helpText = isAdmin ? generateAdminUserHelp() : generateRegularUserHelp();
    
    // Log help command usage with user role
    LogEngine.info('Help command executed', {
        userId: telegramUserId,
        chatId: ctx.chat?.id,
        chatType: ctx.chat?.type,
        userRole: isAdmin ? 'admin' : 'regular',
        username: ctx.from?.username
    });
    
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
 * Handler for the /profile command
 * 
 * This command allows users to view and manage their email profile information.
 * Users can see their currently stored email and update it if needed.
 */
const profileCommand = async (ctx: BotContext): Promise<void> => {
    try {
        const telegramUserId = ctx.from?.id;
        
        if (!telegramUserId) {
            LogEngine.warn('Profile command: No user ID in context', {
                chatId: ctx.chat?.id,
                chatType: ctx.chat?.type
            });
            await safeReply(ctx, '❌ Unable to determine user identity. Please try again.', { parse_mode: 'Markdown' });
            return;
        }
        
        // Get user profile information
        const existingUser = await BotsStore.getUserByTelegramId(telegramUserId);
        const hasEmail = existingUser && existingUser.unthreadEmail && existingUser.unthreadEmail.trim() !== '';
        
        // Log profile command usage
        LogEngine.info('Profile command executed', {
            userId: telegramUserId,
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type,
            hasEmail: hasEmail,
            email: hasEmail ? existingUser.unthreadEmail : 'none',
            username: ctx.from?.username
        });
        
        if (!hasEmail) {
            // User has no email set - show first-time profile
            const profileText = `👤 **Your Profile**

**Email:** Not set
**Linked to:** ${ctx.from.username ? `@${ctx.from.username}` : 'User'} (ID: ${telegramUserId})

You haven't provided a work email yet. When you create your first support ticket, you'll be asked to provide one.

**What happens next:**
• Create a ticket with \`/support\`
• Provide your work email when prompted
• Your email will be saved for future tickets

**Why do we need your email?**
Your email is used to identify you in our support system and ensure proper ticket routing.`;

            await safeReply(ctx, profileText, { parse_mode: 'Markdown' });
            
        } else {
            // User has email - show profile with update option
            const isAutoGenerated = existingUser.unthreadEmail!.includes('@telegram.user');
            const lastUpdated = existingUser.updatedAt ? new Date(existingUser.updatedAt).toLocaleDateString() : 'Unknown';
            
            const profileText = isAutoGenerated 
                ? `👤 **Your Profile**

**Email:** ${existingUser.unthreadEmail} (auto-generated)
**Linked to:** ${ctx.from.username ? `@${ctx.from.username}` : 'User'} (ID: ${telegramUserId})
**Last Updated:** ${lastUpdated}

You're using an auto-generated email address. This works for support tickets, but you can update it to your real work email for better communication.

**Benefits of setting a real email:**
• Better identification in support system
• Clearer communication with support team`
                : `👤 **Your Profile**

**Email:** ${existingUser.unthreadEmail}
**Linked to:** ${ctx.from.username ? `@${ctx.from.username}` : 'User'} (ID: ${telegramUserId})
**Last Updated:** ${lastUpdated}

This email is used when creating support tickets. Your ticket information will be sent on behalf of this email address.

**Note:** Changing your email will affect future support tickets only. Existing tickets will remain unchanged.`;

            // Add update button
            await safeReply(ctx, profileText, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    Markup.button.callback('📧 Update Email', 'update_email'),
                    Markup.button.callback('ℹ️ About Profile', 'about_profile')
                ])
            });
        }
        
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in profileCommand', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
        await safeReply(ctx, "❌ Sorry, there was an error retrieving your profile. Please try again later.");
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

        // Check if group is configured for support tickets
        const chatId = ctx.chat.id;
        const groupConfig = await BotsStore.getGroupConfig(chatId);
        
        if (!groupConfig || !groupConfig.isConfigured) {
            // Group is not configured - show error message with different content for admins vs users
            const isAdmin = await isAdminUser(ctx.from.id);
            
            if (isAdmin) {
                // Admin user - show setup instructions
                const adminMessage = `🔧 **Group Setup Required**

This group needs to be configured before support tickets can be created.

**To set up this group:**
1. Run \`/setup\` command in this group
2. Follow the setup wizard to link a customer
3. Once setup is complete, users can create support tickets

**Why is setup required?**
The bot needs to know which customer account to associate with tickets from this group.

**Need help?**
• Type \`/help\` for more information
• Refer to the setup documentation`;

                await safeReply(ctx, adminMessage, { parse_mode: 'Markdown' });
            } else {
                // Regular user - show waiting message
                const userMessage = `⏳ **Group Setup in Progress**

This group is not yet configured for support tickets.

**What's happening?**
A group administrator needs to complete the setup process before support tickets can be created.

**What can you do?**
• Wait for an admin to complete the setup
• Contact a group administrator for assistance
• Use alternative support channels in the meantime

**Note:** Only group administrators can configure the bot for support tickets.`;

                await safeReply(ctx, userMessage, { parse_mode: 'Markdown' });
            }
            
            LogEngine.info('Support command blocked - group not configured', {
                chatId,
                telegramUserId: ctx.from.id,
                isAdmin,
                groupTitle: 'title' in ctx.chat ? ctx.chat.title : 'Unknown Group'
            });
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
                
                // Handle bot permission setup callbacks first (before support flow)
                if (callbackData === 'retry_bot_admin_check') {
                    await handleRetryBotAdminCheck(ctx);
                    return true; // Mark as handled
                } else if (callbackData === 'bot_admin_help') {
                    await sendBotAdminHelpMessage(ctx);
                    return true; // Mark as handled
                } else if (callbackData === 'continue_setup') {
                    // Answer the callback query
                    if ('answerCbQuery' in ctx) {
                        await ctx.answerCbQuery('Starting setup...');
                    }
                    
                    // Simulate /setup command being called
                    await setupCommand(ctx);
                    return true; // Mark as handled
                } else if (callbackData === 'back_to_setup') {
                    // Answer the callback query
                    if ('answerCbQuery' in ctx) {
                        await ctx.answerCbQuery('Returning to setup...');
                    }
                    
                    // Simulate /setup command being called
                    await setupCommand(ctx);
                    return true; // Mark as handled
                }
                
                // Handle profile callbacks
                if (callbackData === 'update_email') {
                    return await handleUpdateEmailCallback(ctx);
                } else if (callbackData === 'about_profile') {
                    return await handleAboutProfileCallback(ctx);
                } else if (callbackData === 'back_to_profile') {
                    return await handleBackToProfileCallback(ctx);
                }
                
                // Handle setup wizard callbacks
                if (callbackData.startsWith('setup_')) {
                    return await handleSetupCallbacks(ctx, callbackData);
                }
                
                // Handle support flow callbacks
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
                    // User confirmed the summary, check if they have existing email
                    const existingUser = await BotsStore.getUserByTelegramId(telegramUserId);
                    const hasExistingEmail = existingUser && existingUser.unthreadEmail && existingUser.unthreadEmail.trim() !== '';
                    
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
                    
                    if (hasExistingEmail) {
                        // User has existing email, skip email prompt and proceed to ticket creation
                        userState.ticket.email = existingUser.unthreadEmail!;
                        await safeReply(ctx, `📧 **Using your stored email:** ${existingUser.unthreadEmail}\n\nCreating your support ticket... Please wait.`);
                        
                        // Directly handle email field with existing email
                        await handleEmailField(ctx, userState, existingUser.unthreadEmail!);
                    } else {
                        // No existing email, ask for it
                        userState.currentField = SupportFieldEnum.EMAIL;
                        userState.field = SupportFieldEnum.EMAIL;
                        
                        // Update user state in BotsStore
                        await BotsStore.setUserState(telegramUserId, userState);
                        
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
                    }
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
                        // User confirmed via text, check if they have existing email
                        const existingUser = await BotsStore.getUserByTelegramId(telegramUserId);
                        const hasExistingEmail = existingUser && existingUser.unthreadEmail && existingUser.unthreadEmail.trim() !== '';
                        
                        if (hasExistingEmail) {
                            // User has existing email, skip email prompt and proceed to ticket creation
                            userState.ticket.email = existingUser.unthreadEmail!;
                            await safeReply(ctx, `📧 **Using your stored email:** ${existingUser.unthreadEmail}\n\nCreating your support ticket... Please wait.`);
                            
                            // Directly handle email field with existing email
                            await handleEmailField(ctx, userState, existingUser.unthreadEmail!);
                        } else {
                            // No existing email, ask for it
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
            
            case SupportFieldEnum.PROFILE_EMAIL_UPDATE: {
                await handleProfileEmailUpdateField(ctx, userState, messageText);
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
            
            // Step 5: Store email in user profile for future use
            if (userState.ticket.email && telegramUserId) {
                try {
                    await BotsStore.updateUser(telegramUserId, { 
                        unthreadEmail: userState.ticket.email 
                    });
                    LogEngine.info('Email stored in user profile', {
                        telegramUserId,
                        email: userState.ticket.email,
                        ticketNumber
                    });
                } catch (error) {
                    LogEngine.warn('Failed to store email in user profile', {
                        telegramUserId,
                        email: userState.ticket.email,
                        error: (error as Error).message
                    });
                    // Don't fail the ticket creation if email storage fails
                }
            }
            
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
            
            // Phase 8 Enhancement: Handle group not configured error specifically
            if (err.message.includes('GROUP_NOT_CONFIGURED')) {
                LogEngine.info('Support ticket blocked - group not configured', {
                    chatId: ctx.chat.id,
                    groupChatName,
                    telegramUserId,
                    username
                });
                
                // Show group-not-configured error with setup instructions
                const configMessage = `🔧 **Group Setup Required**

This group needs to be configured before support tickets can be created.

**To set up this group:**
1. Ask a group administrator to run \`/setup\`
2. Follow the setup wizard to link a customer
3. Once setup is complete, you can create support tickets

**Why is setup required?**
The bot needs to know which customer account to associate with tickets from this group.

**Need help?**
Contact a group administrator or refer to the bot documentation`;

                await safeEditMessageText(
                    ctx,
                    ctx.chat.id,
                    waitingMsg.message_id,
                    undefined,
                    configMessage,
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
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
 * Processes the profile email update input and updates the user's email in the database.
 * This function handles the text input when a user is updating their email via the /profile command.
 */
async function handleProfileEmailUpdateField(ctx: BotContext, userState: any, messageText: string): Promise<void> {
    try {
        const telegramUserId = ctx.from?.id;
        if (!telegramUserId) {
            await safeReply(ctx, "❌ Unable to identify user. Please try again.");
            return;
        }

        // Validate email format (simple validation)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(messageText)) {
            await safeReply(ctx, `❌ **Invalid email format**\n\nPlease enter a valid email address (e.g., user@example.com) or type /cancel to abort.`, { parse_mode: 'Markdown' });
            return;
        }

        // Check if user is trying to set the same email
        if (userState.currentEmail === messageText) {
            await safeReply(ctx, `ℹ️ **No change needed**\n\nYou've entered the same email address that's already set.\n\n**Current email:** ${userState.currentEmail}\n\nType a different email address or /cancel to abort.`, { parse_mode: 'Markdown' });
            return;
        }

        // Update the user's email in the database
        try {
            await BotsStore.updateUser(telegramUserId, { unthreadEmail: messageText });
            
            // Show success message
            const successMessage = `✅ **Email Updated Successfully!**\n\n` +
                `**Previous email:** ${userState.currentEmail || 'Not set'}\n` +
                `**New email:** ${messageText}\n\n` +
                `Your new email will be used for all future support tickets. The change takes effect immediately.`;

            await safeReply(ctx, successMessage, { parse_mode: 'Markdown' });

            // Log the email update
            LogEngine.info('Profile email updated successfully', {
                telegramUserId,
                username: ctx.from?.username,
                chatId: ctx.chat?.id,
                previousEmail: userState.currentEmail || 'none',
                newEmail: messageText
            });

        } catch (error) {
            const err = error as Error;
            LogEngine.error('Error updating user email', {
                error: err.message,
                stack: err.stack,
                telegramUserId,
                username: ctx.from?.username,
                newEmail: messageText
            });
            await safeReply(ctx, "❌ There was an error updating your email. Please try again later.");
        }

        // Clear the profile update state
        await BotsStore.clearUserState(telegramUserId);

    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleProfileEmailUpdateField', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            messageText: messageText?.substring(0, 100) // Log first 100 chars for context
        });
        await safeReply(ctx, "❌ Sorry, there was an error processing your email update. Please try again later.");
        
        // Clean up user state
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

/**
 * Handler for the /setup command (Phase 1 implementation)
 * 
 * This command allows authorized administrators to configure group chat settings
 * for customer linking and ticket management. Currently implements admin validation
 * with placeholder for full setup wizard to be implemented in later phases.
 */
const setupCommand = async (ctx: BotContext): Promise<void> => {
    try {
        // Only allow setup in group chats
        if (ctx.chat?.type === 'private') {
            await safeReply(ctx,
                "❌ **Setup Command Not Available in Private Chats**\n\n" +
                "The `/setup` command is only available in group chats where support tickets will be created.\n\n" +
                "**To configure a group:**\n" +
                "1. Add this bot to your support group chat\n" +
                "2. Run `/setup` in the group chat\n" +
                "3. Follow the configuration wizard"
            );
            return;
        }

        // Log setup command attempt
        logPermissionEvent('setup_command_attempted', ctx, '/setup');

        // Phase 1: Validate admin access
        if (!await validateAdminAccess(ctx)) {
            logPermissionEvent('setup_command_denied', ctx, '/setup', { reason: 'not_admin' });
            return;
        }

        // Phase 1 success - Admin validation passed
        logPermissionEvent('setup_command_authorized', ctx, '/setup');

        const chatTitle = (ctx.chat && 'title' in ctx.chat) ? ctx.chat.title : 'Group Chat';
        
        // Phase 2: Check bot admin permissions
        const botIsAdmin = await isBotAdmin(ctx);
        
        if (!botIsAdmin) {
            LogEngine.info('Setup command - Bot admin check failed', {
                telegramUserId: ctx.from?.id,
                username: ctx.from?.username,
                chatId: ctx.chat?.id,
                chatTitle: chatTitle,
                phase: 'bot_permission_check'
            });
            
            // This will handle the error message and retry mechanism
            await checkAndPromptBotAdmin(ctx);
            return;
        }

        // Phase 2 success - Bot has admin permissions
        LogEngine.info('Setup command - Bot admin check passed', {
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            chatTitle: chatTitle,
            phase: 'bot_permission_check'
        });

        // Phase 3: Check if group is already configured
        const chatId = ctx.chat!.id;
        const existingConfig = await BotsStore.getGroupConfig(chatId);
        
        if (existingConfig && existingConfig.isConfigured) {
            await safeReply(ctx,
                "✅ **Group Already Configured**\n\n" +
                `**Customer:** ${existingConfig.customerName || 'Unknown'}\n` +
                `**Customer ID:** ${existingConfig.customerId || 'Unknown'}\n` +
                `**Setup by:** User ID ${existingConfig.setupBy}\n` +
                `**Setup date:** ${existingConfig.setupAt || 'Unknown'}\n\n` +
                "Support tickets are already enabled for this group.\n\n" +
                "**Need to reconfigure?**\n" +
                "Contact a developer to reset the group configuration.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Phase 4: Initialize setup wizard
        const setupInitiatedBy = ctx.from!.id;
        const suggestedCustomerName = generateCustomerName(chatTitle);
        
        // Store setup state
        const setupState = {
            chatId: chatId,
            step: 'customer_selection' as const,
            initiatedBy: setupInitiatedBy,
            startedAt: new Date().toISOString(),
            suggestedCustomerName: suggestedCustomerName,
            metadata: {
                chatTitle: chatTitle,
                botIsAdmin: true
            }
        };
        
        await BotsStore.storeSetupState(setupState);
        
        // Phase 5: Display setup wizard with customer name suggestion
        const progressIndicator = getSetupProgressIndicator('customer_selection');
        const setupMessage = `${progressIndicator}

🎯 **Group Setup Wizard**

**Group:** ${chatTitle}
**Admin:** ${ctx.from?.first_name || ctx.from?.username || 'Unknown'}

📋 **Customer Linking**
We've suggested a customer name based on your group title:

**Suggested Customer Name:**
\`${suggestedCustomerName}\`

**Choose an option:**`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Use Suggested Name', 'setup_use_suggested')],
            [Markup.button.callback('✏️ Edit Customer Name', 'setup_edit_name')],
            [Markup.button.callback('🔗 Link Existing Customer', 'setup_link_existing')],
            [Markup.button.callback('❌ Cancel Setup', 'setup_cancel')]
        ]);

        await safeReply(ctx, setupMessage, { 
            parse_mode: 'Markdown',
            ...keyboard 
        });

        LogEngine.info('Setup wizard initialized', {
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: chatId,
            chatTitle: chatTitle,
            suggestedCustomerName: suggestedCustomerName,
            phase: 'wizard_initialization'
        });

    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in setupCommand', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
        
        await safeReply(ctx, 
            "❌ **Setup Error**\n\n" +
            "An error occurred while processing the setup command. Please try again later.\n\n" +
            "If this error persists, contact your system administrator."
        );
    }
};

/**
 * Handles setup wizard callback queries
 * Phase 6 enhancement with improved session validation and error handling
 * 
 * @param ctx - The bot context
 * @param callbackData - The callback data from the inline keyboard
 * @returns True if the callback was handled
 */
const handleSetupCallbacks = async (ctx: BotContext, callbackData: string): Promise<boolean> => {
    try {
        if (!ctx.chat || !ctx.from) {
            return false;
        }

        const chatId = ctx.chat.id;
        const setupState = await BotsStore.getSetupState(chatId);
        
        // Phase 6 enhancement: Enhanced session validation
        const sessionValidation = await validateSetupSession(ctx, setupState);
        if (!sessionValidation.isValid) {
            await ctx.answerCbQuery('Session validation failed');
            if (sessionValidation.message) {
                await safeReply(ctx, sessionValidation.message, { parse_mode: 'Markdown' });
            }
            return true;
        }

        // At this point, setupState is guaranteed to be valid due to session validation
        if (!setupState) {
            await ctx.answerCbQuery('Setup session error. Please run /setup again.');
            return true;
        }

        // Verify the user who started setup is the same one clicking buttons
        if (setupState.initiatedBy !== ctx.from.id) {
            await ctx.answerCbQuery('Only the admin who started setup can continue.');
            await safeReply(ctx, 
                '🔒 **Access Denied**\n\n' +
                'Only the administrator who started the setup process can continue.\n\n' +
                `**Setup initiated by:** User ID ${setupState.initiatedBy}\n` +
                `**Current user:** User ID ${ctx.from.id}\n\n` +
                'If you need to take over the setup, ask the original admin to cancel and restart the process.',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        switch (callbackData) {
            case 'setup_use_suggested':
                return await handleUseSuggestedName(ctx, setupState);
                
            case 'setup_edit_name':
                return await handleEditCustomerName(ctx, setupState);
                
            case 'setup_link_existing':
                return await handleLinkExistingCustomer(ctx, setupState);
                
            case 'setup_cancel':
                return await handleCancelSetup(ctx, setupState);
                
            default:
                await ctx.answerCbQuery('Unknown setup option.');
                return true;
        }
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleSetupCallbacks', {
            error: err.message,
            stack: err.stack,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
        await ctx.answerCbQuery('Setup error occurred. Please try again.');
        return true;
    }
};

/**
 * Handle using the suggested customer name
 * Phase 7 enhancement with real customer creation
 */
const handleUseSuggestedName = async (ctx: BotContext, setupState: any): Promise<boolean> => {
    try {
        await ctx.answerCbQuery('Creating customer with suggested name...');
        
        const customerName = setupState.suggestedCustomerName;
        
        // Phase 7: Create customer in Unthread API
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(customerName);
            customerId = customer.id;
            actualCustomerName = customer.name;
            
            LogEngine.info('Customer created successfully in Unthread', {
                customerId,
                customerName: actualCustomerName,
                chatId: setupState.chatId
            });
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Failed to create customer in Unthread', {
                error: err.message,
                customerName,
                chatId: setupState.chatId
            });
            
            // Handle API error gracefully
            const errorMessage = handleUnthreadApiError(error, 'Customer Creation');
            await safeReply(ctx, errorMessage + '\n\n💡 **Try again:** Run `/setup` to retry the configuration.', { parse_mode: 'Markdown' });
            
            // Clear setup state on error
            await BotsStore.clearSetupState(setupState.chatId);
            return true;
        }
        
        // Store final group configuration with real customer ID
        const groupConfig = {
            chatId: setupState.chatId,
            chatTitle: setupState.metadata?.chatTitle || 'Unknown Group',
            isConfigured: true,
            customerId: customerId, // Phase 7: Real customer ID from Unthread
            customerName: actualCustomerName,
            setupBy: setupState.initiatedBy,
            setupAt: new Date().toISOString(),
            botIsAdmin: true,
            lastAdminCheck: new Date().toISOString(),
            setupVersion: '1.0',
            metadata: {
                setupMethod: 'suggested_name',
                originalSuggestion: customerName,
                apiIntegration: true, // Phase 7: Mark as API integrated
                unthreadCustomerId: customerId
            }
        };

        await BotsStore.storeGroupConfig(groupConfig);
        await BotsStore.clearSetupState(setupState.chatId);

        const successMessage = `${getSetupProgressIndicator('completion')}

✅ **Setup Complete!**

**Customer Created:** ${actualCustomerName}
**Customer ID:** ${customerId}
**Group:** ${setupState.metadata?.chatTitle || 'Unknown Group'}
**Configuration:** Saved successfully

🎫 **Support tickets are now enabled** for this group!

Users can now use \`/support\` to create tickets that will be linked to this customer account.

🔗 **Integration:** Connected to Unthread API`;

        // Edit the original message to show completion
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                ctx.callbackQuery.message.message_id,
                undefined,
                successMessage,
                { parse_mode: 'Markdown' }
            );
        } else {
            await safeReply(ctx, successMessage, { parse_mode: 'Markdown' });
        }

        LogEngine.info('Setup completed with suggested name and API integration', {
            chatId: setupState.chatId,
            customerName: actualCustomerName,
            customerId: customerId,
            setupBy: setupState.initiatedBy
        });

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleUseSuggestedName', {
            error: err.message,
            setupState
        });
        await ctx.answerCbQuery('Error completing setup. Please try again.');
        await safeReply(ctx, 
            '❌ **Setup Error**\n\n' +
            'An unexpected error occurred during setup. Please try running `/setup` again.\n\n' +
            'If this error persists, contact your system administrator.',
            { parse_mode: 'Markdown' }
        );
        
        // Clear setup state on error
        await BotsStore.clearSetupState(setupState.chatId);
        return true;
    }
};

/**
 * Handle editing the customer name
 */
const handleEditCustomerName = async (ctx: BotContext, setupState: any): Promise<boolean> => {
    try {
        await ctx.answerCbQuery('Please enter the customer name...');
        
        // Update setup state to indicate we're waiting for text input
        await BotsStore.updateSetupState(setupState.chatId, {
            step: 'customer_creation',
            metadata: {
                ...setupState.metadata,
                waitingForInput: 'customer_name'
            }
        });

        const inputMessage = `${getSetupProgressIndicator('customer_creation')}

✏️ **Edit Customer Name**

**Current suggestion:** ${setupState.suggestedCustomerName}

Please type the new customer name you'd like to use:

**Examples:**
• \`Acme Corporation\`
• \`[Telegram] TechStart Inc\`
• \`Global Solutions Ltd\`

**Note:** You can include \`[Telegram]\` prefix to distinguish from other channels.

💡 **Tip:** Type \`cancel\` to abort the setup process.`;

        // Edit the original message
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                ctx.callbackQuery.message.message_id,
                undefined,
                inputMessage,
                { parse_mode: 'Markdown' }
            );
        } else {
            await safeReply(ctx, inputMessage, { parse_mode: 'Markdown' });
        }

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleEditCustomerName', {
            error: err.message,
            setupState
        });
        await ctx.answerCbQuery('Error starting name edit. Please try again.');
        return true;
    }
};

/**
 * Handle linking to an existing customer
 */
const handleLinkExistingCustomer = async (ctx: BotContext, setupState: any): Promise<boolean> => {
    try {
        await ctx.answerCbQuery('Enter existing customer ID...');
        
        // Update setup state to indicate we're waiting for customer ID input
        await BotsStore.updateSetupState(setupState.chatId, {
            step: 'customer_linking',
            metadata: {
                ...setupState.metadata,
                waitingForInput: 'customer_id'
            }
        });

        const inputMessage = `${getSetupProgressIndicator('customer_linking')}

🔗 **Link Existing Customer**

Please enter the **Customer ID** of an existing customer account:

**Examples:**
• \`cust_1234567890\`
• \`customer-abc-123\`

**Where to find Customer ID:**
• Check your Unthread dashboard
• Look in previous ticket emails
• Contact your team administrator

**Note:** The customer ID is case-sensitive.

💡 **Tip:** Type \`cancel\` to abort the setup process.`;

        // Edit the original message
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                ctx.callbackQuery.message.message_id,
                undefined,
                inputMessage,
                { parse_mode: 'Markdown' }
            );
        } else {
            await safeReply(ctx, inputMessage, { parse_mode: 'Markdown' });
        }

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleLinkExistingCustomer', {
            error: err.message,
            setupState
        });
        await ctx.answerCbQuery('Error starting customer linking. Please try again.');
        return true;
    }
};

/**
 * Handle canceling the setup
 */
const handleCancelSetup = async (ctx: BotContext, setupState: any): Promise<boolean> => {
    try {
        await ctx.answerCbQuery('Setup canceled.');
        
        // Clear the setup state
        await BotsStore.clearSetupState(setupState.chatId);

        const cancelMessage = `❌ **Setup Canceled**

Group setup has been canceled. No changes were made.

To configure this group for support tickets, run \`/setup\` again.`;

        // Edit the original message
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                ctx.callbackQuery.message.message_id,
                undefined,
                cancelMessage,
                { parse_mode: 'Markdown' }
            );
        } else {
            await safeReply(ctx, cancelMessage, { parse_mode: 'Markdown' });
        }

        LogEngine.info('Setup canceled by user', {
            chatId: setupState.chatId,
            canceledBy: setupState.initiatedBy
        });

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in handleCancelSetup', {
            error: err.message,
            setupState
        });
        await ctx.answerCbQuery('Error canceling setup.');
        return true;
    }
};

/**
 * Processes text input for the setup wizard
 * Phase 6 enhancement with improved session management and validation
 * 
 * @param ctx - The bot context
 * @returns True if the message was processed as part of setup
 */
export const processSetupTextInput = async (ctx: BotContext): Promise<boolean> => {
    try {
        if (!ctx.from || !ctx.chat || !ctx.message || !('text' in ctx.message)) {
            return false;
        }

        const chatId = ctx.chat.id;
        const setupState = await BotsStore.getSetupState(chatId);
        
        if (!setupState || !setupState.metadata?.waitingForInput) {
            return false; // Not waiting for setup input
        }

        // Phase 6 enhancement: Enhanced session validation
        const sessionValidation = await validateSetupSession(ctx, setupState);
        if (!sessionValidation.isValid) {
            if (sessionValidation.message) {
                await safeReply(ctx, sessionValidation.message, { parse_mode: 'Markdown' });
            }
            return true;
        }

        // Verify the user who started setup is the same one providing input
        if (setupState.initiatedBy !== ctx.from.id) {
            await safeReply(ctx, 
                '🔒 **Setup Access Restricted**\n\n' +
                'Only the administrator who started the setup process can provide input.\n\n' +
                `**Setup initiated by:** User ID ${setupState.initiatedBy}\n` +
                `**Current user:** User ID ${ctx.from.id}\n\n` +
                'If you need to take over the setup, ask the original admin to cancel and restart the process.',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        const userInput = ctx.message.text.trim();
        const inputType = setupState.metadata.waitingForInput;

        // Phase 6 enhancement: Check for special commands
        if (userInput.toLowerCase() === '/cancel' || userInput.toLowerCase() === 'cancel') {
            await BotsStore.clearSetupState(chatId);
            await safeReply(ctx, 
                '❌ **Setup Canceled**\n\n' +
                'Setup process has been canceled by user request.\n\n' +
                'To configure this group for support tickets, run `/setup` again.',
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        if (inputType === 'customer_name') {
            return await processCustomerNameInput(ctx, setupState, userInput);
        } else if (inputType === 'customer_id') {
            return await processCustomerIdInput(ctx, setupState, userInput);
        }

        return false;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in processSetupTextInput', {
            error: err.message,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
        });
        await safeReply(ctx, 
            '❌ **Setup Processing Error**\n\n' +
            'An error occurred while processing your input. Please try running `/setup` again.\n\n' +
            'If this error persists, contact your system administrator.',
            { parse_mode: 'Markdown' }
        );
        return true;
    }
};

/**
 * Process customer name input
 * Phase 6 enhancement with improved validation and user feedback
 */
const processCustomerNameInput = async (ctx: BotContext, setupState: any, customerName: string): Promise<boolean> => {
    try {
        // Phase 6 enhancement: Enhanced validation with detailed feedback
        const validation = validateCustomerName(customerName);
        
        if (!validation.isValid) {
            let errorMessage = validation.message || '❌ Invalid customer name.';
            
            if (validation.suggestions && validation.suggestions.length > 0) {
                errorMessage += '\n\n**Suggestions:**\n';
                validation.suggestions.forEach((suggestion, index) => {
                    errorMessage += `${index + 1}. ${suggestion}\n`;
                });
            }
            
            errorMessage += '\n💡 **Please try again with a different name.**';
            await safeReply(ctx, errorMessage, { parse_mode: 'Markdown' });
            return true;
        }

        // Show warning if validation passed but has suggestions
        if (validation.message && validation.suggestions) {
            let warningMessage = validation.message + '\n\n**Suggestions:**\n';
            validation.suggestions.forEach((suggestion, index) => {
                warningMessage += `${index + 1}. ${suggestion}\n`;
            });
            warningMessage += '\n**Continue anyway?** Reply with the same name to proceed, or provide a different name.';
            
            // Check if user is confirming the same name despite warning
            if (setupState.metadata?.lastWarningName !== customerName) {
                // First time showing warning for this name
                await BotsStore.updateSetupState(setupState.chatId, {
                    metadata: {
                        ...setupState.metadata,
                        lastWarningName: customerName
                    }
                });
                
                await safeReply(ctx, warningMessage, { parse_mode: 'Markdown' });
                return true;
            }
            // User confirmed despite warning, proceed
        }

        const trimmedName = customerName.trim();

        // Phase 7: Create customer in Unthread API
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(trimmedName);
            customerId = customer.id;
            actualCustomerName = customer.name;
            
            LogEngine.info('Customer created successfully in Unthread', {
                customerId,
                customerName: actualCustomerName,
                originalInput: trimmedName,
                chatId: setupState.chatId
            });
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Failed to create customer in Unthread', {
                error: err.message,
                customerName: trimmedName,
                chatId: setupState.chatId
            });
            
            // Handle API error gracefully
            const errorMessage = handleUnthreadApiError(error, 'Customer Creation');
            await safeReply(ctx, errorMessage + '\n\n💡 **Try again:** Run `/setup` to retry the configuration.', { parse_mode: 'Markdown' });
            
            // Clear setup state on error
            await BotsStore.clearSetupState(setupState.chatId);
            return true;
        }

        // Store final group configuration with real customer data
        const groupConfig = {
            chatId: setupState.chatId,
            chatTitle: setupState.metadata?.chatTitle || 'Unknown Group',
            isConfigured: true,
            customerId: customerId, // Phase 7: Real customer ID from Unthread
            customerName: actualCustomerName,
            setupBy: setupState.initiatedBy,
            setupAt: new Date().toISOString(),
            botIsAdmin: true,
            lastAdminCheck: new Date().toISOString(),
            setupVersion: '1.0',
            metadata: {
                setupMethod: 'custom_name',
                originalSuggestion: setupState.suggestedCustomerName,
                customName: trimmedName,
                actualCustomerName: actualCustomerName,
                apiIntegration: true, // Phase 7: Mark as API integrated
                unthreadCustomerId: customerId,
                validationWarnings: validation.message ? [validation.message] : []
            }
        };

        await BotsStore.storeGroupConfig(groupConfig);
        await BotsStore.clearSetupState(setupState.chatId);

        // Phase 6 enhancement: Progress indicator in success message
        const progressIndicator = getSetupProgressIndicator('completion');
        const successMessage = `${progressIndicator}

✅ **Setup Complete!**

**Customer Created:** ${actualCustomerName}
**Customer ID:** ${customerId}
**Group:** ${setupState.metadata?.chatTitle || 'Unknown Group'}
**Configuration:** Saved successfully

🎫 **Support tickets are now enabled** for this group!

Users can now use \`/support\` to create tickets that will be linked to this customer account.`;

        await safeReply(ctx, successMessage, { parse_mode: 'Markdown' });

        LogEngine.info('Setup completed with custom name', {
            chatId: setupState.chatId,
            customerId: customerId,
            customerName: actualCustomerName,
            originalInput: trimmedName,
            setupBy: setupState.initiatedBy,
            originalSuggestion: setupState.suggestedCustomerName,
            validationWarnings: validation.message ? [validation.message] : []
        });

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in processCustomerNameInput', {
            error: err.message,
            customerName,
            setupState
        });
        await safeReply(ctx, '❌ **Setup Error**\n\nAn error occurred while saving the customer name. Please try running `/setup` again.', { parse_mode: 'Markdown' });
        return true;
    }
};

/**
 * Process customer ID input for linking existing customers
 * Phase 6 enhancement with improved validation and user feedback
 */
const processCustomerIdInput = async (ctx: BotContext, setupState: any, customerId: string): Promise<boolean> => {
    try {
        // Phase 6 enhancement: Enhanced validation with detailed feedback
        const validation = validateCustomerId(customerId);
        
        if (!validation.isValid) {
            let errorMessage = validation.message || '❌ Invalid customer ID.';
            
            if (validation.suggestions && validation.suggestions.length > 0) {
                errorMessage += '\n\n**Suggestions:**\n';
                validation.suggestions.forEach((suggestion, index) => {
                    errorMessage += `${index + 1}. ${suggestion}\n`;
                });
            }
            
            errorMessage += '\n💡 **Please try again with a different ID.**';
            await safeReply(ctx, errorMessage, { parse_mode: 'Markdown' });
            return true;
        }

        // Show warning if validation passed but has suggestions
        if (validation.message && validation.suggestions) {
            let warningMessage = validation.message + '\n\n**Suggestions:**\n';
            validation.suggestions.forEach((suggestion, index) => {
                warningMessage += `${index + 1}. ${suggestion}\n`;
            });
            warningMessage += '\n**Continue anyway?** Reply with the same ID to proceed, or provide a different ID.';
            
            // Check if user is confirming the same ID despite warning
            if (setupState.metadata?.lastWarningId !== customerId) {
                // First time showing warning for this ID
                await BotsStore.updateSetupState(setupState.chatId, {
                    metadata: {
                        ...setupState.metadata,
                        lastWarningId: customerId
                    }
                });
                
                await safeReply(ctx, warningMessage, { parse_mode: 'Markdown' });
                return true;
            }
            // User confirmed despite warning, proceed
        }

        const trimmedId = customerId.trim();

        // Phase 7: Validate customer exists in Unthread API
        let customerDetails: Awaited<ReturnType<typeof getCustomerDetails>>;
        
        try {
            // Check if customer exists
            const validationResult = await validateCustomerExists(trimmedId);
            if (!validationResult.exists) {
                await safeReply(ctx, 
                    '❌ **Customer Not Found**\n\n' +
                    `Customer ID \`${trimmedId}\` does not exist in Unthread.\n\n` +
                    '**Please check:**\n' +
                    '• Spelling and case sensitivity\n' +
                    '• Complete Customer ID (no missing characters)\n' +
                    '• Customer exists in your Unthread account\n\n' +
                    '💡 **Try again with the correct Customer ID, or use a different setup option.**',
                    { parse_mode: 'Markdown' }
                );
                return true;
            }
            
            // Get customer details
            customerDetails = await getCustomerDetails(trimmedId);
            
            // Validate that customer details were successfully retrieved
            if (!customerDetails) {
                LogEngine.error('Customer details could not be retrieved despite validation success', {
                    customerId: trimmedId,
                    chatId: setupState.chatId
                });
                
                await safeReply(ctx, 
                    '❌ **Error Retrieving Customer Details**\n\n' +
                    'Customer validation passed, but detailed information could not be retrieved.\n\n' +
                    '**This might be due to:**\n' +
                    '• Temporary API connectivity issues\n' +
                    '• Data synchronization delays\n\n' +
                    '💡 **Try again:** Wait a moment and retry the setup process.',
                    { parse_mode: 'Markdown' }
                );
                return true;
            }
            
            LogEngine.info('Customer validated successfully in Unthread', {
                customerId: trimmedId,
                customerName: customerDetails.name,
                chatId: setupState.chatId
            });
        } catch (error) {
            const err = error as Error;

            LogEngine.error('Failed to validate customer in Unthread', {
                error: err.message,
                customerId: trimmedId,
                chatId: setupState.chatId
            });
            
            // Handle API error gracefully
            const errorMessage = handleUnthreadApiError(error, 'Customer Validation');
            await safeReply(ctx, errorMessage + '\n\n💡 **Try again:** Run `/setup` to retry the configuration.', { parse_mode: 'Markdown' });
            
            // Clear setup state on error
            await BotsStore.clearSetupState(setupState.chatId);
            return true;
        }
        
        // Store final group configuration with validated customer data
        const groupConfig = {
            chatId: setupState.chatId,
            chatTitle: setupState.metadata?.chatTitle || 'Unknown Group',
            isConfigured: true,
            customerId: trimmedId,
            customerName: customerDetails.name || `Customer ${trimmedId}`,
            setupBy: setupState.initiatedBy,
            setupAt: new Date().toISOString(),
            botIsAdmin: true,
            lastAdminCheck: new Date().toISOString(),
            setupVersion: '1.0',
            metadata: {
                setupMethod: 'existing_customer',
                originalSuggestion: setupState.suggestedCustomerName,
                apiIntegration: true, // Phase 7: Mark as API integrated
                unthreadCustomerId: trimmedId,
                customerValidated: true,
                validationWarnings: validation.message ? [validation.message] : []
            }
        };

        await BotsStore.storeGroupConfig(groupConfig);
        await BotsStore.clearSetupState(setupState.chatId);

        // Phase 6 enhancement: Progress indicator in success message
        const progressIndicator = getSetupProgressIndicator('completion');
        const successMessage = `${progressIndicator}

✅ **Setup Complete!**

**Linked Customer:** ${customerDetails.name || trimmedId}
**Customer ID:** ${trimmedId}
**Group:** ${setupState.metadata?.chatTitle || 'Unknown Group'}
**Configuration:** Saved and validated successfully

🎫 **Support tickets are now enabled** for this group!

Users can now use \`/support\` to create tickets that will be linked to this customer account.`;

        await safeReply(ctx, successMessage, { parse_mode: 'Markdown' });

        LogEngine.info('Setup completed with existing customer', {
            chatId: setupState.chatId,
            customerId: trimmedId,
            setupBy: setupState.initiatedBy,
            needsValidation: true,
            validationWarnings: validation.message ? [validation.message] : []
        });

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in processCustomerIdInput', {
            error: err.message,
            customerId,
            setupState
        });
        await safeReply(ctx, '❌ **Setup Error**\n\nAn error occurred while linking the customer. Please try running `/setup` again.', { parse_mode: 'Markdown' });
        return true;
    }
};

// Phase 6 Enhancement: Improved setup session timeout handling
const SETUP_SESSION_TIMEOUT_MINUTES = 30;

/**
 * Enhanced setup session validation with timeout handling
 * Phase 6 enhancement for better session management
 */
const validateSetupSession = async (ctx: BotContext, setupState: any): Promise<{ isValid: boolean; message?: string }> => {
    try {
        if (!setupState) {
            return {
                isValid: false,
                message: '⏰ **Setup Session Expired**\n\nYour setup session has expired. Please run `/setup` again to start a new configuration session.'
            };
        }

        // Check if session has timed out
        const startedAt = new Date(setupState.startedAt);
        const now = new Date();
        const timeDiffMinutes = (now.getTime() - startedAt.getTime()) / (1000 * 60);

        if (timeDiffMinutes > SETUP_SESSION_TIMEOUT_MINUTES) {
            // Clean up expired session
            await BotsStore.clearSetupState(setupState.chatId);
            return {
                isValid: false,
                message: `⏰ **Setup Session Timed Out**\n\nYour setup session expired after ${SETUP_SESSION_TIMEOUT_MINUTES} minutes of inactivity.\n\nPlease run \`/setup\` again to start a new configuration session.`
            };
        }

        // Verify user is still admin (security check)
        if (!ctx.from?.id) {
            await BotsStore.clearSetupState(setupState.chatId);
            return {
                isValid: false,
                message: '🔒 **Authentication Error**\n\nUnable to verify user identity. Setup session has been terminated for security reasons.\n\nPlease run `/setup` again to start a new configuration session.'
            };
        }

        if (!await isAdminUser(ctx.from.id)) {
            await BotsStore.clearSetupState(setupState.chatId);
            return {
                isValid: false,
                message: '🔒 **Admin Access Required**\n\nYour admin privileges may have changed. Only authorized administrators can complete group setup.\n\nIf you believe this is an error, please contact a system administrator.'
            };
        }

        return { isValid: true };
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in validateSetupSession', {
            error: err.message,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
        });
        return {
            isValid: false,
            message: '❌ **Session Validation Error**\n\nAn error occurred while validating your setup session. Please try running `/setup` again.'
        };
    }
};

/**
 * Enhanced customer name validation with detailed feedback
 * Phase 6 enhancement for better input validation
 */
const validateCustomerName = (customerName: string): { isValid: boolean; message?: string; suggestions?: string[] } => {
    const trimmedName = customerName.trim();
    
    if (!trimmedName) {
        return {
            isValid: false,
            message: '❌ **Customer name cannot be empty**\n\nPlease provide a valid customer name.',
            suggestions: ['Acme Corporation', '[Telegram] TechStart Inc', 'Global Solutions Ltd']
        };
    }

    if (trimmedName.length < 2) {
        return {
            isValid: false,
            message: '❌ **Customer name too short**\n\nCustomer name must be at least 2 characters long.',
            suggestions: ['Add more descriptive text', 'Include company type (Inc, LLC, etc.)', 'Use full company name']
        };
    }

    if (trimmedName.length > 100) {
        return {
            isValid: false,
            message: '❌ **Customer name too long**\n\nCustomer name must be 100 characters or less.\n\n**Current length:** ' + trimmedName.length + ' characters',
            suggestions: ['Use abbreviations', 'Remove unnecessary words', 'Use shorter company name']
        };
    }

    // Check for potentially problematic characters
    const problematicChars = /[<>{}[\]\\|`~!@#$%^&*()+=]/;
    if (problematicChars.test(trimmedName)) {
        return {
            isValid: false,
            message: '❌ **Invalid characters detected**\n\nCustomer name contains special characters that may cause issues.\n\n**Allowed:** Letters, numbers, spaces, hyphens, underscores, periods, and common punctuation.',
            suggestions: ['Remove special characters', 'Use only letters and numbers', 'Check for copy-paste errors']
        };
    }

    // Warning for very short names (but still valid)
    if (trimmedName.length < 5) {
        return {
            isValid: true, // Still valid, just warn about unusual format
            message: '⚠️ **Short customer name**\n\nThis name is quite short. Consider using a more descriptive name for better identification.',
            suggestions: ['Add company type (Inc, Corp, LLC)', 'Include industry or service type', 'Use full business name']
        };
    }

    return { isValid: true };
};

/**
 * Enhanced customer ID validation with format checking
 * Phase 6 enhancement for better ID validation
 */
const validateCustomerId = (customerId: string): { isValid: boolean; message?: string; suggestions?: string[] } => {
    const trimmedId = customerId.trim();
    
    if (!trimmedId) {
        return {
            isValid: false,
            message: '❌ **Customer ID cannot be empty**\n\nPlease provide a valid customer ID.',
            suggestions: ['Check your Unthread dashboard', 'Look in previous ticket emails', 'Contact your team administrator']
        };
    }

    if (trimmedId.length < 3) {
        return {
            isValid: false,
            message: '❌ **Customer ID too short**\n\nCustomer ID must be at least 3 characters long.',
            suggestions: ['Double-check the ID from your dashboard', 'Ensure you copied the complete ID', 'Contact support if unsure']
        };
    }

    if (trimmedId.length > 50) {
        return {
            isValid: false,
            message: '❌ **Customer ID too long**\n\nCustomer ID must be 50 characters or less.\n\n**Current length:** ' + trimmedId.length + ' characters',
            suggestions: ['Verify you copied only the ID, not additional text', 'Check for extra spaces or characters', 'Use the shorter ID format if available']
        };
    }

    // Enhanced format validation
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
        return {
            isValid: false,
            message: '❌ **Invalid customer ID format**\n\nCustomer ID can only contain letters, numbers, underscores, and hyphens.\n\n**Invalid characters detected:** ' + trimmedId.replace(/[a-zA-Z0-9_-]/g, '').split('').join(', '),
            suggestions: ['Remove spaces and special characters', 'Use only alphanumeric characters', 'Check for copy-paste errors']
        };
    }

    // Common ID format validation
    const commonFormats = [
        /^cust_[a-zA-Z0-9]+$/,           // Stripe-like: cust_1234567890
        /^customer-[a-zA-Z0-9-]+$/,     // Dash format: customer-abc-123
        /^[a-zA-Z0-9]{8,}$/,            // Simple alphanumeric: abc123def456
        /^[0-9]+$/,                     // Numeric only: 1234567890
        /^[a-zA-Z]+[0-9]+$/             // Letters + numbers: customer123
    ];

    const isCommonFormat = commonFormats.some(format => format.test(trimmedId));
    if (!isCommonFormat) {
        return {
            isValid: true, // Still valid, just warn about unusual format
            message: '⚠️ **Unusual customer ID format**\n\nThis doesn\'t match common customer ID patterns. Please verify this is correct.',
            suggestions: ['Double-check against your dashboard', 'Ensure this is the customer ID, not username', 'Contact support if uncertain']
        };
    }

    return { isValid: true };
};

/**
 * Enhanced progress indicator for setup steps
 * Phase 6 enhancement for better UX feedback
 */
const getSetupProgressIndicator = (currentStep: string, totalSteps: number = 4): string => {
    const steps = {
        'admin_validation': { current: 1, name: 'Admin Verification' },
        'bot_permissions': { current: 2, name: 'Bot Permissions' },
        'customer_selection': { current: 3, name: 'Customer Selection' },
        'customer_creation': { current: 3, name: 'Customer Creation' },
        'customer_linking': { current: 3, name: 'Customer Linking' },
        'completion': { current: 4, name: 'Completion' }
    };

    const step = steps[currentStep as keyof typeof steps] || { current: 1, name: 'Setup' };
    const progress = '█'.repeat(step.current) + '░'.repeat(totalSteps - step.current);
    
    return `📊 **Setup Progress** ${step.current}/${totalSteps}\n${progress} ${step.name}`;
};

// Handle profile email update callback
async function handleUpdateEmailCallback(ctx: BotContext): Promise<boolean> {
    try {
        const userId = ctx.from?.id;
        if (!userId) {
            if ('answerCbQuery' in ctx) {
                await ctx.answerCbQuery('Error: Unable to identify user');
            }
            await safeReply(ctx, '❌ Unable to identify user. Please try again.');
            return true;
        }

        // Answer the callback query
        if ('answerCbQuery' in ctx) {
            await ctx.answerCbQuery('Starting email update...');
        }

        // Get current user information
        const existingUser = await BotsStore.getUserByTelegramId(userId);
        const currentEmail = existingUser?.unthreadEmail || '';

        // Set profile update state
        const profileUpdateState: ProfileUpdateState = {
            field: SupportFieldEnum.PROFILE_EMAIL_UPDATE as SupportField.PROFILE_EMAIL_UPDATE,
            initiatedBy: userId,
            initiatedInChat: ctx.chat?.id || 0,
            currentEmail: currentEmail
        };

        // Add messageId if available
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message?.message_id) {
            profileUpdateState.messageId = ctx.callbackQuery.message.message_id;
        }

        // Store the profile update state
        await BotsStore.setUserState(userId, profileUpdateState);

        // Ask for new email
        const message = `✏️ **Update Email Address**\n\n` +
            `Please enter your new email address:\n\n` +
            `Current email: ${currentEmail || 'Not set'}\n\n` +
            `Type your new email address or /cancel to abort.`;

        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                ctx.callbackQuery.message.message_id,
                undefined,
                message,
                { parse_mode: 'Markdown' }
            );
        } else {
            await safeReply(ctx, message, { parse_mode: 'Markdown' });
        }

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error handling update email callback', {
            error: err.message,
            stack: err.stack,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id
        });
        if ('answerCbQuery' in ctx) {
            await ctx.answerCbQuery('Error occurred');
        }
        await safeReply(ctx, '❌ An error occurred. Please try again.');
        return true;
    }
}

// Handle profile about callback  
async function handleAboutProfileCallback(ctx: BotContext): Promise<boolean> {
    try {
        // Answer the callback query
        if ('answerCbQuery' in ctx) {
            await ctx.answerCbQuery('Profile information...');
        }

        const aboutMessage = `ℹ️ **About Profile Management**\n\n` +
            `Your profile stores your email address for support tickets.\n\n` +
            `**What happens when you update your email:**\n` +
            `• Your new email will be used for all future support tickets\n` +
            `• You'll receive ticket updates at your new email address\n` +
            `• The change takes effect immediately\n\n` +
            `**Privacy & Security:**\n` +
            `• Your email is stored securely and only used for support\n` +
            `• We never share your email with third parties\n` +
            `• You can update or change it anytime using /profile\n\n` +
            `Use the **Update Email** button to change your email address.`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Back to Profile', 'back_to_profile')]
        ]);

        if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
            await safeEditMessageText(
                ctx,
                ctx.chat!.id,
                ctx.callbackQuery.message.message_id,
                undefined,
                aboutMessage,
                { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup }
            );
        } else {
            await safeReply(ctx, aboutMessage, { parse_mode: 'Markdown', ...keyboard });
        }

        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error handling about profile callback', {
            error: err.message,
            stack: err.stack,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id
        });
        if ('answerCbQuery' in ctx) {
            await ctx.answerCbQuery('Error occurred');
        }
        await safeReply(ctx, '❌ An error occurred. Please try again.');
        return true;
    }
}

// Handle back to profile callback
async function handleBackToProfileCallback(ctx: BotContext): Promise<boolean> {
    try {
        // Answer the callback query
        if ('answerCbQuery' in ctx) {
            await ctx.answerCbQuery('Returning to profile...');
        }

        // Simulate /profile command being called
        await profileCommand(ctx);
        return true;
    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error handling back to profile callback', {
            error: err.message,
            stack: err.stack,
            userId: ctx.from?.id,
            username: ctx.from?.username,
            chatId: ctx.chat?.id
        });
        if ('answerCbQuery' in ctx) {
            await ctx.answerCbQuery('Error occurred');
        }
        await safeReply(ctx, '❌ An error occurred. Please try again.');
        return true;
    }
}

// Export all command functions for use in other modules
export {
    startCommand,
    helpCommand,
    versionCommand,
    aboutCommand,
    profileCommand,
    supportCommand,
    cancelCommand,
    resetCommand,
    setupCommand,
    handleSetupCallbacks
};
