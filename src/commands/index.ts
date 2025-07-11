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
import { isValidAdmin, isActivatedAdmin, createAdminProfile, updateAdminLastActive, createSetupSession, canStartSetup, notifyOtherAdmins, isSessionExpired, getSessionTimeRemaining, createDmSetupSession, canStartDmSetup, notifyAdminsOfSetupCompletion, notifyAdminsOfTemplateChange, isDmSessionExpired, updateDmSetupSessionStep, addDmSessionMessageId, completeDmSetupSession, cancelDmSetupSession } from '../utils/adminManager.js';
import { TemplateManager } from '../utils/templateManager.js';
import type { BotContext, SupportField, SupportFormState, ProfileUpdateState } from '../types/index.js';
import type { SetupSession, GroupConfig } from '../sdk/types.js';
import { BotsStore } from '../sdk/bots-brain/index.js';

// Support form field enum
const SupportFieldEnum = {
  SUMMARY: 'summary' as const,
  EMAIL: 'email' as const,
  COMPLETE: 'complete' as const,
  PROFILE_EMAIL_UPDATE: 'profile_email_update' as const
};

// ================================
// Error Handling Utilities
// ================================

/**
 * Enhanced error handling utility that preserves error type hierarchy
 * and provides comprehensive error information for logging and debugging
 */
interface ErrorDetails {
    message: string;
    name: string;
    stack?: string | undefined;
    code?: string | number | undefined;
    statusCode?: number | undefined;
    cause?: unknown;
    isOperational?: boolean | undefined;
    timestamp: string;
}

/**
 * Extract detailed error information while preserving original error types
 */
function getErrorDetails(error: unknown, context?: string): ErrorDetails {
    const timestamp = new Date().toISOString();
    
    // Handle Error instances (most common case)
    if (error instanceof Error) {
        const details: ErrorDetails = {
            message: error.message,
            name: error.name,
            stack: error.stack,
            timestamp
        };
        
        // Handle specific error types with additional properties
        if ('code' in error) {
            details.code = (error as any).code;
        }
        
        if ('statusCode' in error) {
            details.statusCode = (error as any).statusCode;
        }
        
        if ('cause' in error) {
            details.cause = (error as any).cause;
        }
        
        // Check for operational errors (user-facing vs system errors)
        if ('isOperational' in error) {
            details.isOperational = (error as any).isOperational;
        }
        
        return details;
    }
    
    // Handle string errors
    if (typeof error === 'string') {
        return {
            message: error,
            name: 'StringError',
            timestamp
        };
    }
    
    // Handle object errors with message property
    if (error && typeof error === 'object' && 'message' in error) {
        return {
            message: String((error as any).message),
            name: (error as any).name || 'UnknownObjectError',
            timestamp
        };
    }
    
    // Handle null, undefined, or other primitive types
    if (error === null) {
        return {
            message: 'Null error occurred',
            name: 'NullError',
            timestamp
        };
    }
    
    if (error === undefined) {
        return {
            message: 'Undefined error occurred',
            name: 'UndefinedError',
            timestamp
        };
    }
    
    // Fallback for any other type
    return {
        message: `Unknown error type: ${typeof error}. Value: ${String(error)}`,
        name: 'UnknownError',
        timestamp
    };
}

/**
 * Log error with enhanced details and optional context
 */
function logError(error: unknown, context: string, additionalData?: Record<string, any>): ErrorDetails {
    const errorDetails = getErrorDetails(error, context);
    
    const logData = {
        ...errorDetails,
        context,
        ...additionalData
    };
    
    // Use appropriate log level based on error type
    if (errorDetails.isOperational === false || errorDetails.name.includes('System')) {
        LogEngine.error(`System error in ${context}`, logData);
    } else if (errorDetails.statusCode && errorDetails.statusCode >= 500) {
        LogEngine.error(`Server error in ${context}`, logData);
    } else if (errorDetails.statusCode && errorDetails.statusCode >= 400) {
        LogEngine.warn(`Client error in ${context}`, logData);
    } else {
        LogEngine.error(`Error in ${context}`, logData);
    }
    
    return errorDetails;
}

// ================================
// Helper Functions
// ================================

/**
 * Validate customer name input
 * 
 * Performs basic validation (length, reserved words) but leaves
 * character validation to the Unthread API.
 */
interface CustomerNameValidationResult {
    isValid: boolean;
    sanitizedName?: string; // Note: "sanitized" here means trimmed, not character-sanitized
    error?: string;
    details?: string;
}

function validateCustomerName(input: string): CustomerNameValidationResult {
    // Step 1: Basic null/undefined checks
    if (!input || typeof input !== 'string') {
        return {
            isValid: false,
            error: 'Customer name is required',
            details: 'Please provide a valid customer name.'
        };
    }

    // Step 2: Trim whitespace and normalize
    const trimmed = input.trim();
    
    // Step 3: Length validation
    if (trimmed.length < 2) {
        return {
            isValid: false,
            error: 'Customer name too short',
            details: 'Customer name must be at least 2 characters long.'
        };
    }
    
    if (trimmed.length > 100) {
        return {
            isValid: false,
            error: 'Customer name too long',
            details: 'Customer name must not exceed 100 characters.'
        };
    }

    // Step 4: Prevent common abuse patterns
    const lowercased = trimmed.toLowerCase();
    const forbiddenWords = ['admin', 'administrator', 'root', 'system', 'null', 'undefined', 'test', 'demo'];
    if (forbiddenWords.some(word => lowercased === word || lowercased.startsWith(word + '_') || lowercased.endsWith('_' + word))) {
        return {
            isValid: false,
            error: 'Reserved name',
            details: 'This name is reserved and cannot be used.'
        };
    }

    // Return the original trimmed input without any sanitization
    // Let the Unthread API handle character validation
    return {
        isValid: true,
        sanitizedName: trimmed
    };
}

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
• \`/templates\` - Manage message templates (group chat only)

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
        const errorDetails = logError(error, 'versionCommand', {
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type,
            userId: ctx.from?.id,
            username: ctx.from?.username
        });
        
        // Provide user-friendly error message
        const userMessage = errorDetails.isOperational 
            ? `Error retrieving version information: ${errorDetails.message}`
            : 'Error retrieving version information. Please try again later.';
            
        await safeReply(ctx, userMessage);
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
        const errorDetails = logError(error, 'aboutCommand', {
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username
        });
        
        // Provide appropriate user message based on error type
        let userMessage = 'An error occurred while fetching bot information.';
        if (errorDetails.isOperational && errorDetails.message) {
            userMessage = `Unable to fetch bot information: ${errorDetails.message}`;
        }
        
        await safeReply(ctx, userMessage);
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
                        logError(error, 'notifyOtherAdmins', {
                            targetChatId: chatId,
                            newAdminId: telegramUserId,
                            notificationType: 'admin_activation'
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
        const errorDetails = logError(error, 'activateCommand', {
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type,
            telegramUserId: ctx.from?.id,
            username: ctx.from?.username,
            activationAttempt: true
        });
        
        // Provide context-appropriate error message
        let userMessage = "❌ **Activation Error**\n\n" +
            "An unexpected error occurred during activation. Please try again later.\n\n" +
            "If this error persists, contact your system administrator.";
        
        // Handle specific error types
        if (errorDetails.code === 'ENOTFOUND' || errorDetails.code === 'ECONNREFUSED') {
            userMessage = "❌ **Connection Error**\n\n" +
                "Unable to connect to the activation service. Please check your connection and try again.\n\n" +
                "If this error persists, contact your system administrator.";
        } else if (errorDetails.statusCode === 401 || errorDetails.statusCode === 403) {
            userMessage = "❌ **Authorization Error**\n\n" +
                "There was an authentication issue during activation. Please try again.\n\n" +
                "If this error persists, contact your system administrator.";
        } else if (errorDetails.isOperational && errorDetails.message.includes('timeout')) {
            userMessage = "❌ **Timeout Error**\n\n" +
                "The activation process timed out. Please try again.\n\n" +
                "If this error persists, contact your system administrator.";
        }
        
        await safeReply(ctx, userMessage, { parse_mode: 'Markdown' });
    }
};

/**
 * Process text input for setup wizard
 */
const processSetupTextInput = async (ctx: BotContext): Promise<boolean> => {
    try {
        if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
            return false;
        }

        const chatId = ctx.chat!.id;
        const userId = ctx.from.id;
        const userInput = ctx.message.text.trim();

        // First, check for session-based setup (new approach for DM-based setup)
        if (ctx.chat?.type === 'private') {
            const session = await BotsStore.getActiveSetupSessionByAdmin(userId);
            if (session) {
                if (session.currentStep === 'waiting_for_custom_name') {
                    await handleSessionCustomerNameInput(ctx, session, userInput);
                    return true;
                } else if (session.currentStep === 'waiting_for_customer_id') {
                    await handleSessionCustomerIdInput(ctx, session, userInput);
                    return true;
                }
            }
        }

        // Legacy setup state handling (keep for backwards compatibility)
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

        if (waitingForInput === 'customer_name') {
            // Handle custom customer name input
            await handleCustomerNameInput(ctx, setupState, userInput);
            return true;
        }

        return false;
    } catch (error) {
        logError(error, 'processSetupTextInput', {
            chatId: ctx.chat?.id,
            userId: ctx.from?.id,
            chatType: ctx.chat?.type,
            hasMessage: !!(ctx.message && 'text' in ctx.message),
            messageType: ctx.message && 'text' in ctx.message ? 'text' : typeof ctx.message
        });
        return false;
    }
};

/**
 * Handle custom customer name input
 */
const handleCustomerNameInput = async (ctx: BotContext, setupState: any, customerName: string): Promise<void> => {
    let sanitizedName = customerName; // Initialize with original input for error logging
    
    try {
        // Validate the customer name input (let API handle character restrictions)
        const validation = validateCustomerName(customerName);
        
        if (!validation.isValid) {
            const errorMessage = `❌ **${validation.error}**\n\n` +
                `${validation.details}\n\n` +
                `**Requirements:**\n` +
                `• Length: 2-100 characters\n` +
                `• No reserved words (admin, system, etc.)\n` +
                `• Character restrictions will be validated by the API\n\n` +
                `Please try again with a valid customer name:`;
            
            await safeReply(ctx, errorMessage, { parse_mode: 'Markdown' });
            
            LogEngine.warn('Customer name validation failed', {
                chatId: setupState.chatId,
                originalInput: customerName,
                error: validation.error,
                details: validation.details,
                inputLength: customerName?.length || 0
            });
            
            return;
        }

        // Use the validated name (no sanitization applied)
        sanitizedName = validation.sanitizedName!;
        
        // Log successful validation (no sanitization performed)
        LogEngine.info('Customer name validated successfully', {
            chatId: setupState.chatId,
            customerName: sanitizedName,
            inputLength: customerName.length
        });

        // Create customer with sanitized name
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(sanitizedName);
            customerId = customer.id;
            actualCustomerName = customer.name;
            
            LogEngine.info('Customer created successfully', {
                customerId,
                customerName: actualCustomerName,
                userInput: customerName,
                chatId: setupState.chatId
            });
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Failed to create customer', {
                error: err.message,
                userInput: customerName,
                customerName: sanitizedName,
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
                userInput: customerName,
                apiIntegration: true,
                unthreadCustomerId: customerId
            }
        };

        await BotsStore.storeGroupConfig(groupConfig);
        await BotsStore.clearSetupState(setupState.chatId);

        // Initialize default message templates for the group
        try {
            const templateManager = new TemplateManager(BotsStore.getInstance());
            await templateManager.initializeDefaultTemplates(
                setupState.chatId,
                setupState.initiatedBy
            );
            LogEngine.info('Default templates initialized for group', {
                chatId: setupState.chatId,
                customerId: customerId
            });
        } catch (templateError) {
            LogEngine.warn('Failed to initialize default templates', {
                chatId: setupState.chatId,
                error: templateError instanceof Error ? templateError.message : 'Unknown error'
            });
            // Don't fail setup if template initialization fails
        }

        const successMessage = `✅ **Setup Complete!**

**Customer Created:** ${actualCustomerName}
**Customer ID:** ${customerId}
**Group:** ${setupState.metadata?.chatTitle || 'Unknown Group'}

🎫 **Support tickets are now enabled** for this group!

Users can now use \`/support\` to create tickets that will be linked to this customer account.`;

        await safeReply(ctx, successMessage, { parse_mode: 'Markdown' });

        // Notify other admins about setup completion
        try {
            const notificationResult = await notifyAdminsOfSetupCompletion(
                setupState.chatId,
                setupState.initiatedBy,
                ctx.telegram,
                setupState.metadata?.chatTitle
            );
            
            LogEngine.info('Admin notification completed', {
                chatId: setupState.chatId,
                success: notificationResult.success,
                failed: notificationResult.failed,
                skipped: notificationResult.skipped
            });
        } catch (notificationError) {
            LogEngine.error('Failed to send admin notifications', {
                error: notificationError instanceof Error ? notificationError.message : 'Unknown error',
                chatId: setupState.chatId,
                setupBy: setupState.initiatedBy
            });
            // Don't fail setup if notifications fail
        }

        LogEngine.info('Setup completed successfully', {
            chatId: setupState.chatId,
            customerName: actualCustomerName,
            customerId: customerId,
            userInput: customerName,
            setupBy: setupState.initiatedBy
        });

    } catch (error) {
        const errorDetails = logError(error, 'handleCustomerNameInput', {
            userInput: customerName,
            customerName: sanitizedName,
            chatId: setupState.chatId,
            setupBy: setupState.initiatedBy,
            setupStep: 'customer_name_input'
        });
        
        // Provide specific error messages based on error type
        let userMessage = "❌ **Setup Error**\n\n" +
            "An error occurred while processing your input. Please try running `/setup` again.";
        
        if (errorDetails.code === 'ENOTFOUND' || errorDetails.code === 'ECONNREFUSED') {
            userMessage = "❌ **Connection Error**\n\n" +
                "Unable to connect to the customer service. Please check your connection and try running `/setup` again.";
        } else if (errorDetails.statusCode === 400) {
            userMessage = "❌ **Invalid Input**\n\n" +
                "The customer name format is invalid. Please try running `/setup` again with a different name.";
        } else if (errorDetails.statusCode === 409) {
            userMessage = "❌ **Customer Exists**\n\n" +
                "A customer with this name already exists. Please try running `/setup` again with a different name.";
        } else if (errorDetails.isOperational && errorDetails.message.includes('timeout')) {
            userMessage = "❌ **Timeout Error**\n\n" +
                "The setup process timed out. Please try running `/setup` again.";
        }
        
        await safeReply(ctx, userMessage, { parse_mode: 'Markdown' });
    }
};

/**
 * Handle session-based customer name input
 */
const handleSessionCustomerNameInput = async (ctx: BotContext, session: any, customerName: string): Promise<void> => {
    let sanitizedName = customerName;
    
    try {
        // Validate the customer name input (let API handle character restrictions)
        const validation = validateCustomerName(customerName);
        
        if (!validation.isValid) {
            const errorMessage = `❌ **${validation.error}**\n\n` +
                `${validation.details}\n\n` +
                `**Requirements:**\n` +
                `• Length: 2-100 characters\n` +
                `• No reserved words (admin, system, etc.)\n` +
                `• Character restrictions will be validated by the API\n\n` +
                `Please try again with a valid customer name:`;
            
            await safeReply(ctx, errorMessage, { parse_mode: 'Markdown' });
            return;
        }

        sanitizedName = validation.sanitizedName!;

        await safeReply(ctx,
            "⏳ **Creating Customer**\n\n" +
            `Creating new customer account: "${sanitizedName}"\n\n` +
            "Please wait...",
            { parse_mode: 'Markdown' }
        );

        // Create the customer
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(sanitizedName);
            customerId = customer.id;
            actualCustomerName = customer.name;
        } catch (error) {
            const errorMessage = handleUnthreadApiError(error, 'Customer Creation');
            await safeReply(ctx,
                errorMessage + '\n\n💡 **Try again:** Go to the group and run `/setup` to retry.',
                { parse_mode: 'Markdown' }
            );
            await BotsStore.deleteSetupSession(session.sessionId);
            return;
        }

        // Update the group configuration
        await updateGroupCustomerAssociation(ctx, session.groupChatId, customerId, actualCustomerName, 'custom_name');

        // Clean up the session after successful completion
        await BotsStore.deleteSetupSession(session.sessionId);

    } catch (error) {
        logError(error, 'handleSessionCustomerNameInput', {
            groupChatId: session.groupChatId,
            adminId: ctx.from?.id,
            customerName,
            sanitizedName
        });
        
        await safeReply(ctx,
            "❌ **Setup Error**\n\n" +
            "An error occurred during setup. Please try running `/setup` again in the group.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle session-based customer ID input
 */
const handleSessionCustomerIdInput = async (ctx: BotContext, session: any, customerId: string): Promise<void> => {
    try {
        // Validate the customer ID format
        if (!customerId || customerId.trim() === '') {
            await safeReply(ctx,
                "❌ **Invalid Customer ID**\n\n" +
                "Customer ID cannot be empty. Please enter a valid customer ID.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const trimmedCustomerId = customerId.trim();

        await safeReply(ctx,
            "🔍 **Validating Customer ID**\n\n" +
            `Checking if customer ID "${trimmedCustomerId}" exists in Unthread...\n\n` +
            "Please wait...",
            { parse_mode: 'Markdown' }
        );

        // Validate that the customer exists
        try {
            const validation = await validateCustomerExists(trimmedCustomerId);
            
            if (!validation.exists) {
                const errorMessage = validation.error || 'Customer not found';
                await safeReply(ctx,
                    "❌ **Customer Not Found**\n\n" +
                    `Customer ID "${trimmedCustomerId}" does not exist in your Unthread workspace.\n\n` +
                    `**Error:** ${errorMessage}\n\n` +
                    "**Please check:**\n" +
                    "• Customer ID is spelled correctly\n" +
                    "• Customer exists in your Unthread account\n" +
                    "• You have access to this customer\n\n" +
                    "Please try again with a valid customer ID:",
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            const customer = validation.customer!;
            const customerName = customer.name;

            await safeReply(ctx,
                "✅ **Customer Found**\n\n" +
                `**Customer ID:** ${trimmedCustomerId}\n` +
                `**Customer Name:** ${customerName}\n\n` +
                "Linking this customer to your group...",
                { parse_mode: 'Markdown' }
            );

            // Update the group configuration
            await updateGroupCustomerAssociation(ctx, session.groupChatId, trimmedCustomerId, customerName, 'existing_customer_id');

            // Clean up the session after successful completion
            await BotsStore.deleteSetupSession(session.sessionId);

        } catch (error) {
            const errorMessage = handleUnthreadApiError(error, 'Customer Validation');
            await safeReply(ctx,
                errorMessage + '\n\n💡 **Try again:** Enter a different customer ID or go to the group and run `/setup` to retry.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

    } catch (error) {
        logError(error, 'handleSessionCustomerIdInput', {
            groupChatId: session.groupChatId,
            adminId: ctx.from?.id,
            customerId
        });
        
        await safeReply(ctx,
            "❌ **Setup Error**\n\n" +
            "An error occurred during setup. Please try running `/setup` again in the group.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handler for the /templates command (admin only, group chats only)
 * 
 * This command allows admins to manage message templates for the group.
 */
const templatesCommand = async (ctx: BotContext): Promise<void> => {
    const chatId = ctx.chat?.id;
    const telegramUserId = ctx.from?.id;
    const chatType = ctx.chat?.type;

    if (!chatId || !telegramUserId) {
        await safeReply(ctx, '❌ Unable to determine chat or user information.');
        return;
    }

    // Only allow in group chats
    if (chatType === 'private') {
        await safeReply(ctx,
            "❌ **Templates Management**\n\n" +
            "Template management is only available in group chats where the bot is configured.\n\n" +
            "Please use this command in a group chat.",
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Check if user is admin
    if (!isAdminUser(telegramUserId)) {
        await safeReply(ctx,
            "❌ **Access Denied**\n\n" +
            "Only authorized administrators can manage message templates.\n\n" +
            "Contact your system administrator if you need access.",
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Check if admin is activated
    if (!await isActivatedAdmin(telegramUserId)) {
        await safeReply(ctx,
            "❌ **Admin Not Activated**\n\n" +
            "You must activate your admin profile first.\n\n" +
            "Send `/activate` to me in a private chat to get started.",
            { parse_mode: 'Markdown' }
        );
        return;
    }

    try {
        // Get template statistics for the group
        const templateManager = new TemplateManager(BotsStore.getInstance());
        const stats = await templateManager.getTemplateStats(chatId);

        const templatesInfo = `📝 **Message Templates**

**Current Statistics:**
• Total Templates: ${stats.totalTemplates}
• Active Templates: ${stats.activeTemplates}
• Last Modified: ${stats.lastModified ? new Date(stats.lastModified).toLocaleString() : 'Never'}

**Template Types:**${Object.entries(stats.templatesByType).map(([type, count]) => 
    `\n• ${type.replace(/_/g, ' ')}: ${count}`
).join('')}

**Available Actions:**
• \`/templates list\` - View all templates
• \`/templates create\` - Create new template
• \`/templates edit <id>\` - Edit template
• \`/templates preview <id>\` - Preview template

**Advanced:**
For advanced template management and customization, use the DM setup wizard:
Send me \`/setup\` in this group and choose "Advanced Setup" to configure templates with a guided interface.`;

        await safeReply(ctx, templatesInfo, { parse_mode: 'Markdown' });

        LogEngine.info('Templates command executed', {
            userId: telegramUserId,
            chatId: chatId,
            username: ctx.from?.username,
            templateStats: stats
        });

    } catch (error) {
        const errorDetails = logError(error, 'templatesCommand', {
            chatId,
            userId: telegramUserId,
            chatType: ctx.chat?.type,
            username: ctx.from?.username,
            isAdmin: isAdminUser(telegramUserId)
        });

        // Provide specific error messages based on error type
        let userMessage = "❌ **Templates Error**\n\n" +
            "An error occurred while loading template information. Please try again later.";
        
        if (errorDetails.code === 'ENOTFOUND' || errorDetails.code === 'ECONNREFUSED') {
            userMessage = "❌ **Connection Error**\n\n" +
                "Unable to connect to the template service. Please check your connection and try again.";
        } else if (errorDetails.statusCode === 404) {
            userMessage = "❌ **Templates Not Found**\n\n" +
                "No template configuration found for this group. Please run `/setup` to configure the group first.";
        } else if (errorDetails.isOperational && errorDetails.message.includes('permission')) {
            userMessage = "❌ **Permission Error**\n\n" +
                "Insufficient permissions to access template information. Please ensure you're activated with `/activate`.";
        }

        await safeReply(ctx, userMessage, { parse_mode: 'Markdown' });
    }
};

const supportCommand = async (ctx: BotContext): Promise<void> => {
    const chatType = ctx.chat?.type;
    
    if (chatType === 'private') {
        await safeReply(ctx,
            "🎫 **Support Ticket Creation**\n\n" +
            "Support tickets can only be created in group chats where this bot is configured.\n\n" +
            "**To create a support ticket:**\n" +
            "1. Go to a group chat where this bot is added\n" +
            "2. Ensure the group is configured (admins: use `/setup`)\n" +
            "3. Use `/support` in the group chat\n" +
            "4. Follow the guided prompts\n\n" +
            "**Need help?** Contact your group administrator or use `/help` for more information.",
            { parse_mode: 'Markdown' }
        );
    } else {
        // Check if group is configured
        const groupConfig = await BotsStore.getGroupConfig(ctx.chat!.id);
        
        if (!groupConfig?.isConfigured) {
            // Check if basic setup was started but not completed
            if (groupConfig && groupConfig.metadata?.setupPhase === 'basic_infrastructure') {
                await safeReply(ctx,
                    "⚠️ **Configuration In Progress**\n\n" +
                    "This group's basic setup is complete, but configuration is not finished yet.\n\n" +
                    "**Status:** Waiting for admin to complete DM setup wizard\n\n" +
                    "**For Administrators:**\n" +
                    "• Check your private messages for setup instructions\n" +
                    "• Complete the DM setup wizard to finish configuration\n" +
                    "• Support tickets will be available after completion\n\n" +
                    "**For Users:**\n" +
                    "• Please wait for the administrator to complete setup\n" +
                    "• Use `/help` to see currently available commands\n" +
                    "• You'll be notified when ticket creation is ready",
                    { parse_mode: 'Markdown' }
                );
            } else {
                await safeReply(ctx,
                    "⚙️ **Group Not Configured**\n\n" +
                    "This group is not yet configured for support tickets.\n\n" +
                    "**For Administrators:**\n" +
                    "• Use `/setup` to configure this group\n" +
                    "• Ensure you're activated with `/activate` (in private chat)\n\n" +
                    "**For Users:**\n" +
                    "• Ask your group administrator to configure the bot\n" +
                    "• Check `/help` for available commands while waiting\n\n" +
                    "Once configured, you'll be able to create support tickets with `/support`.",
                    { parse_mode: 'Markdown' }
                );
            }
        } else {
            await safeReply(ctx,
                "🎫 **Support Ticket Creation**\n\n" +
                "Support ticket creation is ready but requires group configuration.\n\n" +
                "**Current Status:**\n" +
                "✅ Group configuration system\n" +
                "✅ Admin management system\n" +
                "✅ Message template system\n" +
                "✅ Customer linking system\n\n" +
                "**To enable support tickets:**\n" +
                "• Ask your group administrator to run `/setup`\n" +
                "• Use `/help` to see available commands\n" +
                "• Check `/about` for project information",
                { parse_mode: 'Markdown' }
            );
        }
    }
};

const cancelCommand = async (ctx: BotContext): Promise<void> => {
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;
    
    if (!userId) {
        await safeReply(ctx, "❌ Unable to identify user for cancel operation.");
        return;
    }
    
    // Check for active sessions that could be cancelled
    const hasActiveSetup = chatType !== 'private' ? await BotsStore.getSetupState(ctx.chat!.id) : null;
    const hasActiveDmSession = chatType === 'private' ? await BotsStore.getActiveDmSetupSessionByAdmin(userId) : null;
    
    if (hasActiveSetup || hasActiveDmSession) {
        // There are active sessions - provide clear cancellation options
        await safeReply(ctx,
            "🛑 **Cancel Operation**\n\n" +
            "You have active sessions that can be cancelled.\n\n" +
            "**Current Options:**\n" +
            "• Active sessions will timeout automatically (3-5 minutes)\n" +
            "• You can wait for timeout or start a new session\n" +
            "• New sessions will override existing ones\n\n" +
            "**Quick Actions:**\n" +
            "• Start a new `/setup` to override current session\n" +
            "• Wait a few minutes for automatic cleanup\n\n" +
            "**Need Help?** Contact your administrator or use `/help` for available commands.",
            { parse_mode: 'Markdown' }
        );
    } else {
        await safeReply(ctx,
            "✅ **No Active Operations**\n\n" +
            "You don't have any active operations to cancel right now.\n\n" +
            "**The `/cancel` command can stop:**\n" +
            "• Support ticket creation flows\n" +
            "• Setup configuration processes\n" +
            "• Template editing sessions\n" +
            "• Profile update processes\n\n" +
            "**Start something to cancel:**\n" +
            "• Use `/support` to create a ticket\n" +
            "• Use `/setup` to configure group (admins)\n" +
            "• Use `/templates` to manage templates\n\n" +
            "**Need help?** Use `/help` to see available commands.",
            { parse_mode: 'Markdown' }
        );
    }
};

const resetCommand = async (ctx: BotContext): Promise<void> => {
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;
    
    if (!userId) {
        await safeReply(ctx, "❌ Unable to identify user for reset operation.");
        return;
    }
    
    await safeReply(ctx,
        "🔄 **Reset User State**\n\n" +
        "The reset functionality helps you start fresh with a clean state.\n\n" +
        "**Reset Capabilities:**\n" +
        "• Clear your conversation state\n" +
        "• Cancel any active support flows\n" +
        "• Reset form data and temporary sessions\n" +
        "• Preserve your profile and group settings\n\n" +
        "**Current Options:**\n" +
        "• Sessions auto-expire after 3-5 minutes\n" +
        "• Starting new commands overrides old sessions\n" +
        "• Use `/cancel` to stop current operations\n\n" +
        "**Advanced Features:**\n" +
        "• Use `/setup` to restart group configuration\n" +
        "• Use `/profile` to manage your profile\n" +
        "• Contact administrators for advanced reset options\n\n" +
        "**Need Help?** Use `/help` to see available commands or contact your administrator.",
        { parse_mode: 'Markdown' }
    );
};

const setupCommand = async (ctx: BotContext): Promise<void> => {
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id;
    
    if (!userId) {
        await safeReply(ctx, "❌ Unable to identify user.");
        return;
    }
    
    if (chatType === 'private') {
        await safeReply(ctx,
            "⚙️ **Group Setup Configuration**\n\n" +
            "Group setup can only be performed in group chats.\n\n" +
            "**To configure a group:**\n" +
            "1. Go to the group chat you want to configure\n" +
            "2. Ensure you're an authorized administrator\n" +
            "3. Make sure you've activated your admin profile (`/activate` here in DM)\n" +
            "4. Use `/setup` in the group chat\n\n" +
            "**Prerequisites for admins:**\n" +
            "• Must be in the authorized admin list\n" +
            "• Must have activated admin profile (use `/activate` here)\n" +
            "• Bot must be added to the target group\n\n" +
            "**Need activation?** Send `/activate` here to enable your admin access.",
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Check admin permissions
    if (!isAdminUser(userId)) {
        await safeReply(ctx,
            "❌ **Access Denied**\n\n" +
            "Only authorized administrators can configure group settings.\n\n" +
            "**For non-admin users:**\n" +
            "• Ask your group administrator to run `/setup`\n" +
            "• Use `/help` to see available user commands\n" +
            "• Once configured, you'll be able to create support tickets\n\n" +
            "**For potential admins:**\n" +
            "Contact your system administrator to be added to the admin list.",
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    if (!await isActivatedAdmin(userId)) {
        await safeReply(ctx,
            "❌ **Admin Not Activated**\n\n" +
            "You must activate your admin profile before configuring groups.\n\n" +
            "**To activate:**\n" +
            "1. Start a private chat with me\n" +
            "2. Send `/activate` in the private chat\n" +
            "3. Complete the activation process\n" +
            "4. Return here and use `/setup` again\n\n" +
            "**Why activation is required:**\n" +
            "• Enables secure DM notifications\n" +
            "• Unlocks advanced admin features\n" +
            "• Ensures proper session management\n\n" +
            "Once activated, you'll have full access to group configuration tools.",
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Check for existing setup session
    if (!await canStartSetup(userId)) {
        const existingSession = await BotsStore.getActiveSetupSessionByAdmin(userId);
        if (existingSession && !isSessionExpired(existingSession)) {
            const timeRemaining = getSessionTimeRemaining(existingSession);
            await safeReply(ctx,
                "⏳ **Setup Session Active**\n\n" +
                `You already have an active setup session.\n\n` +
                `**Session expires in:** ${timeRemaining}\n\n` +
                "Please complete or wait for the current session to expire before starting a new one.",
                { parse_mode: 'Markdown' }
            );
            return;
        }
    }

    const chatId = ctx.chat!.id;
    const chatTitle = ctx.chat!.title || `Chat ${chatId}`;

    try {
        // Create setup session
        const sessionId = await createSetupSession(chatId, chatTitle, userId);
        if (!sessionId) {
            throw new Error('Failed to create setup session');
        }
        
        const session = await BotsStore.getSetupSession(sessionId);
        if (!session) {
            throw new Error('Failed to retrieve setup session');
        }
        
        // Start the setup wizard
        await performGroupSetup(ctx, session, userId, chatId, chatTitle);
        
    } catch (error) {
        LogEngine.error('Setup command failed', {
            error: (error as Error).message,
            userId,
            chatId,
            chatType: ctx.chat?.type
        });
        
        await safeReply(ctx,
            "❌ **Setup Failed**\n\n" +
            "An error occurred while starting the setup process.\n\n" +
            "Please try again in a few moments. If the issue persists, contact your system administrator.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Perform the actual group setup process
 */
const performGroupSetup = async (ctx: BotContext, session: SetupSession, userId: number, chatId: number, chatTitle: string): Promise<void> => {
    try {
        // Step 1: Check if group is already configured
        const existingConfig = await BotsStore.getGroupConfig(chatId);
        
        if (existingConfig?.isConfigured) {
            await handleExistingGroupSetup(ctx, existingConfig, userId, chatId, chatTitle);
            return;
        }

        // Step 2: Perform bot admin check
        const botAdminCheck = await checkAndPromptBotAdmin(ctx);
        if (!botAdminCheck) {
            return;
        }

        // Step 3: Show simplified onboarding in group chat
        await showSimpleGroupOnboarding(ctx, session, userId, chatId, chatTitle);
        
    } catch (error) {
        LogEngine.error('Group setup process failed', {
            error: (error as Error).message,
            userId,
            chatId,
            chatTitle
        });
        
        await safeReply(ctx,
            "❌ **Setup Process Failed**\n\n" +
            "An error occurred during the group configuration process.\n\n" +
            `**Error:** ${(error as Error).message}\n\n` +
            "**What to try:**\n" +
            "• Ensure I have admin permissions in this group\n" +
            "• Try running `/setup` again\n" +
            "• Contact your system administrator if the issue persists\n\n" +
            "Your session has been cleared and you can retry the setup process.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle setup for groups that are already configured
 */
const handleExistingGroupSetup = async (ctx: BotContext, existingConfig: GroupConfig, userId: number, chatId: number, chatTitle: string): Promise<void> => {
    // Send DM to admin asking if they want to update customer ID
    const adminProfile = await BotsStore.getAdminProfile(userId);
    if (!adminProfile?.dmChatId) {
        await safeReply(ctx,
            "✅ **Group Already Configured**\n\n" +
            `This group is already set up and ready for use.\n\n` +
            `**Current Configuration:**\n` +
            `• Customer: ${existingConfig.customerName || 'Default'}\n` +
            `• Setup: ${existingConfig.setupAt ? new Date(existingConfig.setupAt).toLocaleString() : 'Unknown'}\n\n` +
            `**To update settings:** Send me \`/activate\` in private chat first, then use \`/setup\` again.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Send DM asking about customer ID update
    await ctx.telegram.sendMessage(
        adminProfile.dmChatId,
        "🔄 **Update Group Configuration**\n\n" +
        `**Group:** ${chatTitle}\n` +
        `**Current Customer:** ${existingConfig.customerName || 'Default'}\n\n` +
        `This group is already configured. Do you want to update the customer ID?`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄 Update Customer ID", callback_data: `update_customer_${chatId}` }],
                    [{ text: "✅ Keep Current Settings", callback_data: `keep_settings_${chatId}` }]
                ]
            }
        }
    );

    await safeReply(ctx,
        "✅ **Group Already Configured**\n\n" +
        `Check your private messages for update options.\n\n` +
        `**Current Status:** Ready for support tickets\n` +
        `**Commands Available:** \`/support\`, \`/templates\`, \`/help\``,
        { parse_mode: 'Markdown' }
    );
};

/**
 * Show simplified group onboarding with just two buttons
 */
const showSimpleGroupOnboarding = async (ctx: BotContext, session: SetupSession, userId: number, chatId: number, chatTitle: string): Promise<void> => {
    // Extract a clean customer name suggestion from the group title
    const suggestedCustomerName = extractCustomerNameFromTitle(chatTitle);
    
    // Send DM with simple onboarding
    const adminProfile = await BotsStore.getAdminProfile(userId);
    if (!adminProfile?.dmChatId) {
        await safeReply(ctx,
            "❌ **Setup Error**\n\n" +
            "Unable to send setup instructions. Please activate your admin profile first:\n\n" +
            "1. Send me `/activate` in private chat\n" +
            "2. Return here and use `/setup` again",
            { parse_mode: 'Markdown' }
        );
        return;
    }

    await ctx.telegram.sendMessage(
        adminProfile.dmChatId,
        "🎯 **Group Setup**\n\n" +
        `**Group:** ${chatTitle}\n\n` +
        `**Recommended Customer Name:**\n` +
        `"${suggestedCustomerName}"\n\n` +
        `Choose how to set up this group:`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: `✅ Proceed with '${suggestedCustomerName}'`, callback_data: `proceed_suggested_${chatId}` }],
                    [{ text: "� Use Different Name", callback_data: `custom_name_${chatId}` }],
                    [{ text: "�🔗 Use Existing Customer ID", callback_data: `use_existing_${chatId}` }],
                    [{ text: "❌ Cancel Setup", callback_data: `cancel_setup_${chatId}` }]
                ]
            }
        }
    );

    // Store the suggested name in session (we'll need to extend this or use a different approach)
    // For now, we'll store it in the currentStep field with a prefix
    await BotsStore.updateSetupSession(session.sessionId, {
        currentStep: `waiting_customer_choice:${suggestedCustomerName}`
    });

    await safeReply(ctx,
        "✅ **Setup Started**\n\n" +
        `Check your private messages to complete the setup for **${chatTitle}**.\n\n` +
        `⚡ **Quick Setup:** Just two simple choices in your DM!`,
        { parse_mode: 'Markdown' }
    );
};

/**
 * Extract a clean customer name from group title
 */
const extractCustomerNameFromTitle = (chatTitle: string): string => {
    // Clean up the chat title to create a suggested customer name
    let suggested = chatTitle
        // Remove common prefixes/suffixes
        .replace(/^(group|chat|team|support|help|customer)\s*/i, '')
        .replace(/\s*(group|chat|team|support|help)$/i, '')
        // Remove special characters but keep alphanumeric, spaces, hyphens, apostrophes
        .replace(/[^\w\s\-']/g, ' ')
        // Normalize spaces
        .replace(/\s+/g, ' ')
        .trim();

    // If too short or empty after cleaning, use the original title
    if (suggested.length < 3) {
        suggested = chatTitle.replace(/[^\w\s\-']/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Capitalize first letter of each word for better presentation
    suggested = suggested.replace(/\b\w/g, l => l.toUpperCase());

    // Fallback if still problematic
    if (suggested.length < 2) {
        suggested = 'Customer ' + Date.now().toString().slice(-4);
    }

    return suggested;
};

/**
 * Phase 4: Simplified Group Setup Handlers
 */

/**
 * Handle "Proceed with suggested name" choice
 */
const handleProceedWithSuggested = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        // Get the active setup session to retrieve the suggested name
        const session = await BotsStore.getActiveSetupSessionByAdmin(adminId);
        if (!session || session.groupChatId !== groupChatId) {
            await ctx.editMessageText(
                "❌ **Session Error**\n\nSetup session not found or expired. Please start the setup process again.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Extract suggested name from session currentStep
        const stepParts = session.currentStep.split(':');
        const suggestedName = stepParts.length > 1 ? stepParts[1] : `Customer ${Date.now().toString().slice(-4)}`;

        // Validate the suggested name (ensure it's not undefined)
        if (!suggestedName) {
            await ctx.editMessageText(
                "❌ **Session Error**\n\nUnable to retrieve suggested customer name. Please start setup again.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const validation = validateCustomerName(suggestedName);
        if (!validation.isValid) {
            await ctx.editMessageText(
                "❌ **Invalid Name**\n\n" +
                `The suggested name "${suggestedName}" is not valid.\n\n` +
                "Please use the 'Enter Custom Name' option instead.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const sanitizedName = validation.sanitizedName!;

        await ctx.editMessageText(
            "⏳ **Creating Customer**\n\n" +
            `Creating new customer account: "${sanitizedName}"\n\n` +
            "Please wait...",
            { parse_mode: 'Markdown' }
        );

        // Create the customer
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(sanitizedName);
            customerId = customer.id;
            actualCustomerName = customer.name;
        } catch (error) {
            const errorMessage = handleUnthreadApiError(error, 'Customer Creation');
            await safeReply(ctx,
                errorMessage + '\n\n💡 **Try again:** Go to the group and run `/setup` to retry.',
                { parse_mode: 'Markdown' }
            );
            await BotsStore.deleteSetupSession(session.sessionId);
            return;
        }

        // Complete the group setup - for existing groups, use the customer update flow
        await updateGroupCustomerAssociation(ctx, session.groupChatId, customerId, actualCustomerName, 'suggested_name');

    } catch (error) {
        logError(error, 'handleProceedWithSuggested', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Setup Error**\n\n" +
            "An error occurred during setup. Please try running `/setup` again in the group.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle "Use existing customer ID" choice - actual implementation
 */
const handleUseExistingCustomer = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        // Get the active setup session
        const session = await BotsStore.getActiveSetupSessionByAdmin(adminId);
        if (!session || session.groupChatId !== groupChatId) {
            await ctx.editMessageText(
                "❌ **Session Error**\n\nSetup session not found or expired. Please start the setup process again.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Update session to wait for customer ID input
        await BotsStore.updateSetupSession(session.sessionId, {
            currentStep: 'waiting_for_customer_id'
        });

        await ctx.editMessageText(
            "🔗 **Enter Customer ID**\n\n" +
            "Please type the existing customer ID you'd like to use for this group.\n\n" +
            "**Guidelines:**\n" +
            "• Enter the exact Customer ID from Unthread\n" +
            "• The customer ID will be validated before linking\n" +
            "• Customer must exist in your Unthread workspace\n\n" +
            "**Example:** `cust_1234567890abcdef` or `customer-abc-123`",
            { parse_mode: 'Markdown' }
        );

        // In the group chat, provide a hint
        await ctx.telegram.sendMessage(
            groupChatId,
            "🔗 **Customer ID Required**\n\n" +
            "Check your private messages to enter an existing customer ID for this group.",
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        logError(error, 'handleUseExistingCustomer', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Error**\n\nAn error occurred. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle canceling customer update
 */
const handleCancelCustomerUpdate = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        const groupConfig = await BotsStore.getGroupConfig(groupChatId);
        
        // Clear any active setup session for this admin
        const activeSession = await BotsStore.getActiveSetupSessionByAdmin(adminId);
        if (activeSession) {
            await BotsStore.deleteSetupSession(activeSession.sessionId);
            LogEngine.info('Cleared setup session after canceling customer update', {
                adminId,
                groupChatId,
                sessionId: activeSession.sessionId
            });
        }
        
        await ctx.editMessageText(
            "✅ **Update Cancelled**\n\n" +
            `Customer association remains unchanged.\n\n` +
            `**Current Customer:** ${groupConfig?.customerName || 'Default'}\n` +
            `**Status:** Ready for support tickets\n\n` +
            "**Available Commands:**\n" +
            "• `/support` - Create support tickets\n" +
            "• `/templates` - Manage message templates\n" +
            "• `/help` - Show all commands",
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        logError(error, 'handleCancelCustomerUpdate', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Error**\n\nAn error occurred. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Update group customer association with new customer details
 */
const updateGroupCustomerAssociation = async (
    ctx: BotContext,
    groupChatId: number,
    customerId: string,
    customerName: string,
    updateMethod: string
): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        // Get current configuration
        const currentConfig = await BotsStore.getGroupConfig(groupChatId);
        
        // Handle both new group setup and existing group updates
        let isNewGroup = false;
        let groupTitle = '';
        let existingConfig: GroupConfig | null = currentConfig;
        
        if (!currentConfig) {
            // This is a new group setup - we need to create the initial configuration
            isNewGroup = true;
            
            // Try to get group title from the session or use a default
            const session = await BotsStore.getActiveSetupSessionByAdmin(adminId);
            groupTitle = `Group ${groupChatId}`; // Use a default since groupChatTitle might not exist
            
            // Create a minimal config for new groups
            existingConfig = {
                chatId: groupChatId,
                chatTitle: groupTitle,
                isConfigured: false, // Will be set to true after customer association
                setupBy: adminId,
                setupAt: new Date().toISOString(),
                botIsAdmin: true,
                lastAdminCheck: new Date().toISOString(),
                setupVersion: '1.0',
                metadata: {
                    setupPhase: 'customer_setup'
                }
            };
            
            LogEngine.info('Creating initial group configuration', {
                groupChatId,
                groupTitle,
                adminId,
                updateMethod
            });
        } else {
            groupTitle = currentConfig.chatTitle || `Group ${groupChatId}`;
            LogEngine.info('Updating existing group configuration', {
                groupChatId,
                groupTitle,
                currentCustomerId: currentConfig.customerId,
                currentCustomerName: currentConfig.customerName,
                updateMethod
            });
        }

        // Store previous customer info for logging (existingConfig is guaranteed to exist at this point)
        const previousCustomerId = existingConfig!.customerId;
        const previousCustomerName = existingConfig!.customerName;

        // Update the configuration
        const updatedConfig: GroupConfig = {
            ...existingConfig!,
            customerId: customerId,
            customerName: customerName,
            isConfigured: true,
            lastUpdatedAt: new Date().toISOString(),
            metadata: {
                ...existingConfig!.metadata,
                lastUpdateMethod: updateMethod,
                previousCustomerId: previousCustomerId,
                previousCustomerName: previousCustomerName,
                updateHistory: [
                    ...((existingConfig!.metadata?.updateHistory as any[]) || []),
                    {
                        timestamp: new Date().toISOString(),
                        adminId: adminId,
                        action: 'customer_update',
                        previousCustomerId: previousCustomerId,
                        newCustomerId: customerId,
                        method: updateMethod
                    }
                ]
            }
        };

        // Save updated configuration
        await BotsStore.storeGroupConfig(updatedConfig);

        // Show success message - but only if we're in a context where we can edit messages
        // For DM-based sessions, we'll send a new message instead of editing
        const isDmContext = ctx.chat?.type === 'private';
        
        if (isDmContext) {
            // Send a new message in the DM
            await ctx.reply(
                "🎉 **Customer Updated Successfully!**\n\n" +
                `**Group:** ${groupTitle}\n` +
                `**Previous Customer:** ${previousCustomerName || 'Default'}\n` +
                `**New Customer:** ${customerName}\n` +
                `**Customer ID:** ${customerId}\n\n` +
                "✅ **Support tickets will now be associated with the new customer account.**\n\n" +
                "All future tickets from this group will be linked to this customer.",
                { parse_mode: 'Markdown' }
            );
        } else {
            // Try to edit the message for inline button contexts
            try {
                await ctx.editMessageText(
                    "🎉 **Customer Updated Successfully!**\n\n" +
                    `**Group:** ${groupTitle}\n` +
                    `**Previous Customer:** ${previousCustomerName || 'Default'}\n` +
                    `**New Customer:** ${customerName}\n` +
                    `**Customer ID:** ${customerId}\n\n` +
                    "✅ **Support tickets will now be associated with the new customer account.**\n\n" +
                    "All future tickets from this group will be linked to this customer.",
                    { parse_mode: 'Markdown' }
                );
            } catch (editError) {
                // If editing fails, send a new message instead
                await ctx.reply(
                    "🎉 **Customer Updated Successfully!**\n\n" +
                    `**Group:** ${groupTitle}\n` +
                    `**Previous Customer:** ${previousCustomerName || 'Default'}\n` +
                    `**New Customer:** ${customerName}\n` +
                    `**Customer ID:** ${customerId}\n\n` +
                    "✅ **Support tickets will now be associated with the new customer account.**\n\n" +
                    "All future tickets from this group will be linked to this customer.",
                    { parse_mode: 'Markdown' }
                );
                
                LogEngine.warn('Failed to edit message, sent new message instead', {
                    groupChatId: groupChatId,
                    error: editError instanceof Error ? editError.message : 'Unknown error'
                });
            }
        }

        // Notify the group chat about the update
        try {
            await ctx.telegram.sendMessage(
                groupChatId,
                "🔄 **Customer Association Updated**\n\n" +
                `**New Customer:** ${customerName}\n\n` +
                "✅ **What this means:**\n" +
                "• All new support tickets will be linked to this customer\n" +
                "• Group functionality remains the same\n" +
                "• Use `/support` to create tickets as usual\n\n" +
                "📋 **Commands available:** `/support`, `/help`, `/templates`",
                { parse_mode: 'Markdown' }
            );
        } catch (notificationError) {
            LogEngine.warn('Failed to notify group about customer update', {
                groupChatId: groupChatId,
                error: notificationError instanceof Error ? notificationError.message : 'Unknown error'
            });
        }

        LogEngine.info('Customer association updated successfully', {
            groupChatId: groupChatId,
            groupChatName: groupTitle,
            previousCustomerId: previousCustomerId,
            previousCustomerName: previousCustomerName,
            newCustomerId: customerId,
            newCustomerName: customerName,
            updateMethod: updateMethod,
            updatedBy: adminId
        });

    } catch (error) {
        logError(error, 'updateGroupCustomerAssociation', {
            groupChatId,
            customerId,
            customerName,
            updateMethod,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Update Error**\n\n" +
            "An error occurred while updating the customer association. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Phase 5: Customer ID Update Handlers
 */

/**
 * Handle customer ID update choice for existing groups - Phase 5 Implementation
 */
const handleUpdateCustomerChoice = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        // Get current group configuration
        const groupConfig = await BotsStore.getGroupConfig(groupChatId);
        if (!groupConfig) {
            await ctx.editMessageText(
                "❌ **Configuration Not Found**\n\n" +
                "Unable to find configuration for this group.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        await ctx.editMessageText(
            "🔄 **Update Customer Association**\n\n" +
            `**Group:** ${groupConfig.chatTitle}\n` +
            `**Current Customer:** ${groupConfig.customerName || 'Default'}\n` +
            `**Customer ID:** ${groupConfig.customerId || 'N/A'}\n\n` +
            "Choose how to update the customer association:",
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✏️ Create New Customer", callback_data: `create_new_customer_${groupChatId}` }],
                        [{ text: "🔗 Use Existing Customer ID", callback_data: `link_existing_customer_${groupChatId}` }],
                        [{ text: "❌ Cancel", callback_data: `cancel_customer_update_${groupChatId}` }]
                    ]
                }
            }
        );

    } catch (error) {
        logError(error, 'handleUpdateCustomerChoice', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Update Error**\n\n" +
            "An error occurred while loading update options. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle creating new customer for existing group
 */
const handleCreateNewCustomerForGroup = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        const groupConfig = await BotsStore.getGroupConfig(groupChatId);
        if (!groupConfig) {
            await ctx.editMessageText(
                "❌ **Configuration Not Found**\n\n" +
                "Unable to find configuration for this group.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Extract suggested name from group title
        const chatTitle = groupConfig.chatTitle || 'Unknown Group';
        const suggestedName = extractCustomerNameFromTitle(chatTitle);

        await ctx.editMessageText(
            "✏️ **Create New Customer**\n\n" +
            `**Group:** ${groupConfig.chatTitle}\n\n` +
            `**Suggested Customer Name:**\n` +
            `"${suggestedName}"\n\n` +
            "Choose an option:",
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `✅ Use '${suggestedName}'`, callback_data: `confirm_new_customer_${groupChatId}_${encodeURIComponent(suggestedName)}` }],
                        [{ text: "✏️ Enter Custom Name", callback_data: `custom_customer_name_${groupChatId}` }],
                        [{ text: "⬅️ Back", callback_data: `update_customer_${groupChatId}` }]
                    ]
                }
            }
        );

    } catch (error) {
        logError(error, 'handleCreateNewCustomerForGroup', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Error**\n\n" +
            "An error occurred. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle confirming new customer creation with suggested name
 */
const handleConfirmNewCustomer = async (ctx: BotContext, groupChatId: number, customerName: string): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        // Decode the customer name
        const decodedName = decodeURIComponent(customerName);
        
        // Validate the name
        const validation = validateCustomerName(decodedName);
        if (!validation.isValid) {
            await ctx.editMessageText(
                "❌ **Invalid Name**\n\n" +
                `The suggested name "${decodedName}" is not valid.\n\n` +
                "Please use the 'Enter Custom Name' option instead.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const sanitizedName = validation.sanitizedName!;

        await ctx.editMessageText(
            "⏳ **Creating Customer**\n\n" +
            `Creating new customer account: "${sanitizedName}"\n\n` +
            "Please wait...",
            { parse_mode: 'Markdown' }
        );

        // Create the customer
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(sanitizedName);
            customerId = customer.id;
            actualCustomerName = customer.name;
        } catch (error) {
            const errorMessage = handleUnthreadApiError(error, 'Customer Creation');
            await ctx.editMessageText(
                errorMessage + '\n\n⬅️ **Go back:** Choose a different option.',
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "⬅️ Back to Options", callback_data: `update_customer_${groupChatId}` }]
                        ]
                    }
                }
            );
            return;
        }

        // Update the group configuration
        await updateGroupCustomerAssociation(ctx, groupChatId, customerId, actualCustomerName, 'new_customer_created');

    } catch (error) {
        logError(error, 'handleConfirmNewCustomer', {
            groupChatId,
            customerName: customerName,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Creation Error**\n\n" +
            "An error occurred while creating the customer. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle linking to existing customer (future enhancement)
 */
const handleLinkExistingCustomer = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    await ctx.editMessageText(
        "🔗 **Link Existing Customer**\n\n" +
        "This feature allows you to link this group to an existing customer account.\n\n" +
        "**Planned Features:**\n" +
        "• Search existing customers by name\n" +
        "• Browse customer list with pagination\n" +
        "• Link group to selected customer\n" +
        "• Verify customer details before linking\n\n" +
        "**For now:** Use 'Create New Customer' to set up a new customer account.",
        { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⬅️ Back to Options", callback_data: `update_customer_${groupChatId}` }]
                ]
            }
        }
    );
};

/**
 * Handle canceling setup process
 */
const handleCancelSetup = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        // Get the active setup session
        const session = await BotsStore.getActiveSetupSessionByAdmin(adminId);
        if (session) {
            // Clean up the session
            await BotsStore.deleteSetupSession(session.sessionId);
        }

        await ctx.editMessageText(
            "❌ **Setup Cancelled**\n\n" +
            "Group setup has been cancelled. No changes have been made.\n\n" +
            "**To start setup again:**\n" +
            "• Go to the group chat\n" +
            "• Run `/setup` command\n" +
            "• Follow the setup instructions\n\n" +
            "**Need help?** Use `/help` for available commands.",
            { parse_mode: 'Markdown' }
        );

        // Notify the group chat about cancellation
        try {
            await ctx.telegram.sendMessage(
                groupChatId,
                "❌ **Setup Cancelled**\n\n" +
                "Group setup has been cancelled by the administrator.\n\n" +
                "To set up this group for support tickets, an admin can run `/setup` again.",
                { parse_mode: 'Markdown' }
            );
        } catch (notificationError) {
            LogEngine.warn('Failed to notify group about setup cancellation', {
                groupChatId: groupChatId,
                error: notificationError instanceof Error ? notificationError.message : 'Unknown error'
            });
        }

        LogEngine.info('Setup cancelled by admin', {
            groupChatId: groupChatId,
            adminId: adminId
        });

    } catch (error) {
        logError(error, 'handleCancelSetup', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Error**\n\n" +
            "An error occurred while cancelling setup. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Process support conversation messages and callback queries
 * Handles ongoing support ticket creation and related interactions
 */
const processSupportConversation = async (ctx: BotContext): Promise<boolean> => {
    try {
        // If this is a callback query, handle it
        if ('callback_query' in ctx.update && ctx.update.callback_query) {
            return await handleCallbackQuery(ctx);
        }

        // If this is a text message in a support form, handle it
        if (ctx.message && 'text' in ctx.message && ctx.from) {
            return await handleSupportFormInput(ctx);
        }

        return false;
    } catch (error) {
        LogEngine.error('Error in processSupportConversation', {
            error: (error as Error).message,
            chatId: ctx.chat?.id,
            userId: ctx.from?.id
        });
        return false;
    }
};

/**
 * Handle entering custom name callback
 */
const handleEnterCustomNameCallback = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        // Get the active setup session
        const session = await BotsStore.getActiveSetupSessionByAdmin(adminId);
        if (!session || session.groupChatId !== groupChatId) {
            await ctx.editMessageText(
                "❌ **Session Error**\n\nSetup session not found or expired. Please start the setup process again.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Update session to wait for custom name input
        await BotsStore.updateSetupSession(session.sessionId, {
            currentStep: 'waiting_for_custom_name'
        });

        await ctx.editMessageText(
            "✏️ **Enter Custom Customer Name**\n\n" +
            "Please type the customer name you'd like to use for this group.\n\n" +
            "**Guidelines:**\n" +
            "• Use a clear, business-appropriate name\n" +
            "• 2-100 characters in length\n" +
            "• Letters, numbers, spaces, and basic punctuation allowed\n" +
            "• Special characters will be converted to underscores\n\n" +
            "**Examples:** \"Acme Corporation\", \"Tech Solutions Ltd\", \"Customer Support\"",
            { parse_mode: 'Markdown' }
        );

        // In the group chat, provide a hint
        await ctx.telegram.sendMessage(
            groupChatId,
            "💬 **Custom Name Required**\n\n" +
            "Check your private messages to enter a custom customer name for this group.",
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        logError(error, 'handleEnterCustomNameCallback', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Error**\n\nAn error occurred. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle keeping current settings callback
 */
const handleKeepCurrentSettingsCallback = async (ctx: BotContext, groupChatId: number): Promise<void> => {
    try {
        const adminId = ctx.from?.id;
        if (!adminId) return;

        const groupConfig = await BotsStore.getGroupConfig(groupChatId);
        
        // Clear any active setup session for this admin
        const activeSession = await BotsStore.getActiveSetupSessionByAdmin(adminId);
        if (activeSession) {
            await BotsStore.deleteSetupSession(activeSession.sessionId);
            LogEngine.info('Cleared setup session after keeping current settings', {
                adminId,
                groupChatId,
                sessionId: activeSession.sessionId
            });
        }
        
        await ctx.editMessageText(
            "✅ **Settings Unchanged**\n\n" +
            `Customer association remains the same.\n\n` +
            `**Current Customer:** ${groupConfig?.customerName || 'Default'}\n` +
            `**Status:** Ready for support tickets\n\n` +
            "**Available Commands:**\n" +
            "• `/support` - Create support tickets\n" +
            "• `/templates` - Manage message templates\n" +
            "• `/help` - Show all commands",
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        logError(error, 'handleKeepCurrentSettingsCallback', {
            groupChatId,
            adminId: ctx.from?.id
        });
        
        await ctx.editMessageText(
            "❌ **Error**\n\nAn error occurred. Please try again.",
            { parse_mode: 'Markdown' }
        );
    }
};

/**
 * Handle callback queries from inline keyboards
 */
const handleCallbackQuery = async (ctx: BotContext): Promise<boolean> => {
    try {
        if (!('callback_query' in ctx.update) || !ctx.update.callback_query) {
            return false;
        }

        const callbackQuery = ctx.update.callback_query;
        if (!('data' in callbackQuery) || !callbackQuery.data) {
            return false;
        }

        const callbackData = callbackQuery.data;
        
        // Handle different types of callbacks
        if (callbackData.startsWith('proceed_suggested_')) {
            const groupChatId = parseInt(callbackData.replace('proceed_suggested_', ''));
            await handleProceedWithSuggested(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('custom_name_')) {
            const groupChatId = parseInt(callbackData.replace('custom_name_', ''));
            await handleEnterCustomNameCallback(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('update_customer_')) {
            const groupChatId = parseInt(callbackData.replace('update_customer_', ''));
            await handleUpdateCustomerChoice(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('keep_settings_')) {
            const groupChatId = parseInt(callbackData.replace('keep_settings_', ''));
            await handleKeepCurrentSettingsCallback(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('create_new_customer_')) {
            const groupChatId = parseInt(callbackData.replace('create_new_customer_', ''));
            await handleCreateNewCustomerForGroup(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('use_existing_customer_')) {
            const groupChatId = parseInt(callbackData.replace('use_existing_customer_', ''));
            await handleUseExistingCustomer(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('use_existing_')) {
            const groupChatId = parseInt(callbackData.replace('use_existing_', ''));
            await handleUseExistingCustomer(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('link_existing_customer_')) {
            const groupChatId = parseInt(callbackData.replace('link_existing_customer_', ''));
            await handleLinkExistingCustomer(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('custom_customer_name_')) {
            const groupChatId = parseInt(callbackData.replace('custom_customer_name_', ''));
            await handleEnterCustomNameCallback(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('cancel_setup_')) {
            const groupChatId = parseInt(callbackData.replace('cancel_setup_', ''));
            await handleCancelSetup(ctx, groupChatId);
            return true;
        }
        
        if (callbackData.startsWith('confirm_new_customer_')) {
            const parts = callbackData.replace('confirm_new_customer_', '').split('_');
            if (parts.length > 0 && parts[0]) {
                const groupChatId = parseInt(parts[0]);
                const customerName = parts.slice(1).join('_');
                await handleConfirmNewCustomer(ctx, groupChatId, customerName);
            }
            return true;
        }
        
        if (callbackData.startsWith('cancel_customer_update_')) {
            const groupChatId = parseInt(callbackData.replace('cancel_customer_update_', ''));
            await handleCancelCustomerUpdate(ctx, groupChatId);
            return true;
        }

        // Handle bot permission related callbacks
        if (callbackData === 'retry_bot_admin_check') {
            await handleRetryBotAdminCheck(ctx);
            return true;
        }
        
        if (callbackData === 'bot_admin_help') {
            await sendBotAdminHelpMessage(ctx);
            return true;
        }

        return false;
    } catch (error) {
        LogEngine.error('Error handling callback query', {
            error: (error as Error).message,
            callbackData: 'callback_query' in ctx.update && ctx.update.callback_query && 'data' in ctx.update.callback_query ? ctx.update.callback_query.data : 'unknown'
        });
        return false;
    }
};

/**
 * Handle support form text input
 */
const handleSupportFormInput = async (ctx: BotContext): Promise<boolean> => {
    try {
        if (!ctx.from || !ctx.message || !('text' in ctx.message)) {
            return false;
        }

        const userId = ctx.from.id;
        const userState = await BotsStore.getUserState(userId);
        
        if (!userState) {
            return false; // No active support session
        }

        // Handle different support form fields
        switch (userState.field) {
            case SupportFieldEnum.SUMMARY:
                return await handleSummaryInput(ctx, userState);
            case SupportFieldEnum.EMAIL:
                return await handleEmailInput(ctx, userState);
            default:
                return false;
        }
    } catch (error) {
        LogEngine.error('Error handling support form input', {
            error: (error as Error).message,
            userId: ctx.from?.id
        });
        return false;
    }
};

/**
 * Handle summary input for support tickets
 */
const handleSummaryInput = async (ctx: BotContext, userState: any): Promise<boolean> => {
    try {
        if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
            return false;
        }

        const summary = ctx.message.text.trim();
        
        if (summary.length < 10) {
            await safeReply(ctx, 
                "⚠️ Please provide a more detailed summary (at least 10 characters).\n\n" +
                "Describe your issue or question clearly so our support team can help you effectively."
            );
            return true;
        }

        // Update user state with summary and move to email field
        const updatedState = {
            ...userState,
            summary: summary,
            field: SupportFieldEnum.EMAIL
        };

        await BotsStore.setUserState(ctx.from.id, updatedState);

        await safeReply(ctx,
            "📧 **Email Address Required**\n\n" +
            "Please provide your email address so our support team can follow up with you.\n\n" +
            "**Example:** support@example.com"
        );

        return true;
    } catch (error) {
        LogEngine.error('Error handling summary input', {
            error: (error as Error).message,
            userId: ctx.from?.id
        });
        return false;
    }
};

/**
 * Handle email input for support tickets
 */
const handleEmailInput = async (ctx: BotContext, userState: any): Promise<boolean> => {
    try {
        if (!ctx.message || !('text' in ctx.message) || !ctx.from) {
            return false;
        }

        const email = ctx.message.text.trim();
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            await safeReply(ctx,
                "⚠️ **Invalid Email Address**\n\n" +
                "Please provide a valid email address.\n\n" +
                "**Example:** support@example.com"
            );
            return true;
        }

        // Create the support ticket
        await createSupportTicket(ctx, userState.summary, email);
        
        // Clear user state
        await BotsStore.clearUserState(ctx.from.id);

        return true;
    } catch (error) {
        LogEngine.error('Error handling email input', {
            error: (error as Error).message,
            userId: ctx.from?.id
        });
        return false;
    }
};

/**
 * Create a support ticket with the provided information
 */
const createSupportTicket = async (ctx: BotContext, summary: string, email: string): Promise<void> => {
    try {
        if (!ctx.chat || !ctx.from) {
            throw new Error('Missing chat or user context');
        }

        const chatId = ctx.chat.id;
        const groupConfig = await BotsStore.getGroupConfig(chatId);
        
        if (!groupConfig?.isConfigured) {
            await safeReply(ctx,
                "❌ **Group Not Configured**\n\n" +
                "This group is not properly configured for support tickets. Please ask an administrator to run `/setup`."
            );
            return;
        }

        // Create user data for ticket
        const onBehalfOf = {
            name: `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
            email: email
        };

        // Create the ticket
        const ticketResponse = await unthreadService.createTicket({
            groupChatName: groupConfig.chatTitle || 'Telegram Group',
            customerId: groupConfig.customerId!,
            summary: summary,
            onBehalfOf: onBehalfOf
        });

        // Send confirmation message
        const confirmationMessage = await safeReply(ctx,
            "✅ **Support Ticket Created**\n\n" +
            `**Ticket ID:** ${ticketResponse.friendlyId}\n` +
            `**Summary:** ${summary}\n` +
            `**Email:** ${email}\n\n` +
            "🎯 **What's Next:**\n" +
            "• Our support team has been notified\n" +
            "• You'll receive updates via email\n" +
            "• Reply to this message to add more information\n\n" +
            "*Thank you for contacting support!*",
            { parse_mode: 'Markdown' }
        );

        // Register the ticket for reply tracking
        if (confirmationMessage) {
            await unthreadService.registerTicketConfirmation({
                messageId: confirmationMessage.message_id,
                ticketId: ticketResponse.id,
                friendlyId: ticketResponse.friendlyId,
                customerId: groupConfig.customerId!,
                chatId: chatId,
                telegramUserId: ctx.from.id
            });
        }

        LogEngine.info('Support ticket created successfully', {
            ticketId: ticketResponse.id,
            friendlyId: ticketResponse.friendlyId,
            userId: ctx.from.id,
            chatId: chatId,
            summary: summary.substring(0, 100)
        });

    } catch (error) {
        LogEngine.error('Error creating support ticket', {
            error: (error as Error).message,
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });

        await safeReply(ctx,
            "❌ **Ticket Creation Failed**\n\n" +
            "Sorry, there was an error creating your support ticket. Please try again or contact an administrator.\n\n" +
            "You can use `/support` to start a new ticket."
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
    supportCommand,
    cancelCommand,
    resetCommand,
    setupCommand,
    processSetupTextInput,
    templatesCommand,
    processSupportConversation
};
