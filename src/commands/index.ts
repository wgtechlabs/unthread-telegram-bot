/**
 * Command System - Complete Rewrite
 * 
 * This replaces the original 3,031-line monolithic commands/index.ts
 * with a clean, modular, and maintainable architecture following
 * SOLID principles and Clean Code practices.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

// Core infrastructure
import { commandRegistry } from './base/CommandRegistry.js';
import type { BotContext } from '../types/index.js';
import { LogEngine } from '@wgtechlabs/log-engine';

// Basic commands
import { 
    StartCommand, 
    HelpCommand, 
    VersionCommand, 
    AboutCommand 
} from './basic/InfoCommands.js';
import { 
    CancelCommand, 
    ResetCommand 
} from './basic/StateCommands.js';

// Support system
import { SupportCommand } from './support/SupportCommandClean.js';

// Admin commands
import { 
    ActivateCommand, 
    SetupCommand, 
    TemplatesCommand 
} from './admin/AdminCommands.js';

// Processors
import {
    SupportConversationProcessor,
    DmSetupInputProcessor
} from './processors/ConversationProcessors.js';
import { 
    SupportCallbackProcessor,
    SetupCallbackProcessor,
    AdminCallbackProcessor
} from './processors/CallbackProcessors.js';

/**
 * Registers all commands, conversation processors, and callback processors with the command system.
 *
 * This function sets up the complete command architecture, including basic, support, and admin commands, as well as conversation and callback processors, preparing the bot for operation.
 */
export function initializeCommands(): void {
    LogEngine.info('🚀 Initializing Clean Command Architecture...');

    // Register basic commands
    commandRegistry.register(new StartCommand());
    commandRegistry.register(new HelpCommand());
    commandRegistry.register(new VersionCommand());
    commandRegistry.register(new AboutCommand());
    commandRegistry.register(new CancelCommand());
    commandRegistry.register(new ResetCommand());

    // Register support system
    commandRegistry.register(new SupportCommand());

    // Register admin commands
    commandRegistry.register(new ActivateCommand());
    commandRegistry.register(new SetupCommand());
    commandRegistry.register(new TemplatesCommand());

    // Register conversation processors
    commandRegistry.registerConversationProcessor(new SupportConversationProcessor());
    commandRegistry.registerConversationProcessor(new DmSetupInputProcessor());

    // Register callback processors
    commandRegistry.registerCallbackProcessor(new SupportCallbackProcessor());
    commandRegistry.registerCallbackProcessor(new SetupCallbackProcessor());
    commandRegistry.registerCallbackProcessor(new AdminCallbackProcessor());

    const stats = commandRegistry.getStats();
    LogEngine.info('✅ Command Architecture Initialized', {
        totalCommands: stats.totalCommands,
        adminCommands: stats.adminCommands,
        conversationProcessors: stats.conversationProcessors,
        callbackProcessors: stats.callbackProcessors,
        setupRequiredCommands: stats.setupRequiredCommands
    });
}

/**
 * Processes a text message context using registered conversation processors.
 *
 * @param ctx - The bot context containing the message to process
 * @returns True if a conversation processor handled the message; otherwise, false
 */
export async function processConversation(ctx: BotContext): Promise<boolean> {
    return await commandRegistry.processConversation(ctx);
}

/**
 * Processes a callback query using the registered callback processors.
 *
 * @returns True if the callback was handled; otherwise, false.
 */
export async function processCallback(ctx: BotContext): Promise<boolean> {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return false;

    return await commandRegistry.processCallback(ctx, callbackQuery.data);
}

/**
 * Executes a registered command by its name for the given context.
 *
 * @param commandName - The name of the command to execute
 * @param ctx - The bot context in which to execute the command
 * @returns True if the command was successfully executed; otherwise, false
 */
export async function executeCommand(commandName: string, ctx: BotContext): Promise<boolean> {
    return await commandRegistry.execute(commandName, ctx);
}

/**
 * Generates help text tailored to the current bot context.
 *
 * @returns A string containing help instructions relevant to the user's context and permissions.
 */
export function generateHelp(ctx: BotContext): string {
    return commandRegistry.generateHelpText(ctx);
}

/**
 * Retrieves statistics about the registered commands and processors.
 *
 * @returns An object containing counts and details of commands, admin commands, conversation processors, callback processors, and setup-required commands.
 */
export function getCommandStats() {
    return commandRegistry.getStats();
}

// Export the registry for advanced usage
export { commandRegistry };

// Legacy compatibility functions - these match the original exports
// but now use the clean architecture under the hood

export const startCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('start', ctx);
    } catch (error) {
        LogEngine.error('Start command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const helpCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('help', ctx);
    } catch (error) {
        LogEngine.error('Help command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const versionCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('version', ctx);
    } catch (error) {
        LogEngine.error('Version command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const aboutCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('about', ctx);
    } catch (error) {
        LogEngine.error('About command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const activateCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('activate', ctx);
    } catch (error) {
        LogEngine.error('Activate command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const supportCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('support', ctx);
    } catch (error) {
        LogEngine.error('Support command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const cancelCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('cancel', ctx);
    } catch (error) {
        LogEngine.error('Cancel command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const resetCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('reset', ctx);
    } catch (error) {
        LogEngine.error('Reset command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const setupCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('setup', ctx);
    } catch (error) {
        LogEngine.error('Setup command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const templatesCommand = async (ctx: BotContext): Promise<void> => {
    try {
        await commandRegistry.execute('templates', ctx);
    } catch (error) {
        LogEngine.error('Templates command failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

// Legacy processor functions that now use the clean architecture
export const processSupportConversation = async (ctx: BotContext): Promise<boolean> => {
    try {
        return await processConversation(ctx);
    } catch (error) {
        LogEngine.error('Support conversation processing failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
        return false;
    }
};

export const handleCallbackQuery = async (ctx: BotContext): Promise<boolean> => {
    try {
        return await processCallback(ctx);
    } catch (error) {
        LogEngine.error('Callback query handling failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
        return false;
    }
};

// Additional legacy compatibility
export const processSetupTextInput = async (ctx: BotContext): Promise<boolean> => {
    try {
        return await processConversation(ctx);
    } catch (error) {
        LogEngine.error('Setup text input processing failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
        return false;
    }
};

export const processTemplateEditInput = async (ctx: BotContext): Promise<boolean> => {
    try {
        return await processConversation(ctx);
    } catch (error) {
        LogEngine.error('Template edit input processing failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
        return false;
    }
};

export const handleTemplateEditCallback = async (ctx: BotContext, templateEvent: string): Promise<void> => {
    try {
        await processCallback(ctx);
    } catch (error) {
        LogEngine.error('Template edit callback handling failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id,
            templateEvent
        });
    }
};

export const handleTemplateCancelCallback = async (ctx: BotContext): Promise<void> => {
    try {
        await processCallback(ctx);
    } catch (error) {
        LogEngine.error('Template cancel callback handling failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const handleTemplateCancelEditCallback = async (ctx: BotContext): Promise<void> => {
    try {
        await processCallback(ctx);
    } catch (error) {
        LogEngine.error('Template cancel edit callback handling failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

export const handleTemplateBackMenuCallback = async (ctx: BotContext): Promise<void> => {
    try {
        await processCallback(ctx);
    } catch (error) {
        LogEngine.error('Template back menu callback handling failed', {
            error: error instanceof Error ? error.message : String(error),
            userId: ctx.from?.id,
            chatId: ctx.chat?.id
        });
    }
};

LogEngine.info('🎉 Clean Command Architecture Successfully Loaded!', {
    architectureBenefits: [
        'Single Responsibility: Each command has one job',
        'Open/Closed: Easy to add new commands without modification', 
        'Liskov Substitution: Commands are interchangeable',
        'Interface Segregation: Clean, focused interfaces',
        'Dependency Inversion: Depends on abstractions, not concretions'
    ],
    migrationSuccess: 'From 3,031 lines to ~15 focused, testable, maintainable modules!'
});