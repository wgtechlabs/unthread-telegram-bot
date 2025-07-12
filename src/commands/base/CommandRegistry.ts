/**
 * Enhanced Command Registry with Processor Support
 * 
 * Central registry for all bot commands, conversation processors,
 * and callback handlers following the Registry Pattern.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import type { ICommand, IConversationProcessor, ICallbackProcessor } from './BaseCommand.js';
import type { BotContext } from '../../types/index.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import { isAdminUser } from '../../config/env.js';

export class CommandRegistry {
    private commands = new Map<string, ICommand>();
    private conversationProcessors: IConversationProcessor[] = [];
    private callbackProcessors: ICallbackProcessor[] = [];

    /**
     * Register a command with the registry
     */
    register(command: ICommand): void {
        if (this.commands.has(command.metadata.name)) {
            LogEngine.warn(`Command ${command.metadata.name} is already registered. Overwriting.`);
        }

        this.commands.set(command.metadata.name, command);
        LogEngine.info(`Registered command: ${command.metadata.name}`, {
            adminOnly: command.metadata.adminOnly,
            privateOnly: command.metadata.privateOnly,
            groupOnly: command.metadata.groupOnly,
            requiresSetup: command.metadata.requiresSetup
        });
    }

    /**
     * Register a conversation processor
     */
    registerConversationProcessor(processor: IConversationProcessor): void {
        this.conversationProcessors.push(processor);
        LogEngine.info(`Registered conversation processor`);
    }

    /**
     * Register a callback processor
     */
    registerCallbackProcessor(processor: ICallbackProcessor): void {
        this.callbackProcessors.push(processor);
        LogEngine.info(`Registered callback processor`);
    }

    /**
     * Get a command by name
     */
    get(commandName: string): ICommand | undefined {
        return this.commands.get(commandName);
    }

    /**
     * Get all registered commands
     */
    getAll(): Map<string, ICommand> {
        return new Map(this.commands);
    }

    /**
     * Get commands available for a specific context
     */
    getAvailableCommands(ctx: BotContext): ICommand[] {
        const available: ICommand[] = [];
        const userId = ctx.from?.id;
        const chatType = ctx.chat?.type;
        
        for (const command of this.commands.values()) {
            // Basic context filtering
            if (command.metadata.privateOnly && chatType !== 'private') {
                continue;
            }
            
            if (command.metadata.groupOnly && chatType === 'private') {
                continue;
            }

            // Admin filtering
            if (command.metadata.adminOnly && userId && !isAdminUser(userId)) {
                continue;
            }

            available.push(command);
        }

        return available;
    }

    /**
     * Execute a command by name
     */
    async execute(commandName: string, ctx: BotContext): Promise<boolean> {
        const command = this.get(commandName);
        
        if (!command) {
            LogEngine.warn(`Unknown command: ${commandName}`, {
                userId: ctx.from?.id,
                chatId: ctx.chat?.id
            });
            return false;
        }

        await command.execute(ctx);
        return true;
    }

    /**
     * Process conversation input through registered processors
     */
    async processConversation(ctx: BotContext): Promise<boolean> {
        for (const processor of this.conversationProcessors) {
            try {
                if (await processor.canHandle(ctx)) {
                    const handled = await processor.process(ctx);
                    if (handled) {
                        LogEngine.info(`Conversation processed by processor`);
                        return true;
                    }
                }
            } catch (error) {
                LogEngine.error(`Error in conversation processor`, {
                    error: error instanceof Error ? error.message : String(error),
                    userId: ctx.from?.id,
                    chatId: ctx.chat?.id
                });
            }
        }
        return false;
    }

    /**
     * Process callback query through registered processors
     */
    async processCallback(ctx: BotContext, callbackData: string): Promise<boolean> {
        for (const processor of this.callbackProcessors) {
            try {
                if (processor.canHandle(callbackData)) {
                    const handled = await processor.process(ctx, callbackData);
                    if (handled) {
                        LogEngine.info(`Callback processed by processor`, {
                            callbackData: callbackData.substring(0, 50) // Log first 50 chars
                        });
                        return true;
                    }
                }
            } catch (error) {
                LogEngine.error(`Error in callback processor`, {
                    error: error instanceof Error ? error.message : String(error),
                    callbackData: callbackData.substring(0, 50),
                    userId: ctx.from?.id,
                    chatId: ctx.chat?.id
                });
            }
        }
        return false;
    }

    /**
     * Check if a command exists
     */
    has(commandName: string): boolean {
        return this.commands.has(commandName);
    }

    /**
     * Get command count
     */
    size(): number {
        return this.commands.size;
    }

    /**
     * Generate comprehensive help text
     */
    generateHelpText(ctx: BotContext): string {
        const availableCommands = this.getAvailableCommands(ctx);
        const userId = ctx.from?.id;
        const isAdmin = userId ? isAdminUser(userId) : false;
        
        if (availableCommands.length === 0) {
            return "No commands available in this context.";
        }

        // Group commands by category
        const basicCommands = availableCommands.filter(cmd => 
            !cmd.metadata.adminOnly && !cmd.metadata.requiresSetup
        );
        const adminCommands = availableCommands.filter(cmd => 
            cmd.metadata.adminOnly
        );
        const setupCommands = availableCommands.filter(cmd => 
            cmd.metadata.requiresSetup && !cmd.metadata.adminOnly
        );

        let helpText = "📋 **Available Commands:**\n\n";

        // Basic commands
        if (basicCommands.length > 0) {
            helpText += "**🏠 Basic Commands:**\n";
            for (const command of basicCommands) {
                helpText += `• \`/${command.metadata.name}\` - ${command.metadata.description}\n`;
            }
            helpText += "\n";
        }

        // Setup-required commands
        if (setupCommands.length > 0) {
            helpText += "**🎫 Support Commands:**\n";
            for (const command of setupCommands) {
                helpText += `• \`/${command.metadata.name}\` - ${command.metadata.description}\n`;
            }
            helpText += "*Note: These commands require group setup*\n\n";
        }

        // Admin commands
        if (adminCommands.length > 0 && isAdmin) {
            helpText += "**🔧 Admin Commands:**\n";
            for (const command of adminCommands) {
                helpText += `• \`/${command.metadata.name}\` - ${command.metadata.description}\n`;
            }
            helpText += "\n";
        }

        // Footer with context-specific guidance
        const chatType = ctx.chat?.type;
        if (chatType === 'private') {
            helpText += "💡 *Some commands may only work in group chats*";
        } else {
            helpText += "💡 *Use `/help` in private chat for admin commands*";
        }

        return helpText;
    }

    /**
     * Generate detailed help for a specific command
     */
    generateCommandHelp(commandName: string, ctx: BotContext): string | null {
        const command = this.get(commandName);
        if (!command) {
            return null;
        }

        // Check if user can access this command
        const availableCommands = this.getAvailableCommands(ctx);
        if (!availableCommands.includes(command)) {
            return "❌ You don't have access to this command.";
        }

        return command.generateHelp();
    }

    /**
     * Get registry statistics
     */
    getStats(): {
        totalCommands: number;
        adminCommands: number;
        privateOnlyCommands: number;
        groupOnlyCommands: number;
        setupRequiredCommands: number;
        conversationProcessors: number;
        callbackProcessors: number;
    } {
        const commands = Array.from(this.commands.values());
        
        return {
            totalCommands: commands.length,
            adminCommands: commands.filter(c => c.metadata.adminOnly).length,
            privateOnlyCommands: commands.filter(c => c.metadata.privateOnly).length,
            groupOnlyCommands: commands.filter(c => c.metadata.groupOnly).length,
            setupRequiredCommands: commands.filter(c => c.metadata.requiresSetup).length,
            conversationProcessors: this.conversationProcessors.length,
            callbackProcessors: this.callbackProcessors.length
        };
    }
}

// Global command registry instance
export const commandRegistry = new CommandRegistry();
