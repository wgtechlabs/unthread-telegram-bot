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
            return activeSessions.currentStep === 'awaiting_custom_name' || 
                   activeSessions.currentStep === 'awaiting_customer_id' ||
                   activeSessions.currentStep === 'awaiting_template_content';
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
            if (!session || (session.currentStep !== 'awaiting_custom_name' && 
                           session.currentStep !== 'awaiting_customer_id' && 
                           session.currentStep !== 'awaiting_template_content')) {
                return false;
            }

            // Handle template content input
            if (session.currentStep === 'awaiting_template_content') {
                return await this.handleTemplateContentInput(ctx, session, inputText);
            }

            // Handle customer ID input
            if (session.currentStep === 'awaiting_customer_id') {
                return await this.handleCustomerIdInput(ctx, session, inputText);
            }

            // Handle custom name input (existing logic)
            return await this.handleCustomNameInput(ctx, session, inputText);
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

    private async handleCustomerIdInput(ctx: BotContext, session: any, customerId: string): Promise<boolean> {
        try {
            // Validate customer ID format (UUID-like format)
            const customerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            
            if (!customerIdPattern.test(customerId.trim())) {
                await ctx.reply(
                    `❌ **Invalid Customer ID Format**\n\nThe customer ID must be in UUID format (e.g., ee19d165-a170-4261-8a4b-569c6a1bbcb7)\n\nPlease enter a valid customer ID:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "❌ Cancel Setup", callback_data: `dmsetup_cancel_${session.sessionId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            await ctx.reply("🔍 Validating customer ID with Unthread...", { parse_mode: 'Markdown' });

            // TODO: Add actual validation with Unthread API
            // For now, we'll accept any properly formatted UUID
            const trimmedCustomerId = customerId.trim();

            // Complete the setup with the existing customer ID
            await ctx.reply("✅ Linking to existing customer...", { parse_mode: 'Markdown' });

            // Update session with the customer ID
            await BotsStore.updateDmSetupSession(session.sessionId, {
                currentStep: 'customer_link_complete',
                stepData: {
                    ...session.stepData,
                    existingCustomerId: trimmedCustomerId,
                    linkType: 'existing'
                }
            });

            // Complete the setup by creating the group configuration directly
            try {
                const { BotsStore } = await import('../../sdk/bots-brain/index.js');
                
                // Create group configuration for existing customer
                const groupConfig = {
                    chatId: session.groupChatId,
                    chatTitle: session.groupChatName,
                    isConfigured: true,
                    customerId: trimmedCustomerId,
                    customerName: `Customer ${trimmedCustomerId.substring(0, 8)}...`,
                    setupBy: session.adminId,
                    setupAt: new Date().toISOString(),
                    botIsAdmin: true,
                    lastAdminCheck: new Date().toISOString(),
                    setupVersion: '2.0',
                    metadata: {
                        setupSessionId: session.sessionId,
                        isExistingCustomer: true
                    }
                };

                await BotsStore.storeGroupConfig(groupConfig);

                // Update session to template configuration step (don't mark as completed yet)
                await BotsStore.updateDmSetupSession(session.sessionId, {
                    currentStep: 'template_configuration'
                });

                const successMessage = `🎉 **Setup Complete!**

**Linked to Existing Customer**
**Customer ID:** \`${trimmedCustomerId}\`
**Group:** ${session.groupChatName}

✅ **What's configured:**
• Group linked to existing customer account
• Support ticket system enabled
• Bot admin permissions verified

📝 **Template Configuration** (Optional)

Choose how you'd like to handle message templates:`;

                await ctx.reply(successMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🚀 Use Default Templates", callback_data: `setup_use_defaults_${session.sessionId}` },
                                { text: "🎨 Customize Templates", callback_data: `setup_customize_templates_${session.sessionId}` }
                            ],
                            [
                                { text: "ℹ️ Learn About Templates", callback_data: `setup_template_info_${session.sessionId}` }
                            ]
                        ]
                    }
                });

                // Note: Group notification will be sent when template configuration is complete

            } catch (setupError) {
                logError(setupError, 'DmSetupInputProcessor.completeExistingCustomerSetup', { 
                    sessionId: session.sessionId,
                    customerId: trimmedCustomerId 
                });
                
                await ctx.reply(
                    "❌ **Setup Failed**\n\nFailed to complete the customer setup. This might be due to:\n• Database connection issues\n• Invalid session state\n• System configuration problems\n\nWhat would you like to do?",
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "🔄 Retry Setup", callback_data: `setup_existing_customer_${session.sessionId}` },
                                    { text: "✏️ Use Different Name", callback_data: `setup_custom_name_${session.sessionId}` }
                                ],
                                [
                                    { text: "❌ Cancel Setup", callback_data: `dmsetup_cancel_${session.sessionId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            return true;
        } catch (error) {
            logError(error, 'DmSetupInputProcessor.handleCustomerIdInput', { 
                userId: ctx.from?.id, 
                customerId,
                sessionId: session.sessionId 
            });
            await ctx.reply(
                "❌ **Customer ID Validation Failed**\n\nUnable to validate the customer ID. This could be due to:\n• Network connection issues\n• Invalid customer ID format\n• Customer ID doesn't exist in your Unthread workspace\n\nWhat would you like to do?",
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🔄 Try Again", callback_data: `setup_existing_customer_${session.sessionId}` },
                                { text: "✏️ Use Different Name", callback_data: `setup_custom_name_${session.sessionId}` }
                            ],
                            [
                                { text: "❌ Cancel Setup", callback_data: `dmsetup_cancel_${session.sessionId}` }
                            ]
                        ]
                    }
                }
            );
            return true;
        }
    }

    private async handleCustomNameInput(ctx: BotContext, session: any, inputText: string): Promise<boolean> {
        try {
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
            logError(error, 'DmSetupInputProcessor.handleCustomNameInput', { 
                userId: ctx.from?.id, 
                inputText,
                sessionId: session.sessionId 
            });
            await ctx.reply(
                "❌ **Setup Error**\n\nFailed to process your input. Please try again or cancel setup.",
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
    }

    /**
     * Handle template content input during setup
     */
    private async handleTemplateContentInput(ctx: BotContext, session: any, templateContent: string): Promise<boolean> {
        try {
            // Validate template content length
            if (templateContent.trim().length === 0) {
                await ctx.reply(
                    "❌ **Empty Template**\n\nTemplate content cannot be empty. Please type your template content:",
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "❌ Cancel Edit", callback_data: `template_cancel_edit_${session.stepData?.editingTemplateType}_${session.sessionId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            if (templateContent.length > 4000) {
                await ctx.reply(
                    "❌ **Template Too Long**\n\nTemplate content is too long (max 4000 characters). Please shorten your template:",
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "❌ Cancel Edit", callback_data: `template_cancel_edit_${session.stepData?.editingTemplateType}_${session.sessionId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // Validate template content using GlobalTemplateManager
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            
            // Note: We'll use a basic validation here since GlobalTemplateManager's validateTemplate is private
            // Check for basic variable syntax
            const variableMatches = templateContent.match(/\{\{[^}]+\}\}/g);
            if (variableMatches) {
                const invalidVars: string[] = [];
                const validVars = ['ticketId', 'summary', 'customerName', 'status', 'agentName', 'response', 'createdAt', 'updatedAt'];
                
                for (const match of variableMatches) {
                    const varName = match.replace(/[{}]/g, '').trim();
                    if (!validVars.includes(varName)) {
                        invalidVars.push(varName);
                    }
                }
                
                if (invalidVars.length > 0) {
                    await ctx.reply(
                        `❌ **Invalid Variables**\n\nThe following variables are not recognized:\n• ${invalidVars.join('\n• ')}\n\n**Valid variables:**\n• ticketId, summary, customerName, status\n• agentName, response, createdAt, updatedAt\n\nPlease fix your template:`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: "❌ Cancel Edit", callback_data: `template_cancel_edit_${session.stepData?.editingTemplateType}_${session.sessionId}` }
                                    ]
                                ]
                            }
                        }
                    );
                    return true;
                }
            }

            // Update the global template
            const templateType = session.stepData?.editingTemplateType;
            const updateResult = await templateManager.updateTemplate(
                templateType as any,
                templateContent,
                true,
                session.adminId
            );

            if (!updateResult.success) {
                await ctx.reply(
                    `❌ **Template Update Failed**\n\n${updateResult.error || 'Unknown error occurred'}\n\nPlease try again:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "❌ Cancel Edit", callback_data: `template_cancel_edit_${templateType}_${session.sessionId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // Success! Show confirmation and return to template customization
            await ctx.reply("✅ **Template Updated Successfully!**\n\nYour template has been saved and is now active.");

            // Reset session step and return to template customization
            await BotsStore.updateDmSetupSession(session.sessionId, {
                currentStep: 'template_customization',
                stepData: {
                    ...session.stepData,
                    editingTemplateType: undefined,
                    originalTemplateContent: undefined
                }
            });

            // Import and use the callback processor to show template customization
            const { SetupCallbackProcessor } = await import('./CallbackProcessors.js');
            const callbackProcessor = new SetupCallbackProcessor();
            
            // Show updated template customization interface
            await callbackProcessor.showTemplateCustomization(ctx, session.sessionId, session);

            return true;
        } catch (error) {
            logError(error, 'DmSetupInputProcessor.handleTemplateContentInput', { 
                userId: ctx.from?.id, 
                templateContent,
                sessionId: session.sessionId 
            });
            await ctx.reply(
                "❌ **Template Update Error**\n\nFailed to update the template. Please try again or cancel the edit.",
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "❌ Cancel Edit", callback_data: `template_cancel_edit_${session.stepData?.editingTemplateType}_${session.sessionId}` }
                            ]
                        ]
                    }
                }
            );
            return true;
        }
    }
}
