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
import { isValidAdmin, isActivatedAdmin, createAdminProfile, updateAdminLastActive, createSetupSession, canStartSetup, notifyOtherAdmins, isSessionExpired, getSessionTimeRemaining, createDmSetupSession, canStartDmSetup } from '../utils/adminManager.js';
import type { BotContext, SupportField, SupportFormState, ProfileUpdateState } from '../types/index.js';
import type { SetupSession } from '../sdk/types.js';
import { BotsStore } from '../sdk/bots-brain/index.js';

// Support form field enum
const SupportFieldEnum = {
  SUMMARY: 'summary' as const,
  EMAIL: 'email' as const,
  COMPLETE: 'complete' as const,
  PROFILE_EMAIL_UPDATE: 'profile_email_update' as const
};

// ================================
// Helper Functions
// ================================

/**
 * Generate setup progress indicator
 */
function getSetupProgressIndicator(step: string): string {
  const steps = {
    customer_selection: '🎯 Step 1/3: Customer Selection',
    customer_creation: '✏️ Step 2/3: Customer Creation', 
    customer_linking: '🔗 Step 3/3: Customer Linking',
    complete: '✅ Setup Complete'
  };
  return steps[step as keyof typeof steps] || '⚙️ Setup Progress';
}

/**
 * Validate setup session
 */
async function validateSetupSession(ctx: BotContext, setupState: any): Promise<{ isValid: boolean; message?: string }> {
  if (!setupState) {
    return {
      isValid: false,
      message: '❌ **Setup Session Expired**\n\nNo active setup session found. Please run `/setup` to start a new configuration process.'
    };
  }

  // Check if session is expired (basic check, could be enhanced)
  const now = new Date();
  const startedAt = new Date(setupState.startedAt);
  const timeDiff = now.getTime() - startedAt.getTime();
  const timeoutMs = 3 * 60 * 1000; // 3 minutes

  if (timeDiff > timeoutMs) {
    return {
      isValid: false,
      message: '⏰ **Setup Session Expired**\n\nYour setup session has expired. Please run `/setup` to start a new configuration process.'
    };
  }

  return { isValid: true };
}

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
• \`/activate\` - Activate admin profile for DM access (private chat only)

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
• Use \`/activate\` in private chat to enable DM notifications
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
        LogEngine.error('Error in aboutCommand', {
            error: err.message,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username
        });
        await safeReply(ctx, 'An error occurred while fetching bot information.');
    }
};

/**
 * Handler for the /activate command
 * 
 * This command allows valid admins to activate their profile for DM access.
 * Only works in private chats for security.
 */
const activateCommand = async (ctx: BotContext): Promise<void> => {
    try {
        // Only allow activation in private chats
        if (ctx.chat?.type !== 'private') {
            await safeReply(ctx,
                "🔒 **Security Notice**\n\n" +
                "The `/activate` command is only available in private chats for security reasons.\n\n" +
                "**To activate your admin profile:**\n" +
                "1. Start a private chat with me\n" +
                "2. Send `/activate` in the private chat\n" +
                "3. Follow the activation process\n\n" +
                "This ensures your admin credentials remain secure.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (!ctx.from) {
            await safeReply(ctx, "❌ **Error**: Unable to identify user.");
            return;
        }

        const telegramUserId = ctx.from.id;
        const telegramUsername = ctx.from.username;

        // Check if user is a valid admin
        if (!isValidAdmin(telegramUserId)) {
            await safeReply(ctx,
                "🔒 **Access Denied**\n\n" +
                "You are not authorized to use this command.\n\n" +
                "Only designated administrators can activate admin profiles.\n\n" +
                "If you believe this is an error, contact your system administrator.",
                { parse_mode: 'Markdown' }
            );

            LogEngine.warn('Unauthorized activate command attempt', {
                telegramUserId,
                username: telegramUsername
            });
            return;
        }

        // Check if admin is already activated
        const existingProfile = await BotsStore.getAdminProfile(telegramUserId);
        if (existingProfile && existingProfile.isActivated) {
            await safeReply(ctx,
                "✅ **Already Activated**\n\n" +
                "Your admin profile is already activated!\n\n" +
                `**Activated:** ${new Date(existingProfile.activatedAt).toLocaleString()}\n` +
                `**Last Active:** ${new Date(existingProfile.lastActiveAt).toLocaleString()}\n\n` +
                "You can now use admin commands like `/setup` in group chats.\n\n" +
                "**Available Admin Commands:**\n" +
                "• `/setup` - Configure group for support tickets\n" +
                "• `/help` - Show all available commands",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Activate admin profile
        const dmChatId = ctx.chat.id; // This is the private chat ID
        const success = await createAdminProfile(telegramUserId, dmChatId, telegramUsername);

        if (success) {
            await safeReply(ctx,
                "🎉 **Admin Profile Activated Successfully!**\n\n" +
                "Your admin profile has been activated and configured for DM access.\n\n" +
                "**What's next:**\n" +
                "• You can now use `/setup` command in group chats\n" +
                "• You'll receive DM notifications for setup activities\n" +
                "• Advanced features are now available to you\n\n" +
                "**Available Admin Commands:**\n" +
                "• `/setup` - Configure group for support tickets\n" +
                "• `/help` - Show all available commands\n\n" +
                "**Security:** Your admin access is now active and secured.",
                { parse_mode: 'Markdown' }
            );

            LogEngine.info('Admin profile activated successfully', {
                telegramUserId,
                username: telegramUsername,
                dmChatId
            });

            // Notify other admins about new activation
            await notifyOtherAdmins(
                telegramUserId,
                `👑 **New Admin Activated**\n\n` +
                `**User:** ${ctx.from.first_name || 'Unknown'} ${telegramUsername ? `(@${telegramUsername})` : ''}\n` +
                `**User ID:** ${telegramUserId}\n` +
                `**Activated:** ${new Date().toLocaleString()}\n\n` +
                `A new administrator has activated their profile and can now manage group configurations.`,
                async (chatId: number, message: string) => {
                    try {
                        await ctx.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                    } catch (error) {
                        LogEngine.error('Failed to send admin notification', {
                            error: (error as Error).message,
                            targetChatId: chatId,
                            newAdminId: telegramUserId
                        });
                    }
                }
            );

        } else {
            await safeReply(ctx,
                "❌ **Activation Failed**\n\n" +
                "There was an error activating your admin profile. Please try again.\n\n" +
                "If this error persists, contact your system administrator.",
                { parse_mode: 'Markdown' }
            );

            LogEngine.error('Failed to activate admin profile', {
                telegramUserId,
                username: telegramUsername
            });
        }

    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error in activateCommand', {
            error: err.message,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username
        });
        await safeReply(ctx,
            "❌ **Activation Error**\n\n" +
            "An unexpected error occurred during activation. Please try again later.\n\n" +
            "If this error persists, contact your system administrator.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Process text input for setup wizard
 */
export const processSetupTextInput = async (ctx: BotContext): Promise<boolean> => {
    try {
        if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
            return false;
        }

        const chatId = ctx.chat!.id;
        const setupState = await BotsStore.getSetupState(chatId);
        
        if (!setupState) {
            return false; // No active setup session
        }

        // Validate session
        const sessionValidation = await validateSetupSession(ctx, setupState);
        if (!sessionValidation.isValid) {
            return false;
        }

        // Check if waiting for text input
        const waitingForInput = setupState.metadata?.waitingForInput;
        if (!waitingForInput) {
            return false; // Not waiting for input
        }

        const userInput = ctx.message.text.trim();

        if (waitingForInput === 'customer_name') {
            // Handle custom customer name input
            await handleCustomerNameInput(ctx, setupState, userInput);
            return true;
        }

        return false;
    } catch (error) {
        LogEngine.error('Error in processSetupTextInput', {
            error: (error as Error).message,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
        });
        return false;
    }
};

/**
 * Handle custom customer name input
 */
const handleCustomerNameInput = async (ctx: BotContext, setupState: any, customerName: string): Promise<void> => {
    try {
        if (!customerName || customerName.length < 2) {
            await safeReply(ctx,
                "❌ **Invalid Customer Name**\n\n" +
                "Customer name must be at least 2 characters long. Please try again:",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Create customer with custom name
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(customerName);
            customerId = customer.id;
            actualCustomerName = customer.name;
            
            LogEngine.info('Customer created with custom name', {
                customerId,
                customerName: actualCustomerName,
                chatId: setupState.chatId
            });
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Failed to create customer with custom name', {
                error: err.message,
                customerName,
                chatId: setupState.chatId
            });
            
            const errorMessage = handleUnthreadApiError(error, 'Customer Creation');
            await safeReply(ctx, errorMessage + '\n\n💡 **Try again:** Run `/setup` to retry the configuration.', { parse_mode: 'Markdown' });
            
            // Clear setup state on error
            await BotsStore.clearSetupState(setupState.chatId);
            return;
        }
        
        // Store final group configuration
        const groupConfig = {
            chatId: setupState.chatId,
            chatTitle: setupState.metadata?.chatTitle || 'Unknown Group',
            isConfigured: true,
            customerId: customerId,
            customerName: actualCustomerName,
            setupBy: setupState.initiatedBy,
            setupAt: new Date().toISOString(),
            botIsAdmin: true,
            lastAdminCheck: new Date().toISOString(),
            setupVersion: '1.0',
            metadata: {
                setupMethod: 'custom_name',
                originalInput: customerName,
                apiIntegration: true,
                unthreadCustomerId: customerId
            }
        };

        await BotsStore.storeGroupConfig(groupConfig);
        await BotsStore.clearSetupState(setupState.chatId);

        const successMessage = `✅ **Setup Complete!**

**Customer Created:** ${actualCustomerName}
**Customer ID:** ${customerId}
**Group:** ${setupState.metadata?.chatTitle || 'Unknown Group'}

🎫 **Support tickets are now enabled** for this group!

Users can now use \`/support\` to create tickets that will be linked to this customer account.`;

        await safeReply(ctx, successMessage, { parse_mode: 'Markdown' });

        LogEngine.info('Setup completed with custom customer name', {
            chatId: setupState.chatId,
            customerName: actualCustomerName,
            customerId: customerId,
            setupBy: setupState.initiatedBy
        });

    } catch (error) {
        const err = error as Error;
        LogEngine.error('Error handling customer name input', {
            error: err.message,
            customerName,
            chatId: setupState.chatId
        });
        await safeReply(ctx,
            "❌ **Setup Error**\n\n" +
            "An error occurred while processing your input. Please try running `/setup` again.",
            { parse_mode: 'Markdown' }
        );
    }
};

// ================================
// Exports
// ================================

export {
    startCommand,
    helpCommand,
    versionCommand,
    aboutCommand,
    activateCommand,
    processSetupTextInput
};
