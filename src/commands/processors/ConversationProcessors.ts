/**
 * Conversation Processors
 * 
 * Handles text input processing for various bot flows
 * following the Chain of Responsibility pattern.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import type { IConversationProcessor } from '../base/BaseCommand.js';
import type { BotContext } from '../../types/index.js';
import { BotsStore } from '../../sdk/bots-brain/index.js';
import { SupportCommand } from '../support/SupportCommandClean.js';
import { logError } from '../utils/errorHandler.js';

/**
 * Support Form Conversation Processor
 * Handles text input during support ticket creation
 */
export class SupportConversationProcessor implements IConversationProcessor {
    async canHandle(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        if (!userId || !ctx.message || !('text' in ctx.message) || !ctx.message.text) {
            return false;
        }

        try {
            const userState = await BotsStore.getUserState(userId);
            return userState?.field === 'summary' || userState?.field === 'email';
        } catch (error) {
            logError(error, 'SupportConversationProcessor.canHandle', { userId });
            return false;
        }
    }

    async process(ctx: BotContext): Promise<boolean> {
        try {
            // For now, just acknowledge the input
            await ctx.reply(
                "📝 **Form Input Received**\n\n" +
                "This is where the support form processing would happen in the complete implementation.\n\n" +
                "*Clean architecture makes this easy to implement!*",
                { parse_mode: 'Markdown' }
            );
            return true;
        } catch (error) {
            logError(error, 'SupportConversationProcessor.process', { 
                userId: ctx.from?.id 
            });
            return false;
        }
    }
}

/**
 * Setup Input Processor
 * Handles text input during group setup flows
 */
export class SetupInputProcessor implements IConversationProcessor {
    async canHandle(ctx: BotContext): Promise<boolean> {
        const chatId = ctx.chat?.id;
        if (!chatId || ctx.chat?.type === 'private') {
            return false;
        }

        try {
            const setupSession = await BotsStore.getSetupSession(`setup_${chatId}`);
            return setupSession !== null;
        } catch (error) {
            logError(error, 'SetupInputProcessor.canHandle', { chatId });
            return false;
        }
    }

    async process(ctx: BotContext): Promise<boolean> {
        try {
            await ctx.reply(
                "⚙️ **Setup Input Received**\n\n" +
                "This is where group setup input processing would happen.\n\n" +
                "*The clean architecture makes complex flows manageable!*",
                { parse_mode: 'Markdown' }
            );
            return true;
        } catch (error) {
            logError(error, 'SetupInputProcessor.process', { 
                chatId: ctx.chat?.id 
            });
            return false;
        }
    }
}

/**
 * Template Edit Processor
 * Handles text input during template editing
 */
export class TemplateEditProcessor implements IConversationProcessor {
    async canHandle(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        if (!userId || ctx.chat?.type !== 'private') {
            return false;
        }

        try {
            // Check if user has an active template editing session
            const templateSession = await BotsStore.getGlobalConfig(`template_edit_${userId}`);
            return templateSession !== null;
        } catch (error) {
            logError(error, 'TemplateEditProcessor.canHandle', { userId });
            return false;
        }
    }

    async process(ctx: BotContext): Promise<boolean> {
        try {
            await ctx.reply(
                "📝 **Template Edit Input**\n\n" +
                "This is where template editing would be processed.\n\n" +
                "*Clean separation of concerns in action!*",
                { parse_mode: 'Markdown' }
            );
            return true;
        } catch (error) {
            logError(error, 'TemplateEditProcessor.process', { 
                userId: ctx.from?.id 
            });
            return false;
        }
    }
}
