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
import * as unthreadService from '../../services/unthread.js';
import { SetupCallbackProcessor } from './CallbackProcessors.js';
import { LogEngine } from '@wgtechlabs/log-engine';

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
            const userId = ctx.from!.id;
            const userInput = ('text' in ctx.message! ? ctx.message!.text : '') || '';
            const userState = await BotsStore.getUserState(userId);

            if (!userState) {
                return false;
            }

            if (userState.field === 'summary') {
                return await this.handleSummaryInput(ctx, userInput, userState);
            } else if (userState.field === 'email') {
                return await this.handleEmailInput(ctx, userInput, userState);
            }

            return false;
        } catch (error) {
            logError(error, 'SupportConversationProcessor.process', { 
                userId: ctx.from?.id 
            });
            return false;
        }
    }

    private async handleSummaryInput(ctx: BotContext, summary: string, userState: any): Promise<boolean> {
        const userId = ctx.from!.id;

        if (summary.trim().length < 10) {
            await ctx.reply(
                "📝 **Please provide more details**\n\n" +
                "Your issue description should be at least 10 characters long to help our team assist you better.\n\n" +
                "*Please describe your issue:*",
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "Describe your issue in detail..."
                    }
                }
            );
            return true;
        }

        // Store the summary
        userState.summary = summary;

        if (userState.hasEmail) {
            // User has email, create ticket immediately
            return await this.createTicket(ctx, userState);
        } else {
            // Ask for email
            await BotsStore.setUserState(userId, {
                ...userState,
                field: 'email',
                step: 2
            });

            await ctx.reply(
                "📧 **Step 2 of 2:** Email Address\n\n" +
                "Please provide your email address so our support team can follow up with you.\n\n" +
                "*This will be saved for future tickets:*",
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "your@email.com"
                    }
                }
            );
        }

        return true;
    }

    private async handleEmailInput(ctx: BotContext, email: string, userState: any): Promise<boolean> {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            await ctx.reply(
                "❌ **Invalid Email Format**\n\n" +
                "Please provide a valid email address.\n\n" +
                "*Enter your email:*",
                { 
                    parse_mode: 'Markdown',
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: "your@email.com"
                    }
                }
            );
            return true;
        }

        // Store email and create ticket
        userState.email = email.trim();
        return await this.createTicket(ctx, userState);
    }

    private async createTicket(ctx: BotContext, userState: any): Promise<boolean> {
        const userId = ctx.from!.id;
        const chatId = ctx.chat!.id;

        try {
            // Show processing message
            const statusMsg = await ctx.reply(
                "🎫 **Creating Your Ticket**\n\n⏳ Please wait while I create your support ticket...",
                { parse_mode: 'Markdown' }
            );

            // Get or create customer for this chat
            const chatTitle = ctx.chat!.type === 'group' || ctx.chat!.type === 'supergroup' 
                ? (ctx.chat as any).title || 'Telegram Group'
                : 'Private Chat';

            const customer = await unthreadService.getOrCreateCustomer(chatId.toString(), chatTitle);
            
            // Get user data with email
            let userData = await unthreadService.getOrCreateUser(userId, ctx.from?.username);
            
            // Update user with email if provided
            if (userState.email && (!userData.email || userData.email !== userState.email)) {
                await BotsStore.updateUser(userId, { email: userState.email });
                userData = { ...userData, email: userState.email };
            }

            // Create the ticket
            const ticketResponse = await unthreadService.createTicket({
                groupChatName: chatTitle,
                customerId: customer.id,
                summary: userState.summary,
                onBehalfOf: {
                    name: userData.name || ctx.from?.first_name || 'Telegram User',
                    email: userData.email || userState.email
                }
            });

            // Register ticket confirmation for bidirectional messaging
            await unthreadService.registerTicketConfirmation({
                messageId: statusMsg.message_id,
                ticketId: ticketResponse.id,
                friendlyId: ticketResponse.friendlyId,
                customerId: customer.id,
                chatId: chatId,
                telegramUserId: userId
            });

            // Clear user state
            await BotsStore.clearUserState(userId);

            // Update success message
            const successMessage = 
                "✅ **Ticket Created Successfully!**\n\n" +
                `🎫 **Ticket ID:** ${ticketResponse.friendlyId}\n` +
                `📝 **Summary:** ${userState.summary}\n` +
                `👤 **Created by:** ${userData.name || ctx.from?.first_name}\n` +
                `📧 **Email:** ${userData.email || userState.email}\n\n` +
                "Our support team will respond shortly. You can reply to this message to add more information to your ticket.";

            await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });

            LogEngine.info('Support ticket created successfully', {
                ticketId: ticketResponse.id,
                friendlyId: ticketResponse.friendlyId,
                userId,
                chatId,
                summary: userState.summary.substring(0, 100)
            });

            return true;

        } catch (error) {
            logError(error, 'SupportConversationProcessor.createTicket', { userId, chatId });
            
            // Clear user state on error
            await BotsStore.clearUserState(userId);

            await ctx.reply(
                "❌ **Error Creating Ticket**\n\n" +
                "Sorry, there was an error creating your support ticket. Please try again later or contact an administrator.\n\n" +
                "Use `/support` to start over.",
                { parse_mode: 'Markdown' }
            );

            return true;
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
            
            if (!activeSessions) {
                return false;
            }

            // Check if session is expired and attempt recovery
            const now = new Date();
            const sessionExpiry = new Date(activeSessions.expiresAt);
            if (sessionExpiry <= now) {
                // Attempt to extend expired session if it's within 5 minutes of expiry
                const timeDiffMinutes = (now.getTime() - sessionExpiry.getTime()) / (1000 * 60);
                if (timeDiffMinutes <= 5) {
                    const newExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
                    await BotsStore.updateDmSetupSession(activeSessions.sessionId, {
                        expiresAt: newExpiresAt.toISOString()
                    });
                } else {
                    return false;
                }
            }

            // Check if we're waiting for text input
            const canHandle = activeSessions.currentStep === 'awaiting_custom_name' || 
                              activeSessions.currentStep === 'awaiting_customer_id' ||
                              activeSessions.currentStep === 'awaiting_template_content';
            
            return canHandle;
        } catch (error) {
            logError(error, 'DmSetupInputProcessor.canHandle', { userId });
            return false;
        }
    }

    async process(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        const inputText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

        if (!userId || !inputText) {
            return false;
        }

        try {
            // Get the active session with enhanced debugging and recovery
            let session = await BotsStore.getActiveDmSetupSessionByAdmin(userId);
            
            // If session not found, try to recover by checking if there was a recent session
            if (!session) {
                return false;
            }
            
            // Extend session expiry on text input to prevent timeout during processing
            const now = new Date();
            const sessionExpiry = new Date(session.expiresAt);
            if (sessionExpiry.getTime() - now.getTime() < 5 * 60 * 1000) { // Less than 5 minutes remaining
                const newExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
                await BotsStore.updateDmSetupSession(session.sessionId, {
                    expiresAt: newExpiresAt.toISOString()
                });
                
                // Refresh session data
                session = await BotsStore.getDmSetupSession(session.sessionId);
                if (!session) {
                    return false;
                }
            }
            
            if (session.currentStep !== 'awaiting_custom_name' && 
                session.currentStep !== 'awaiting_customer_id' && 
                session.currentStep !== 'awaiting_template_content') {
                
                // Check if this looks like a custom name input and try to recover
                if (inputText.trim().length > 0 && inputText.trim().length <= 100 && 
                    session.currentStep === 'customer_setup') {
                    
                    // Force update to awaiting_custom_name
                    if (session?.sessionId) {
                        await BotsStore.updateDmSetupSession(session.sessionId, {
                            currentStep: 'awaiting_custom_name'
                        });
                        
                        // Refresh session data
                        session = await BotsStore.getDmSetupSession(session.sessionId);
                    }
                } else {
                    return false;
                }
            }
            
            // Ensure session is not null after recovery
            if (!session) {
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
            const result = await this.handleCustomNameInput(ctx, session, inputText);
            
            return result;
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
            // First, extend session expiry to prevent timeout during customer validation
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const now = new Date();
            const extendedExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
            
            await BotsStore.updateDmSetupSession(session.sessionId, {
                expiresAt: extendedExpiresAt.toISOString()
            });
            
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
                                    { text: "⬅️ Back to Options", callback_data: `setup_back_to_customer_selection_${session.sessionId}` }
                                ],
                                [
                                    { text: "❌ Cancel Setup", callback_data: `setup_cancel_${session.sessionId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // Send validation message
            const validationMsg = await ctx.reply("🔍 Validating customer ID with Unthread...", { parse_mode: 'Markdown' });

            // Validate customer exists and get customer details
            const trimmedCustomerId = customerId.trim();
            let customerName: string;
            
            try {
                const { validateCustomerExists } = await import('../../services/unthread.js');
                const validationResult = await validateCustomerExists(trimmedCustomerId);

                if (!validationResult.exists) {
                    // Clean up validation message
                    try {
                        await ctx.deleteMessage(validationMsg.message_id);
                    } catch (deleteError) {
                        // Ignore deletion errors
                    }
                    
                    await ctx.reply(
                        `❌ **Customer Not Found**\n\n${validationResult.error || 'The customer ID was not found in your Unthread workspace.'}\n\nPlease check the customer ID and try again:`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: "⬅️ Back to Options", callback_data: `setup_back_to_customer_selection_${session.sessionId}` }
                                    ],
                                    [
                                        { text: "❌ Cancel Setup", callback_data: `setup_cancel_${session.sessionId}` }
                                    ]
                                ]
                            }
                        }
                    );
                    return true;
                }

                customerName = validationResult.customer?.name || `Customer ${trimmedCustomerId.substring(0, 8)}...`;
                
                // Clean up validation message and show success
                try {
                    await ctx.deleteMessage(validationMsg.message_id);
                } catch (deleteError) {
                    // Ignore deletion errors
                }
                
                // Clean up any stale cancel button messages from the session
                const { BotsStore } = await import('../../sdk/bots-brain/index.js');
                const currentSession = await BotsStore.getDmSetupSession(session.sessionId);
                if (currentSession?.messageIds) {
                    for (const messageId of currentSession.messageIds) {
                        try {
                            // Try to edit the message to remove buttons
                            await ctx.telegram.editMessageReplyMarkup(
                                ctx.chat!.id,
                                messageId,
                                undefined,
                                { inline_keyboard: [] }
                            );
                        } catch (editError) {
                            // If edit fails, ignore - the message might be too old or already deleted
                        }
                    }
                    
                    // Clear the tracked message IDs since they've been cleaned up
                    await BotsStore.updateDmSetupSession(session.sessionId, { 
                        messageIds: [] 
                    });
                }
                
                await ctx.reply(`✅ Customer found: **${customerName}**\n\nLinking to existing customer...`, { parse_mode: 'Markdown' });

            } catch (validationError) {
                logError(validationError, 'DmSetupInputProcessor.validateCustomer', { 
                    customerId: trimmedCustomerId,
                    sessionId: session.sessionId 
                });
                
                // Fail fast - don't generate fake names or proceed with invalid data
                throw new Error(`Customer validation failed: ${(validationError as Error).message}`);
            }

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
                    customerName: customerName, // Use the actual customer name from Unthread
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
                // Also extend the session expiration time to give user more time for template customization
                const now = new Date();
                const currentExpiry = new Date(session.expiresAt);
                
                // Extend to 30 minutes from now, or add 30 minutes to current expiry, whichever is later
                const newExpiryFromNow = new Date(now.getTime() + 30 * 60 * 1000);
                const newExpiryFromCurrent = new Date(currentExpiry.getTime() + 30 * 60 * 1000);
                const extendedExpiresAt = newExpiryFromNow > newExpiryFromCurrent ? newExpiryFromNow : newExpiryFromCurrent;
                
                await BotsStore.updateDmSetupSession(session.sessionId, {
                    currentStep: 'template_configuration',
                    expiresAt: extendedExpiresAt.toISOString() // Extend session expiration
                });

                const successMessage = `🎉 **Setup Complete!**

**Linked to Existing Customer**
**Customer:** ${customerName}
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
                                { text: "✅ Finish Setup", callback_data: `setup_use_defaults_${session.sessionId}` },
                                { text: "🎨 Customize Templates", callback_data: `setup_customize_templates_${session.sessionId}` }
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
                                    { text: "🔄 Retry Customer ID", callback_data: `setup_existing_customer_${session.sessionId}` },
                                    { text: "✏️ Use Different Name", callback_data: `setup_custom_name_${session.sessionId}` }
                                ],
                                [
                                    { text: "⬅️ Back to Options", callback_data: `setup_back_to_customer_selection_${session.sessionId}` }
                                ],
                                [
                                    { text: "❌ Cancel Setup", callback_data: `setup_cancel_${session.sessionId}` }
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
                                { text: "🔄 Try Different ID", callback_data: `setup_existing_customer_${session.sessionId}` },
                                { text: "✏️ Use Different Name", callback_data: `setup_custom_name_${session.sessionId}` }
                            ],
                            [
                                { text: "⬅️ Back to Options", callback_data: `setup_back_to_customer_selection_${session.sessionId}` }
                            ],
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

    private async handleCustomNameInput(ctx: BotContext, session: any, inputText: string): Promise<boolean> {
        try {
            // First, extend session expiry to prevent timeout during customer creation
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const now = new Date();
            const extendedExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
            
            await BotsStore.updateDmSetupSession(session.sessionId, {
                expiresAt: extendedExpiresAt.toISOString()
            });
            
            // Validate the customer name input
            const { validateCustomerName } = await import('../utils/validation.js');
            const validation = validateCustomerName(inputText);

            if (!validation.isValid) {
                // Generate short callback IDs to stay within Telegram's 64-byte limit
                const { SetupCallbackProcessor } = await import('./CallbackProcessors.js');
                const shortBackId = SetupCallbackProcessor.generateShortCallbackId(session.sessionId);
                const shortCancelId = SetupCallbackProcessor.generateShortCallbackId(session.sessionId);
                
                await ctx.reply(
                    `❌ **Invalid Customer Name**\n\n${validation.error}\n\n${validation.details}\n\nPlease try again:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "⬅️ Back to Options", callback_data: `setup_back_to_customer_selection_${shortBackId}` }
                                ],
                                [
                                    { text: "❌ Cancel Setup", callback_data: `setup_cancel_${shortCancelId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // Process the valid customer name
            await ctx.reply("✅ Processing your custom customer name...", { parse_mode: 'Markdown' });

            // Update session with the custom name and extend expiry for completion process
            const finalExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // Another 30 minutes for completion
            await BotsStore.updateDmSetupSession(session.sessionId, {
                currentStep: 'customer_setup_complete',
                expiresAt: finalExpiresAt.toISOString(),
                stepData: {
                    ...session.stepData,
                    customerName: validation.sanitizedValue
                }
            });
            
            // Import and use the callback processor to complete the setup
            const { SetupCallbackProcessor } = await import('./CallbackProcessors.js');
            const callbackProcessor = new SetupCallbackProcessor();
            
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
            // Generate short callback IDs for error handling
            const shortCustomId = SetupCallbackProcessor.generateShortCallbackId(session.sessionId);
            const shortExistingId = SetupCallbackProcessor.generateShortCallbackId(session.sessionId);
            const shortBackId = SetupCallbackProcessor.generateShortCallbackId(session.sessionId);
            const shortCancelId = SetupCallbackProcessor.generateShortCallbackId(session.sessionId);
            
            await ctx.reply(
                "❌ **Customer Name Setup Failed**\n\nFailed to process your custom name. This could be due to:\n• Network connection issues\n• Invalid session state\n• System configuration problems\n\nWhat would you like to do?",
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "🔄 Try Different Name", callback_data: `setup_custom_name_${shortCustomId}` },
                                { text: "🔗 Use Existing Customer", callback_data: `setup_existing_customer_${shortExistingId}` }
                            ],
                            [
                                { text: "⬅️ Back to Options", callback_data: `setup_back_to_customer_selection_${shortBackId}` }
                            ],
                            [
                                { text: "❌ Cancel Setup", callback_data: `setup_cancel_${shortCancelId}` }
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
