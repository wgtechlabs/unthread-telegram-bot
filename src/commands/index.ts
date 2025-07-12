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
    SetupInputProcessor,
    TemplateEditProcessor,
    DmSetupInputProcessor
} from './processors/ConversationProcessors.js';
import { 
    SupportCallbackProcessor,
    SetupCallbackProcessor,
    TemplateCallbackProcessor,
    AdminCallbackProcessor
} from './processors/CallbackProcessors.js';

/**
 * Initialize the complete command system
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
    commandRegistry.registerConversationProcessor(new SetupInputProcessor());
    commandRegistry.registerConversationProcessor(new TemplateEditProcessor());
    commandRegistry.registerConversationProcessor(new DmSetupInputProcessor());

    // Register callback processors
    commandRegistry.registerCallbackProcessor(new SupportCallbackProcessor());
    commandRegistry.registerCallbackProcessor(new SetupCallbackProcessor());
    commandRegistry.registerCallbackProcessor(new TemplateCallbackProcessor());
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
 * Process a text message through the conversation processors
 */
export async function processConversation(ctx: BotContext): Promise<boolean> {
    return await commandRegistry.processConversation(ctx);
}

/**
 * Process a callback query through the callback processors
 */
export async function processCallback(ctx: BotContext): Promise<boolean> {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return false;

    return await commandRegistry.processCallback(ctx, callbackQuery.data);
}

/**
 * Execute a command by name
 */
export async function executeCommand(commandName: string, ctx: BotContext): Promise<boolean> {
    return await commandRegistry.execute(commandName, ctx);
}

/**
 * Generate help text for the current context
 */
export function generateHelp(ctx: BotContext): string {
    return commandRegistry.generateHelpText(ctx);
}

/**
 * Get command statistics
 */
export function getCommandStats() {
    return commandRegistry.getStats();
}

// Export the registry for advanced usage
export { commandRegistry };

// Legacy compatibility functions - these match the original exports
// but now use the clean architecture under the hood

export const startCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('start', ctx);
};

export const helpCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('help', ctx);
};

export const versionCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('version', ctx);
};

export const aboutCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('about', ctx);
};

export const activateCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('activate', ctx);
};

export const supportCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('support', ctx);
};

export const cancelCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('cancel', ctx);
};

export const resetCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('reset', ctx);
};

export const setupCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('setup', ctx);
};

export const templatesCommand = async (ctx: BotContext): Promise<void> => {
    await commandRegistry.execute('templates', ctx);
};

// Legacy processor functions that now use the clean architecture
export const processSupportConversation = async (ctx: BotContext): Promise<boolean> => {
    return await processConversation(ctx);
};

export const handleCallbackQuery = async (ctx: BotContext): Promise<boolean> => {
    return await processCallback(ctx);
};

// Additional legacy compatibility
export const processSetupTextInput = async (ctx: BotContext): Promise<boolean> => {
    return await processConversation(ctx);
};

export const processTemplateEditInput = async (ctx: BotContext): Promise<boolean> => {
    return await processConversation(ctx);
};

export const handleTemplateEditCallback = async (ctx: BotContext, templateEvent: string): Promise<void> => {
    await processCallback(ctx);
};

export const handleTemplateCancelCallback = async (ctx: BotContext): Promise<void> => {
    await processCallback(ctx);
};

export const handleTemplateCancelEditCallback = async (ctx: BotContext): Promise<void> => {
    await processCallback(ctx);
};

export const handleTemplateBackMenuCallback = async (ctx: BotContext): Promise<void> => {
    await processCallback(ctx);
};

// Initialize the command system when this module is imported
initializeCommands();

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
