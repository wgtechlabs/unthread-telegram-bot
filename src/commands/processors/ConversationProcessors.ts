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

/**
 * DM Setup Input Processor
 * Handles text input during DM-based setup flows (like custom customer names)
 */
export class DmSetupInputProcessor implements IConversationProcessor {
    async canHandle(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        if (!userId || ctx.chat?.type !== 'private' || !ctx.message || !('text' in ctx.message)) {
            return false;
        }

        try {
            // Check if user has an active DM setup session
            const activeSessions = await BotsStore.getActiveDmSetupSessionByAdmin(userId);
            if (!activeSessions) return false;

            // Check if we're waiting for text input
            return activeSessions.currentStep === 'awaiting_custom_name';
        } catch (error) {
            logError(error, 'DmSetupInputProcessor.canHandle', { userId });
            return false;
        }
    }

    async process(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        const inputText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

        if (!userId || !inputText) return false;

        try {
            // Get the active session
            const session = await BotsStore.getActiveDmSetupSessionByAdmin(userId);
            if (!session || session.currentStep !== 'awaiting_custom_name') {
                return false;
            }

            // Validate the customer name input
            const { validateCustomerName } = await import('../utils/validation.js');
            const validation = validateCustomerName(inputText);

            if (!validation.isValid) {
                await ctx.reply(
                    `❌ **Invalid Customer Name**\n\n${validation.error}\n\n${validation.details}\n\nPlease try again:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "❌ Cancel Setup", callback_data: `setup_cancel_${session.sessionId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // Process the valid customer name
            await ctx.reply("✅ Processing your custom customer name...", { parse_mode: 'Markdown' });

            // Import and use the callback processor to complete the setup
            const { SetupCallbackProcessor } = await import('./CallbackProcessors.js');
            const callbackProcessor = new SetupCallbackProcessor();
            
            // Update session with the custom name and complete setup
            await BotsStore.updateDmSetupSession(session.sessionId, {
                currentStep: 'customer_setup_complete',
                stepData: {
                    ...session.stepData,
                    customerName: validation.sanitizedValue
                }
            });

            // Complete the customer setup using the callback processor's method
            const customerName = validation.sanitizedValue || inputText.trim();
            await callbackProcessor.completeCustomerSetup(ctx, session.sessionId, customerName, session);

            return true;
        } catch (error) {
            logError(error, 'DmSetupInputProcessor.process', { userId, inputText });
            await ctx.reply(
                "❌ **Setup Error**\n\nFailed to process your input. Please try again or cancel setup.",
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "❌ Cancel Setup", callback_data: `setup_cancel_unknown` }
                            ]
                        ]
                    }
                }
            );
            return true;
        }
    }
}
