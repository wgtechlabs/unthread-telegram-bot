/**
 * Callback Query Processors
 * 
 * Handles inline button callbacks for various bot flows
 * following Clean Code principles and single responsibility.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import type { ICallbackProcessor } from '../base/BaseCommand.js';
import type { BotContext } from '../../types/index.js';
import type { DmSetupSession } from '../../sdk/types.js';
import { logError } from '../utils/errorHandler.js';

/**
 * Support Callback Processor
 * Handles callbacks related to support ticket creation
 */
export class SupportCallbackProcessor implements ICallbackProcessor {
    canHandle(callbackData: string): boolean {
        return callbackData.startsWith('support_');
    }

    async process(ctx: BotContext, callbackData: string): Promise<boolean> {
        const action = callbackData.replace('support_', '');
        
        try {
            switch (action) {
                case 'continue':
                    return await this.handleContinue(ctx);
                case 'restart':
                    return await this.handleRestart(ctx);
                case 'cancel':
                    return await this.handleCancel(ctx);
                case 'create_new':
                    return await this.handleCreateNew(ctx);
                default:
                    return false;
            }
        } catch (error) {
            logError(error, 'SupportCallbackProcessor.process', { 
                action, 
                userId: ctx.from?.id 
            });
            await ctx.answerCbQuery("❌ An error occurred. Please try again.");
            return true;
        }
    }

    private async handleContinue(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("✅ Continuing support form...");
        await ctx.editMessageText(
            `📝 **Support Form Continued**

This demonstrates the clean callback handling architecture.

*In the full implementation, this would resume the form!*`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    private async handleRestart(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("🔄 Restarting support form...");
        await ctx.editMessageText(
            `🔄 **Support Form Restarted**

This shows how clean architecture makes flow control easy.

*Starting fresh form would happen here!*`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    private async handleCancel(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("❌ Support form cancelled");
        await ctx.editMessageText(
            `❌ **Support Form Cancelled**

Clean architecture makes cancellation handling straightforward.

*Form state would be cleared here!*`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    private async handleCreateNew(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("🎫 Creating new ticket...");
        await ctx.editMessageText(
            `🎫 **New Ticket Creation**

This demonstrates clean callback-to-command handoff.

*New support flow would start here!*`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }
}

/**
 * Setup Callback Processor
 * Handles callbacks related to DM-based group setup flow
 */
export class SetupCallbackProcessor implements ICallbackProcessor {
    canHandle(callbackData: string): boolean {
        return callbackData.startsWith('setup_') || 
               callbackData.startsWith('dmsetup_') || 
               callbackData.startsWith('template_edit_') ||
               callbackData.startsWith('template_start_edit_') ||
               callbackData.startsWith('template_cancel_edit_');
    }

    // Helper function to convert template types to short codes for callback data
    private getTemplateShortCode(templateType: string): string {
        const templateToCodeMap: Record<string, string> = {
            'ticket_created': 'tc',
            'agent_response': 'ar', 
            'ticket_status': 'ts'
        };
        return templateToCodeMap[templateType] || templateType;
    }

    async process(ctx: BotContext, callbackData: string): Promise<boolean> {
        try {
            // Handle dmsetup_ prefixed callbacks
            if (callbackData.startsWith('dmsetup_')) {
                const parts = callbackData.split('_');
                const action = parts[1];
                const sessionId = parts[parts.length - 1];
                
                if (!sessionId) {
                    await ctx.answerCbQuery("❌ Invalid setup session.");
                    return true;
                }
                
                if (action === 'cancel') {
                    return await this.handleCancel(ctx, sessionId);
                }
                
                return false;
            }
            
            // Handle template_edit_ prefixed callbacks (shortened for callback data limits)
            if (callbackData.startsWith('template_edit_')) {
                const parts = callbackData.split('_');
                // Use short codes: tc=ticket_created, ar=agent_response, ts=ticket_status
                const shortCode = parts[2]; // tc, ar, or ts
                const sessionId = parts[3];
                
                // Map short codes back to full template types
                const codeToTemplateMap: Record<string, string> = {
                    'tc': 'ticket_created',
                    'ar': 'agent_response', 
                    'ts': 'ticket_status'
                };
                
                const templateType = shortCode ? codeToTemplateMap[shortCode] : undefined;
                if (!templateType || !sessionId) {
                    await ctx.answerCbQuery("❌ Invalid template edit request.");
                    return true;
                }
                
                return await this.handleTemplateEdit(ctx, sessionId, templateType);
            }
            
            // Handle template_start_edit_ prefixed callbacks (shortened)
            if (callbackData.startsWith('template_start_edit_')) {
                const parts = callbackData.split('_');
                // Format: template_start_edit_shortCode_sessionId
                const shortCode = parts[3]; // tc, ar, or ts  
                const sessionId = parts[4];
                
                // Map short codes back to full template types
                const codeToTemplateMap: Record<string, string> = {
                    'tc': 'ticket_created',
                    'ar': 'agent_response', 
                    'ts': 'ticket_status'
                };
                
                const templateType = shortCode ? codeToTemplateMap[shortCode] : undefined;
                if (!templateType || !sessionId) {
                    await ctx.answerCbQuery("❌ Invalid template edit request.");
                    return true;
                }
                
                return await this.handleTemplateStartEdit(ctx, sessionId, templateType);
            }
            
            // Handle template_cancel_edit_ prefixed callbacks (shortened)
            if (callbackData.startsWith('template_cancel_edit_')) {
                const parts = callbackData.split('_');
                // Format: template_cancel_edit_shortCode_sessionId
                const shortCode = parts[3]; // tc, ar, or ts
                const sessionId = parts[4];
                
                // Map short codes back to full template types
                const codeToTemplateMap: Record<string, string> = {
                    'tc': 'ticket_created',
                    'ar': 'agent_response', 
                    'ts': 'ticket_status'
                };
                
                const templateType = shortCode ? codeToTemplateMap[shortCode] : undefined;
                if (!templateType || !sessionId) {
                    await ctx.answerCbQuery("❌ Invalid template cancel request.");
                    return true;
                }
                
                return await this.handleTemplateCancelEdit(ctx, sessionId, templateType);
            }
            
            // Handle setup_ prefixed callbacks
            const parts = callbackData.split('_');
            const action = parts[1];
            
            // Session ID extraction depends on the callback format
            let sessionId: string;
            if (action === 'existing' && parts[2] === 'customer') {
                // Format: setup_existing_customer_setup_chatId_timestamp
                sessionId = parts.slice(3).join('_'); 
            } else if (action === 'customize' && parts[2] === 'templates') {
                // Format: setup_customize_templates_setup_chatId_timestamp
                sessionId = parts.slice(3).join('_'); 
            } else if (action === 'use' && parts[2] === 'defaults') {
                // Format: setup_use_defaults_setup_chatId_timestamp
                sessionId = parts.slice(3).join('_'); 
            } else if (action === 'template' && parts[2] === 'info') {
                // Format: setup_template_info_setup_chatId_timestamp
                sessionId = parts.slice(3).join('_'); 
            } else if (action === 'back' && parts[2] === 'to' && parts[3] === 'completion') {
                // Format: setup_back_to_completion_setup_chatId_timestamp
                sessionId = parts.slice(4).join('_'); 
            } else if (action === 'finish' && parts[2] === 'custom') {
                // Format: setup_finish_custom_setup_chatId_timestamp
                sessionId = parts.slice(3).join('_'); 
            } else {
                // Standard format: session ID is the last part
                sessionId = parts[parts.length - 1] || '';
            }
            
            if (!sessionId) {
                await ctx.answerCbQuery("❌ Invalid setup session.");
                return true;
            }

            switch (action) {
                case 'retry':
                    if (parts[2] === 'validation') {
                        return await this.handleRetryValidation(ctx, sessionId);
                    }
                    break;
                case 'use':
                    if (parts[2] === 'suggested') {
                        return await this.handleUseSuggested(ctx, sessionId);
                    } else if (parts[2] === 'defaults') {
                        return await this.handleUseDefaultTemplates(ctx, sessionId);
                    }
                    break;
                case 'customize':
                    if (parts[2] === 'templates') {
                        return await this.handleCustomizeTemplates(ctx, sessionId);
                    }
                    break;
                case 'template':
                    if (parts[2] === 'info') {
                        return await this.handleTemplateInfo(ctx, sessionId);
                    }
                    break;
                case 'back':
                    if (parts[2] === 'to' && parts[3] === 'completion') {
                        return await this.handleBackToCompletion(ctx, sessionId);
                    }
                    break;
                case 'custom':
                    if (parts[2] === 'name') {
                        return await this.handleCustomName(ctx, sessionId);
                    }
                    break;
                case 'existing':
                    if (parts[2] === 'customer') {
                        return await this.handleExistingCustomer(ctx, sessionId);
                    }
                    break;
                case 'finish':
                    if (parts[2] === 'custom') {
                        return await this.handleFinishCustomSetup(ctx, sessionId);
                    }
                    break;
                case 'cancel':
                    return await this.handleCancel(ctx, sessionId);
                default:
                    return false;
            }
            return false;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.process', { 
                callbackData, 
                userId: ctx.from?.id 
            });
            await ctx.answerCbQuery("❌ An error occurred. Please try again.");
            return true;
        }
    }

    private async handleRetryValidation(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("🔄 Retrying validation...");
        
        try {
            // Import here to avoid circular dependencies
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            // Re-run validation
            const validationMessage = "⏳ **Re-running Validation**\n\nPlease wait while I check the setup requirements again...";
            await ctx.editMessageText(validationMessage);
            
            // Note: In production, you'd extract validation to a shared service
            await this.performSetupValidation(ctx, sessionId, session.groupChatId, session.groupChatName);
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleRetryValidation', { sessionId });
            await ctx.editMessageText("❌ Failed to retry validation. Please start over.");
            return true;
        }
    }

    private async handleUseSuggested(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("✅ Using suggested name...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session || !session.stepData?.suggestedName) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            const customerName = session.stepData.suggestedName;
            
            // Create customer and complete setup
            await this.completeCustomerSetup(ctx, sessionId, customerName, session);
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleUseSuggested', { sessionId });
            await ctx.answerCbQuery("❌ Failed to create customer. Please try again.");
            return true;
        }
    }

    private async handleCustomName(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("✏️ Enter custom name...");
        
        await ctx.editMessageText(
            `✏️ **Custom Customer Name**

Please type the customer name you'd like to use:

*(Type your customer name and I'll set it up)*`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "❌ Cancel Setup", callback_data: `setup_cancel_${sessionId}` }
                        ]
                    ]
                }
            }
        );
        
        // Update session to expect custom name input
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            await BotsStore.updateDmSetupSession(sessionId, {
                currentStep: 'awaiting_custom_name'
            });
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleCustomName', { sessionId });
        }
        
        return true;
    }

    private async handleExistingCustomer(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("🔗 Link existing customer...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const store = BotsStore.getInstance();
            const session = await store.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Session expired. Please start the setup again with /setup");
                return true;
            }

            // Update session to expect customer ID input
            await store.updateDmSetupSession(sessionId, {
                currentStep: 'awaiting_customer_id'
            });
            
            await ctx.editMessageText(
                `🔗 **Enter Existing Customer ID**

Group: ${session.groupChatName || 'Unknown Group'}

Please type the existing customer ID you'd like to link to this group.

**Guidelines:**
• Enter the exact Customer ID from Unthread
• The customer ID will be validated before linking
• Customer must exist in your Unthread workspace

**Example:** ee19d165-a170-4261-8a4b-569c6a1bbcb7`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "❌ Cancel", callback_data: `dmsetup_cancel_${sessionId}` }]
                        ]
                    }
                }
            );
            
            return true;
        } catch (error) {
            logError(error, 'CallbackProcessors.handleExistingCustomer', { sessionId });
            await ctx.editMessageText("❌ An error occurred. Please try again with /setup");
            return true;
        }
    }

    private async handleCancel(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("❌ Setup cancelled");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            await BotsStore.deleteDmSetupSession(sessionId);
            
            await ctx.editMessageText(
                `❌ **Setup Cancelled**

Group setup has been cancelled. You can start over anytime by using \`/setup\` in the group chat.`
            );
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleCancel', { sessionId });
            await ctx.editMessageText("❌ Setup cancelled.");
            return true;
        }
    }

    public async completeCustomerSetup(ctx: BotContext, sessionId: string, customerName: string | null, session: DmSetupSession, existingCustomerId?: string): Promise<void> {
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            
            let customerId: string;
            let finalCustomerName: string;
            let isExistingCustomer = false;

            if (existingCustomerId) {
                // Linking to existing customer
                customerId = existingCustomerId;
                finalCustomerName = `Customer ${existingCustomerId.substring(0, 8)}...`;
                isExistingCustomer = true;
                
                // Note: In a real implementation, you would:
                // 1. Validate the customer ID exists in Unthread
                // 2. Fetch the customer name from Unthread API
                // 3. Handle any API errors appropriately
                
            } else {
                // Creating new customer
                if (!customerName) {
                    throw new Error('Customer name is required for new customer creation');
                }
                customerId = `cust_${Date.now()}`;
                finalCustomerName = customerName;
                
                // Create customer record
                const customerData = {
                    id: customerId,
                    unthreadCustomerId: customerId,
                    telegramChatId: session.groupChatId,
                    chatId: session.groupChatId,
                    chatTitle: session.groupChatName,
                    customerName,
                    name: customerName,
                    company: customerName,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                await BotsStore.storeCustomer(customerData);
            }

            // Create group configuration (same for both new and existing customers)
            const groupConfig = {
                chatId: session.groupChatId,
                chatTitle: session.groupChatName,
                isConfigured: true,
                customerId,
                customerName: finalCustomerName,
                setupBy: session.adminId,
                setupAt: new Date().toISOString(),
                botIsAdmin: true,
                lastAdminCheck: new Date().toISOString(),
                setupVersion: '2.0',
                metadata: {
                    setupSessionId: sessionId,
                    isExistingCustomer
                }
            };

            await BotsStore.storeGroupConfig(groupConfig);

            // Complete the setup
            await BotsStore.updateDmSetupSession(sessionId, {
                status: 'completed',
                currentStep: 'completed'
            });

            const setupType = isExistingCustomer ? 'Linked to Existing Customer' : 'New Customer Created';
            const successMessage = `🎉 **Setup Complete!**

**${setupType}**
**Customer:** ${finalCustomerName}
**Group:** ${session.groupChatName}
**Customer ID:** \`${customerId}\`

✅ **What's configured:**
• Group linked to customer account
• Support ticket system enabled
• Bot admin permissions verified

📝 **Template Configuration** (Optional)

Choose how you'd like to handle message templates:`;

            await ctx.editMessageText(successMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🚀 Use Default Templates", callback_data: `setup_use_defaults_${sessionId}` },
                            { text: "🎨 Customize Templates", callback_data: `setup_customize_templates_${sessionId}` }
                        ],
                        [
                            { text: "ℹ️ Learn About Templates", callback_data: `setup_template_info_${sessionId}` }
                        ]
                    ]
                }
            });

            // Note: Session cleanup will be handled by template choice handlers

        } catch (error) {
            logError(error, 'SetupCallbackProcessor.completeCustomerSetup', { sessionId, customerName, existingCustomerId });
            await ctx.editMessageText(
                `❌ **Setup Failed**

Failed to complete customer setup. Please try again.`
            );
        }
    }

    /**
     * Handle using default templates during setup
     */
    private async handleUseDefaultTemplates(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("🚀 Setting up with default templates...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            
            const session = await BotsStore.getDmSetupSession(sessionId);
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            // Initialize default templates for the group
            const templateManager = GlobalTemplateManager.getInstance();
            await templateManager.initializeDefaultTemplates(session.groupChatId);
            
            // Complete setup with defaults
            await this.finalizeSetupWithDefaults(ctx, sessionId, session);
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleUseDefaultTemplates', { sessionId });
            await ctx.answerCbQuery("❌ Failed to set up default templates. Please try again.");
            return true;
        }
    }

    /**
     * Handle customizing templates during setup
     */
    private async handleCustomizeTemplates(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("🎨 Opening template customization...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            // Show template customization interface
            await this.showTemplateCustomization(ctx, sessionId, session);
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleCustomizeTemplates', { sessionId });
            await ctx.answerCbQuery("❌ Failed to open template customization. Please try again.");
            return true;
        }
    }

    /**
     * Handle showing template information during setup
     */
    private async handleTemplateInfo(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("ℹ️ Loading template information...");
        
        const infoMessage = 
            `📝 **About Message Templates**

Templates control how the bot communicates with users and admins.

**🚀 Default Templates:**
• Pre-configured and ready to use
• Professional and friendly tone
• Can be customized later via \`/templates\`
• Perfect for quick setup

**🎨 Custom Templates:**
• Immediate personalization
• Match your brand voice
• Preview before saving
• More engaging setup experience

**Available Templates:**
• 🎫 **Ticket Created** - When new support tickets are created
• 👨‍💼 **Agent Response** - When agents reply to tickets
• ✅ **Ticket Closed** - When support tickets are resolved

**💡 Template Variables:**
Templates use dynamic placeholders like:
• \`{{ticketId}}\` - Unique ticket identifier
• \`{{customerName}}\` - Customer name
• \`{{agentName}}\` - Support agent name
• \`{{summary}}\` - Ticket description
• \`{{status}}\` - Current ticket status

**Example Template:**
\`\`\`
🎫 New Ticket: {{summary}}

ID: {{ticketId}}
Customer: {{customerName}}
Status: {{status}}

We'll respond soon!
\`\`\`

Choose your preferred approach:`;

        await ctx.editMessageText(infoMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🚀 Use Defaults", callback_data: `setup_use_defaults_${sessionId}` },
                        { text: "🎨 Customize Now", callback_data: `setup_customize_templates_${sessionId}` }
                    ],
                    [
                        { text: "⬅️ Back to Setup", callback_data: `setup_back_to_completion_${sessionId}` }
                    ]
                ]
            }
        });
        
        return true;
    }

    /**
     * Handle returning to setup completion screen
     */
    private async handleBackToCompletion(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("⬅️ Returning to setup...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            const customerName = session.stepData?.customerName || session.stepData?.suggestedName || 'Unknown';
            const customerId = session.stepData?.customerId || 'Unknown';

            const successMessage = `🎉 **Setup Complete!**

**Customer:** ${customerName}
**Group:** ${session.groupChatName}
**Customer ID:** \`${customerId}\`

✅ **What's configured:**
• Group linked to customer account
• Support ticket system enabled
• Bot admin permissions verified

📝 **Template Configuration** (Optional)

Choose how you'd like to handle message templates:`;

            await ctx.editMessageText(successMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🚀 Use Default Templates", callback_data: `setup_use_defaults_${sessionId}` },
                            { text: "🎨 Customize Templates", callback_data: `setup_customize_templates_${sessionId}` }
                        ],
                        [
                            { text: "ℹ️ Learn About Templates", callback_data: `setup_template_info_${sessionId}` }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleBackToCompletion', { sessionId });
            await ctx.editMessageText("❌ Failed to return to setup. Please try again.");
            return true;
        }
    }

    /**
     * Finalize setup with default templates
     */
    private async finalizeSetupWithDefaults(ctx: BotContext, sessionId: string, session: DmSetupSession): Promise<void> {
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            
            // Initialize global templates for the group
            const templateManager = GlobalTemplateManager.getInstance();
            await templateManager.initializeDefaultTemplates(session.groupChatId);
            
            const customerName = session.stepData?.customerName || session.stepData?.suggestedName || 'Unknown';
            
            const completionMessage = `✅ **Setup Fully Complete!**

**Customer:** ${customerName}
**Group:** ${session.groupChatName}
**Templates:** Default templates active

🎉 **Your group is ready for support ticket management!**

**Next Steps:**
• Users can now create support tickets
• Templates are ready and working
• Use \`/templates\` anytime to customize
• Check \`/help\` for all commands

*Enjoy your new support system!*`;

            await ctx.editMessageText(completionMessage, { parse_mode: 'Markdown' });
            
            // Send notification to the group chat
            await this.sendGroupSetupNotification(ctx, session);
            
            // Clean up session after delay
            setTimeout(async () => {
                const { BotsStore } = await import('../../sdk/bots-brain/index.js');
                await BotsStore.deleteDmSetupSession(sessionId);
            }, 60000);
            
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.finalizeSetupWithDefaults', { sessionId });
            await ctx.editMessageText("❌ **Setup Error**\n\nFailed to finalize setup. Please try `/setup` again.");
        }
    }

    /**
     * Handle finishing custom template setup
     */
    private async handleFinishCustomSetup(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("✅ Finishing custom template setup...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            // Complete setup with custom templates
            await this.finalizeCustomTemplateSetup(ctx, sessionId, session);
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleFinishCustomSetup', { sessionId });
            await ctx.answerCbQuery("❌ Failed to finish custom setup. Please try again.");
            return true;
        }
    }

    /**
     * Finalize setup with custom templates
     */
    private async finalizeCustomTemplateSetup(ctx: BotContext, sessionId: string, session: DmSetupSession): Promise<void> {
        try {
            const customerName = session.stepData?.customerName || 
                               session.stepData?.suggestedName || 
                               (session.stepData?.existingCustomerId ? `Customer ${session.stepData.existingCustomerId.substring(0, 8)}...` : 'Unknown');
            
            const completionMessage = `✅ **Custom Setup Complete!**

**Customer:** ${customerName}
**Group:** ${session.groupChatName}
**Templates:** Custom templates configured

🎉 **Your group is ready for support ticket management!**

**Next Steps:**
• Users can now create support tickets
• Your custom templates are active
• Use \`/templates\` anytime to modify them
• Check \`/help\` for all commands

*Enjoy your personalized support system!*`;

            await ctx.editMessageText(completionMessage, { parse_mode: 'Markdown' });
            
            // Send notification to the group chat
            await this.sendGroupSetupNotification(ctx, session);
            
            // Clean up session after delay
            setTimeout(async () => {
                const { BotsStore } = await import('../../sdk/bots-brain/index.js');
                await BotsStore.deleteDmSetupSession(sessionId);
            }, 60000);
            
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.finalizeCustomTemplateSetup', { sessionId });
            await ctx.editMessageText("❌ **Setup Error**\n\nFailed to finalize custom setup. Please try `/setup` again.");
        }
    }

    // Simplified validation method for callback processor
    private async performSetupValidation(ctx: BotContext, sessionId: string, groupChatId: number, groupTitle: string): Promise<void> {
        // This is a simplified version - in production, you'd extract this to a shared service
        await ctx.editMessageText(
            `🔄 **Validation Retry**

Please return to the group and run \`/setup\` again to retry the validation process.`
        );
    }

    /**
     * Send setup completion notification to the group chat
     */
    private async sendGroupSetupNotification(ctx: BotContext, session: DmSetupSession): Promise<void> {
        try {
            const customerName = session.stepData?.customerName || 
                               session.stepData?.suggestedName || 
                               (session.stepData?.existingCustomerId ? `Customer ${session.stepData.existingCustomerId.substring(0, 8)}...` : 'Unknown');

            const setupType = session.stepData?.linkType === 'existing' ? 'linked to existing customer' : 'configured with new customer';

            const groupNotification = `✅ **Setup Complete!**

📋 **This group is now configured for support tickets.**

**Customer:** ${customerName}  
**Setup:** Successfully ${setupType}

🎫 **Members can use** \`/support\` **to create support tickets and get help from our team.**

⚡ **Quick Setup:** Just two simple choices in your DM!`;

            await ctx.telegram.sendMessage(session.groupChatId, groupNotification, { 
                parse_mode: 'Markdown' 
            });

        } catch (error) {
            logError(error, 'SetupCallbackProcessor.sendGroupSetupNotification', { 
                sessionId: session.sessionId,
                groupChatId: session.groupChatId 
            });
        }
    }

    /**
     * Show template customization interface (public method for external access)
     */
    public async showTemplateCustomization(ctx: BotContext, sessionId: string, session: DmSetupSession): Promise<void> {
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            
            // Get current templates (will be defaults if not set)
            const templateManager = GlobalTemplateManager.getInstance();
            const templates = await templateManager.getGlobalTemplates();
            
            const customizationMessage = `🎨 **Template Customization**

**Group:** ${session.groupChatName}

Choose which template to customize first:

**Available Templates:**
• 🎫 **Ticket Created** - New support ticket notifications
• 👨‍💼 **Agent Response** - When agents reply to tickets  
• ✅ **Ticket Closed** - Support ticket resolution messages

💡 **What You Can Customize:**
• Message content and formatting
• Use dynamic variables like \`{{ticketId}}\`, \`{{customerName}}\`
• Add your brand voice and personality
• Include specific instructions or next steps

🔧 **Available Variables:**
Each template has access to relevant data like ticket details, customer info, agent names, and timestamps.

*Click a template below to see all available variables and current content:*`;

            await ctx.editMessageText(customizationMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🎫 Ticket Created", callback_data: `template_edit_tc_${sessionId}` }
                        ],
                        [
                            { text: "👨‍💼 Agent Response", callback_data: `template_edit_ar_${sessionId}` }
                        ],
                        [
                            { text: "✅ Ticket Status", callback_data: `template_edit_ts_${sessionId}` }
                        ],
                        [
                            { text: "🚀 Use Defaults Instead", callback_data: `setup_use_defaults_${sessionId}` },
                            { text: "✅ Finish Setup", callback_data: `setup_finish_custom_${sessionId}` }
                        ]
                    ]
                }
            });
            
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.showTemplateCustomization', { sessionId });
            await ctx.editMessageText("❌ Failed to load template customization. Using defaults instead...");
            await this.handleUseDefaultTemplates(ctx, sessionId);
        }
    }

    /**
     * Handle template editing during setup
     */
    private async handleTemplateEdit(ctx: BotContext, sessionId: string, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery(`✏️ Editing ${templateType.replace('_', ' ')} template...`);
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            // Get current template content and available variables
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const availableVariables = templateManager.getAvailableVariables();
            
            // Get current template
            const currentTemplate = await templateManager.getTemplate(templateType as any);
            
            // Map template type to readable name
            let templateDisplayName = 'Template';
            let templateDescription = '';
            
            switch (templateType) {
                case 'ticket_created':
                    templateDisplayName = 'Ticket Created';
                    templateDescription = 'Sent when a new support ticket is created';
                    break;
                case 'agent_response':
                    templateDisplayName = 'Agent Response';
                    templateDescription = 'Sent when an agent responds to a ticket';
                    break;
                case 'ticket_status':
                    templateDisplayName = 'Ticket Status';
                    templateDescription = 'Sent when a support ticket status changes';
                    break;
                default:
                    templateDisplayName = templateType.charAt(0).toUpperCase() + templateType.slice(1).replace('_', ' ');
            }

            // Build available variables list
            const coreVars = availableVariables.core.map(v => `• \`{{${v.name}}}\` - ${v.description}`).join('\n');
            const agentVars = availableVariables.agent.map(v => `• \`{{${v.name}}}\` - ${v.description}`).join('\n');
            const timeVars = availableVariables.time.map(v => `• \`{{${v.name}}}\` - ${v.description}`).join('\n');

            const editMessage = `✏️ **Template Editor: ${templateDisplayName}**

**Group:** ${session.groupChatName}
**Purpose:** ${templateDescription}

� **Current Template:**
\`\`\`
${currentTemplate?.content || 'Loading...'}
\`\`\`

🔧 **Available Variables:**

**Core Variables:**
${coreVars}

**Agent Variables:**
${agentVars}

**Time Variables:**
${timeVars}

💡 **Usage Examples:**
• \`{{ticketId}}\` → TKT-12345
• \`{{customerName}}\` → John Doe
• \`{{agentName}}\` → Sarah Johnson

📋 **Template Syntax:**
• Use \`{{variableName}}\` for dynamic content
• Keep messages clear and professional
• Test with different scenarios in mind

**Ready to customize? Click "Edit Template" to start!**`;

            await ctx.editMessageText(editMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✏️ Edit Template", callback_data: `template_start_edit_${this.getTemplateShortCode(templateType)}_${sessionId}` }
                        ],
                        [
                            { text: "⬅️ Back to Templates", callback_data: `setup_customize_templates_${sessionId}` }
                        ],
                        [
                            { text: "🚀 Use Defaults Instead", callback_data: `setup_use_defaults_${sessionId}` },
                            { text: "✅ Finish Setup", callback_data: `setup_finish_custom_${sessionId}` }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleTemplateEdit', { sessionId, templateType });
            await ctx.answerCbQuery("❌ Failed to open template editor. Please try again.");
            return true;
        }
    }

    /**
     * Handle starting template editing (text input flow)
     */
    private async handleTemplateStartEdit(ctx: BotContext, sessionId: string, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery("✏️ Starting template editor...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            // Get current template content
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const currentTemplate = await templateManager.getTemplate(templateType as any);
            
            // Map template type to readable name
            let templateDisplayName = templateType.charAt(0).toUpperCase() + templateType.slice(1).replace('_', ' ');
            
            switch (templateType) {
                case 'ticket_created':
                    templateDisplayName = 'Ticket Created';
                    break;
                case 'agent_response':
                    templateDisplayName = 'Agent Response';
                    break;
                case 'ticket_status':
                    templateDisplayName = 'Ticket Status';
                    break;
            }

            // Update session to expect template content input
            await BotsStore.updateDmSetupSession(sessionId, {
                currentStep: 'awaiting_template_content',
                stepData: {
                    ...session.stepData,
                    editingTemplateType: templateType,
                    originalTemplateContent: currentTemplate?.content || ''
                }
            });
            
            const editPromptMessage = `✏️ **Edit ${templateDisplayName} Template**

**Group:** ${session.groupChatName}

📝 **Current Template:**
\`\`\`
${currentTemplate?.content || 'Loading...'}
\`\`\`

**Instructions:**
• Type your new template content below
• Use variables like \`{{ticketId}}\`, \`{{customerName}}\`, \`{{agentName}}\`
• Keep it clear and professional
• You can use multiple lines

**Available Variables:**
• \`{{ticketId}}\` - Unique ticket identifier
• \`{{summary}}\` - Ticket summary/title  
• \`{{customerName}}\` - Customer name
• \`{{status}}\` - Ticket status
• \`{{agentName}}\` - Agent name (for responses)
• \`{{response}}\` - Agent response content
• \`{{createdAt}}\` - Creation time
• \`{{updatedAt}}\` - Last update time

**Type your new template content:**`;

            await ctx.editMessageText(editPromptMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "❌ Cancel Edit", callback_data: `template_cancel_edit_${this.getTemplateShortCode(templateType)}_${sessionId}` }
                        ],
                        [
                            { text: "⬅️ Back to Template Info", callback_data: `template_edit_${this.getTemplateShortCode(templateType)}_${sessionId}` }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleTemplateStartEdit', { sessionId, templateType });
            await ctx.answerCbQuery("❌ Failed to start template editor. Please try again.");
            return true;
        }
    }

    /**
     * Handle canceling template edit
     */
    private async handleTemplateCancelEdit(ctx: BotContext, sessionId: string, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery("❌ Template edit cancelled");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            
            // Reset session step
            await BotsStore.updateDmSetupSession(sessionId, {
                currentStep: 'template_customization'
            });
            
            // Return to template info view
            return await this.handleTemplateEdit(ctx, sessionId, templateType);
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleTemplateCancelEdit', { sessionId, templateType });
            await ctx.editMessageText("❌ Failed to cancel template edit. Please try again.");
            return true;
        }
    }
}

/**
 * Admin Callback Processor
 * Handles callbacks related to admin functionality and activation
 */
export class AdminCallbackProcessor implements ICallbackProcessor {
    canHandle(callbackData: string): boolean {
        return callbackData.startsWith('admin_help_');
    }

    async process(ctx: BotContext, callbackData: string): Promise<boolean> {
        try {
            if (callbackData.startsWith('admin_help_activation_')) {
                return await this.handleActivationHelp(ctx);
            }
            return false;
        } catch (error) {
            logError(error, 'AdminCallbackProcessor.process', { 
                callbackData, 
                userId: ctx.from?.id 
            });
            await ctx.answerCbQuery("❌ An error occurred. Please try again.");
            return true;
        }
    }

    private async handleActivationHelp(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("📋 Loading activation help...");
        
        const helpMessage = 
            `📋 **Admin Activation Guide**

**Why do you need to activate?**
• Security: Links your admin account to a private chat
• Notifications: Enables direct updates and alerts
• Configuration: Allows secure setup management
• Audit Trail: Tracks admin actions for compliance

**Step-by-Step Instructions:**

**1. Start Private Chat**
   • Click 'Send Private Message' button (above)
   • Or search for this bot in Telegram
   • Start a conversation

**2. Send Activation Command**
   • Type: \`/activate\`
   • Send the message
   • Wait for confirmation

**3. Return to Group**
   • Come back to this group chat
   • Try \`/setup\` command again
   • Configuration should now work

**Troubleshooting:**
• Make sure you're in a private chat (not group)
• Verify your user ID is in bot's admin list
• Contact system administrator if issues persist

*Ready to activate? Use the buttons above!*`;

        await ctx.editMessageText(helpMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "💬 Send Private Message",
                            url: `https://t.me/${ctx.botInfo?.username || 'unthread_bot'}?start=admin_activate`
                        }
                    ],
                    [
                        {
                            text: "⬅️ Back to Setup",
                            callback_data: "admin_back_to_setup"
                        }
                    ]
                ]
            }
        });
        
        return true;
    }
}
