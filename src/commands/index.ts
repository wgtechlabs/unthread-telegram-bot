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
import { isValidAdmin, isActivatedAdmin, createAdminProfile, updateAdminLastActive, createSetupSession, canStartSetup, notifyOtherAdmins, isSessionExpired, getSessionTimeRemaining, createDmSetupSession, canStartDmSetup, notifyAdminsOfSetupCompletion, notifyAdminsOfTemplateChange } from '../utils/adminManager.js';
import { TemplateManager } from '../utils/templateManager.js';
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
 * Validate and sanitize customer name input
 */
interface CustomerNameValidationResult {
    isValid: boolean;
    sanitizedName?: string;
    error?: string;
    details?: string;
}

function validateAndSanitizeCustomerName(input: string): CustomerNameValidationResult {
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

    // Step 4: Character validation - Allow letters, numbers, spaces, hyphens, apostrophes, periods
    // Disallow special characters that could be used for injection attacks
    const allowedCharRegex = /^[a-zA-Z0-9\s\-'.&()]+$/;
    if (!allowedCharRegex.test(trimmed)) {
        return {
            isValid: false,
            error: 'Invalid characters in name',
            details: 'Customer name can only contain letters, numbers, spaces, hyphens, apostrophes, periods, ampersands, and parentheses.'
        };
    }

    // Step 5: Pattern validation - Prevent suspicious patterns
    const suspiciousPatterns = [
        // SQL injection patterns
        /('|('')|;|--|\/\*|\*\/)/i,
        // Script injection patterns
        /<script|<\/script>|javascript:|vbscript:|onload=|onerror=/i,
        // Command injection patterns
        /(\||&|;|\$\(|\`|>|<)/,
        // Path traversal patterns
        /(\.\.\/|\.\.\\)/,
        // Excessive repeating characters (potential DoS)
        /(.)\1{10,}/,
        // Only special characters (suspicious)
        /^[\s\-'.&()]+$/
    ];

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(trimmed)) {
            return {
                isValid: false,
                error: 'Invalid name pattern',
                details: 'Customer name contains characters or patterns that are not allowed.'
            };
        }
    }

    // Step 6: Word validation - Ensure it's not just spaces or special characters
    const wordsOnly = trimmed.replace(/[\s\-'.&()]/g, '');
    if (wordsOnly.length < 2) {
        return {
            isValid: false,
            error: 'Insufficient content',
            details: 'Customer name must contain at least 2 letters or numbers.'
        };
    }

    // Step 7: Additional sanitization
    let sanitized = trimmed
        // Normalize multiple spaces to single space
        .replace(/\s+/g, ' ')
        // Remove leading/trailing special characters
        .replace(/^[\s\-'.&()]+|[\s\-'.&()]+$/g, '')
        // Limit consecutive special characters
        .replace(/[\-'.&()]{3,}/g, (match) => match.substring(0, 2));

    // Step 8: Final length check after sanitization
    if (sanitized.length < 2) {
        return {
            isValid: false,
            error: 'Invalid name after sanitization',
            details: 'Customer name does not meet requirements after processing.'
        };
    }

    // Step 9: Prevent common abuse patterns
    const lowercased = sanitized.toLowerCase();
    const forbiddenWords = ['admin', 'administrator', 'root', 'system', 'null', 'undefined', 'test', 'demo'];
    if (forbiddenWords.some(word => lowercased === word || lowercased.startsWith(word + ' ') || lowercased.endsWith(' ' + word))) {
        return {
            isValid: false,
            error: 'Reserved name',
            details: 'This name is reserved and cannot be used.'
        };
    }

    return {
        isValid: true,
        sanitizedName: sanitized
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
        // Validate and sanitize the customer name input
        const validation = validateAndSanitizeCustomerName(customerName);
        
        if (!validation.isValid) {
            const errorMessage = `❌ **${validation.error}**\n\n` +
                `${validation.details}\n\n` +
                `**Requirements:**\n` +
                `• Length: 2-100 characters\n` +
                `• Allowed: Letters, numbers, spaces, hyphens, apostrophes, periods, ampersands, parentheses\n` +
                `• No special patterns or reserved words\n\n` +
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

        // Use the sanitized name for processing
        sanitizedName = validation.sanitizedName!;
        
        // Log successful validation
        LogEngine.info('Customer name validated and sanitized', {
            chatId: setupState.chatId,
            originalInput: customerName,
            sanitizedName: sanitizedName,
            sanitizationApplied: customerName !== sanitizedName
        });

        // Create customer with sanitized name
        let customerId: string;
        let actualCustomerName: string;
        
        try {
            const customer = await createCustomerWithName(sanitizedName);
            customerId = customer.id;
            actualCustomerName = customer.name;
            
            LogEngine.info('Customer created with sanitized name', {
                customerId,
                customerName: actualCustomerName,
                originalInput: customerName,
                sanitizedInput: sanitizedName,
                chatId: setupState.chatId
            });
        } catch (error) {
            const err = error as Error;
            LogEngine.error('Failed to create customer with sanitized name', {
                error: err.message,
                originalInput: customerName,
                sanitizedInput: sanitizedName,
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
                sanitizedInput: sanitizedName,
                inputSanitized: customerName !== sanitizedName,
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

        LogEngine.info('Setup completed with sanitized customer name', {
            chatId: setupState.chatId,
            customerName: actualCustomerName,
            customerId: customerId,
            originalInput: customerName,
            sanitizedInput: sanitizedName,
            setupBy: setupState.initiatedBy
        });

    } catch (error) {
        const errorDetails = logError(error, 'handleCustomerNameInput', {
            originalInput: customerName,
            sanitizedInput: sanitizedName,
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

/**
 * Placeholder command handlers - TODO: Implement full functionality
 */

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
        } else {
            await safeReply(ctx,
                "🚧 **Support Ticket Creation**\n\n" +
                "Support ticket creation is currently being finalized and will be available soon.\n\n" +
                "**Current Status:**\n" +
                "✅ Group configuration system\n" +
                "✅ Admin management system\n" +
                "✅ Message template system\n" +
                "🔄 Ticket creation flow (final testing)\n\n" +
                "**Available Now:**\n" +
                "• Admins can use `/templates` to configure message templates\n" +
                "• Use `/help` to see all available features\n" +
                "• Check `/about` for the latest project information",
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
        // There are active sessions - notify user about cancellation
        await safeReply(ctx,
            "🛑 **Cancel Operation**\n\n" +
            "Session cancellation functionality is being finalized.\n\n" +
            "**Current Options:**\n" +
            "• Active sessions will timeout automatically (3-5 minutes)\n" +
            "• You can wait for timeout or start a new session\n" +
            "• New sessions will override existing ones\n\n" +
            "**Upcoming Features:**\n" +
            "• Immediate session cancellation\n" +
            "• Automatic cleanup of temporary data\n" +
            "• Enhanced confirmation prompts\n\n" +
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
        "The reset functionality is being finalized to help you start fresh with a clean state.\n\n" +
        "**Reset Capabilities:**\n" +
        "• Clear your conversation state\n" +
        "• Cancel any active support flows\n" +
        "• Reset form data and temporary sessions\n" +
        "• Preserve your profile and group settings\n\n" +
        "**Current Options:**\n" +
        "• Sessions auto-expire after 3-5 minutes\n" +
        "• Starting new commands overrides old sessions\n" +
        "• Use `/cancel` to stop current operations\n\n" +
        "**Enhanced Features:**\n" +
        "• Immediate state reset\n" +
        "• Selective data clearing options\n" +
        "• Enhanced confirmation prompts\n\n" +
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
    
    await safeReply(ctx,
        "🚧 **Setup Wizard**\n\n" +
        "The comprehensive setup wizard is being finalized and will provide an intuitive configuration experience.\n\n" +
        "**Setup Features:**\n" +
        "• Interactive group configuration\n" +
        "• Customer account linking\n" +
        "• Unthread integration setup\n" +
        "• DM-based guided setup\n" +
        "• Automated template initialization\n\n" +
        "**Current Status:**\n" +
        "✅ Admin activation system\n" +
        "✅ Session management\n" +
        "✅ Template system\n" +
        "🔄 Setup wizard (final testing)\n\n" +
        "**Available Now:**\n" +
        "• Use `/templates` to configure message templates\n" +
        "• Check `/help` for available admin commands\n" +
        "• Your activation is ready for the full setup experience",
        { parse_mode: 'Markdown' }
    );
};

const processSupportConversation = async (ctx: BotContext): Promise<boolean> => {
    // This function will handle ongoing support conversations and ticket creation flows
    // Currently returns false to indicate no conversation was processed
    
    // Future implementation will include:
    // 1. Check for active support sessions in the current chat
    // 2. Process form input (ticket summary, customer email, priority, etc.)
    // 3. Validate user responses and provide real-time feedback
    // 4. Create tickets in Unthread via API integration
    // 5. Handle conversation state management and transitions
    // 6. Send confirmation messages using templates
    // 7. Notify admins of new ticket creation
    // 8. Handle error states and retry mechanisms
    
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    
    if (!chatId || !userId) {
        return false;
    }
    
    // Support conversation processing implementation
    // - Check BotsStore for active support sessions
    // - Process input based on current conversation state
    // - Validate and format user input
    // - Create Unthread tickets when form is complete
    // - Use MessageFormatter for template-based responses
    // - Notify admins via AdminManager
    
    return false; // No conversation processed yet - feature being finalized
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
    processSupportConversation,
    processSetupTextInput,
    templatesCommand
};
