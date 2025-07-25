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
import type { DmSetupSession, UserState } from '../../sdk/types.js';
import type { GlobalTemplateEvent } from '../../config/globalTemplates.js';
import { BotsStore } from '../../sdk/bots-brain/index.js';
import { logError } from '../utils/errorHandler.js';
import * as unthreadService from '../../services/unthread.js';
import { attachmentHandler } from '../../utils/attachmentHandler.js';
import { extractFileAttachments } from '../../events/message.js';
import { getMessageText, hasTextContent } from '../../utils/messageContentExtractor.js';
import { generateStatusMessage } from '../../utils/messageAnalyzer.js';
import { SetupCallbackProcessor } from './CallbackProcessors.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import { escapeMarkdown, lightEscapeMarkdown, truncateText } from '../../utils/markdownEscape.js';
import { SimpleInputValidator } from '../../utils/simpleValidators.js';

/**
 * Support Form Conversation Processor
 * Handles text input during support ticket creation
 */
export class SupportConversationProcessor implements IConversationProcessor {
    async canHandle(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        if (!userId || !ctx.message || !hasTextContent(ctx)) {
            return false;
        }

        try {
            const userState = await BotsStore.getUserState(userId);
            const canHandle = userState?.field === 'summary' || 
                              userState?.field === 'email' ||
                              userState?.field === 'template_content';
                              
            LogEngine.debug('SupportConversationProcessor.canHandle evaluation', {
                userId,
                chatType: ctx.chat?.type,
                hasUserState: !!userState,
                userStateField: userState?.field,
                canHandle,
                messageId: ctx.message?.message_id
            });
            
            return canHandle;
        } catch (error) {
            logError(error, 'SupportConversationProcessor.canHandle', { userId });
            return false;
        }
    }

    async process(ctx: BotContext): Promise<boolean> {
        try {
            // Defensive check for ctx.from
            if (!ctx.from) {
                LogEngine.warn('Message received without sender information', {
                    chatId: ctx.chat?.id,
                    hasMessage: !!ctx.message
                });
                return false;
            }

            const userId = ctx.from.id;
            const userInput = getMessageText(ctx) || '';
            const userState = await BotsStore.getUserState(userId);

            if (!userState) {
                return false;
            }

            if (userState.field === 'summary') {
                // Detect attachments in the current message for proper summary confirmation
                const messageAttachments = extractFileAttachments(ctx);
                
                LogEngine.info('Processing summary input with attachment detection', {
                    userId,
                    userInput: userInput.substring(0, 100),
                    attachmentCount: messageAttachments.length,
                    attachmentIds: messageAttachments,
                    source: 'regular_message_processor'
                });
                
                // Pass detected attachments to handleSummaryInput for proper confirmation flow
                return await this.handleSummaryInput(ctx, userInput, userState, messageAttachments);
            } else if (userState.field === 'email') {
                return await this.handleEmailInput(ctx, userInput, userState);
            } else if (userState.field === 'template_content') {
                return await this.handleTemplateContentInput(ctx, userInput, userState);
            }

            return false;
        } catch (error) {
            logError(error, 'SupportConversationProcessor.process', { 
                userId: ctx.from?.id 
            });
            return false;
        }
    }

    public async handleSummaryInput(ctx: BotContext, summary: string, userState: UserState, preDetectedAttachments?: string[]): Promise<boolean> {
        // Defensive check for ctx.from
        if (!ctx.from) {
            LogEngine.warn('Summary input received without sender information');
            return false;
        }

        const userId = ctx.from.id;

        // Simple, practical validation for enterprise users
        const validation = SimpleInputValidator.validateSummary(summary);
        
        if (!validation.isValid) {
            let message = `❌ **${validation.message}**`;
            
            if (validation.suggestion) {
                message += `\n\n💡 ${validation.suggestion}`;
            }
            
            message += "\n\n*Please try again:*";
            
            await ctx.reply(message, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "Describe your issue in detail..."
                }
            });

            LogEngine.info('Summary validation failed', {
                userId,
                reason: validation.message,
                inputLength: summary.length
            });

            return true;
        }

        // Store the summary and use pre-detected attachment data or extract if not provided
        userState.summary = summary.trim();
        
        // Use pre-detected attachment data if available, otherwise extract from context
        const detectedAttachmentIds = preDetectedAttachments || extractFileAttachments(ctx);
        const detectedHasAttachments = detectedAttachmentIds.length > 0;
        
        // Store attachment information in user state for callback processor
        userState.attachmentIds = detectedAttachmentIds;
        userState.hasAttachments = detectedHasAttachments;

        // Set confirmation state
        await BotsStore.setUserState(userId, {
            ...userState,
            field: 'confirmation',
            step: 2,
            attachmentIds: detectedAttachmentIds,
            hasAttachments: detectedHasAttachments
        });

        // Show confirmation with attachment awareness
        const safeSummary = lightEscapeMarkdown(truncateText(summary.trim(), 200));
        
        let confirmationMessage = 
            "📝 **Review Your Issue**\n\n" +
            `**Summary:** ${safeSummary}\n\n`;
            
        // Add attachment information if present
        if (detectedHasAttachments) {
            confirmationMessage += `**Attachments:** ${detectedAttachmentIds.length} file${detectedAttachmentIds.length > 1 ? 's' : ''} attached\n\n`;
        }
        
        confirmationMessage += "Please review your issue description above. What would you like to do?";

        LogEngine.info('Summary accepted with attachment detection', { 
            userId, 
            summaryLength: summary.trim().length,
            wordCount: summary.trim().split(/\s+/).length,
            hasAttachments: detectedHasAttachments,
            attachmentCount: detectedAttachmentIds.length,
            attachmentIds: detectedAttachmentIds
        });

        // Generate short callback IDs for the three-button interface
        const { SupportCallbackProcessor } = await import('./CallbackProcessors.js');
        const shortId = SupportCallbackProcessor.generateShortCallbackId(userId.toString());

        await ctx.reply(confirmationMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Proceed", callback_data: `support_proceed_${shortId}` }
                    ],
                    [
                        { text: "✏️ Edit Summary", callback_data: `support_edit_${shortId}` }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: `support_cancel_${shortId}` }
                    ]
                ]
            }
        });

        return true;
    }

    private async handleEmailInput(ctx: BotContext, email: string, userState: UserState): Promise<boolean> {
        // Use robust email validation from utility function
        const emailValidation = await import('../utils/validation.js').then(module => module.validateEmail(email.trim()));
        
        if (!emailValidation.isValid) {
            await ctx.reply(
                "❌ **Invalid Email Format**\n\n" +
                (emailValidation.error || "Please provide a valid email address.") + "\n\n" +
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
        userState.email = emailValidation.sanitizedValue || email.trim();
        return await this.createTicket(ctx, userState);
    }

    /**
     * Handle template content input for standalone template editing
     */
    private async handleTemplateContentInput(ctx: BotContext, templateContent: string, userState: UserState): Promise<boolean> {
        const userId = ctx.from?.id;
        if (!userId) {
            LogEngine.warn('Template content input received without sender information');
            return false;
        }

        const templateType = userState.templateType;
        if (!templateType) {
            LogEngine.error('Template content input without template type', { userId });
            await ctx.reply("❌ **Template editing session invalid**\n\nPlease start over with `/templates`.");
            await BotsStore.clearUserState(userId);
            return true;
        }

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
                                    { text: "❌ Cancel Editing", callback_data: "template_cancel_edit" }
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
                                    { text: "❌ Cancel Editing", callback_data: "template_cancel_edit" }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // Basic variable validation
            const variableMatches = templateContent.match(/\{\{[^}]+\}\}/g);
            if (variableMatches) {
                const invalidVars: string[] = [];
                const validVars = ['ticketId', 'ticketNumber', 'summary', 'customerName', 'status', 'response', 'createdAt', 'updatedAt'];
                
                for (const match of variableMatches) {
                    const varName = match.replace(/[{}]/g, '').trim();
                    if (!validVars.includes(varName)) {
                        invalidVars.push(varName);
                    }
                }
                
                if (invalidVars.length > 0) {
                    await ctx.reply(
                        `❌ **Invalid Variables**\n\nThe following variables are not recognized:\n• ${invalidVars.join('\n• ')}\n\n**Valid variables:**\n• ticketId, ticketNumber, summary, customerName\n• status, response, createdAt, updatedAt\n\nPlease fix your template:`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: "❌ Cancel Editing", callback_data: "template_cancel_edit" }
                                    ]
                                ]
                            }
                        }
                    );
                    return true;
                }
            }

            // Update the template
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            
            const updateResult = await templateManager.updateTemplate(
                templateType as GlobalTemplateEvent,
                templateContent,
                true,
                userId
            );

            if (!updateResult.success) {
                await ctx.reply(
                    `❌ **Template Update Failed**\n\n${updateResult.error || 'Unknown error occurred'}\n\nPlease try again:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "❌ Cancel Editing", callback_data: "template_cancel_edit" }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // Success! Show confirmation and clear state
            const templateDisplayName = templateType.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
            
            await ctx.reply("✅ **Template Updated Successfully!**\n\nYour template has been saved and is now active.");

            // Clear user state
            await BotsStore.clearUserState(userId);

            // Show updated template manager
            const successMessage = `✅ **${templateDisplayName} Template Updated**

Your template has been successfully saved and is now being used for notifications.

**Updated Content:**
\`\`\`
${templateContent}
\`\`\`

Your customization is now active across all support interactions.`;

            await ctx.reply(successMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "📝 Open Template Manager", callback_data: "template_back_to_manager" }
                        ]
                    ]
                }
            });

            return true;

        } catch (error) {
            logError(error, 'SupportConversationProcessor.handleTemplateContentInput', { 
                userId, 
                templateType,
                templateContent: templateContent.substring(0, 100)
            });
            await ctx.reply(
                "❌ **Template Update Error**\n\nFailed to update the template. Please try again or cancel the edit.",
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "❌ Cancel Editing", callback_data: "template_cancel_edit" }
                            ]
                        ]
                    }
                }
            );
            return true;
        }
    }

    private async createTicket(ctx: BotContext, userState: UserState): Promise<boolean> {
        // Defensive checks for required context
        if (!ctx.from) {
            LogEngine.warn('Ticket creation attempted without sender information');
            return false;
        }

        if (!ctx.chat) {
            LogEngine.warn('Ticket creation attempted without chat information');
            return false;
        }

        if (!userState.summary) {
            LogEngine.warn('Ticket creation attempted without summary');
            return false;
        }

        const userId = ctx.from.id;
        const chatId = ctx.chat.id;

        try {
            // Get attachment information from userState if available, otherwise extract from message
            const attachmentIds = userState.attachmentIds || extractFileAttachments(ctx);
            const hasAttachments = userState.hasAttachments ?? (attachmentIds.length > 0);
            
            // Generate smart status message with attachment awareness
            const processingText = generateStatusMessage(ctx, 'ticket-creation');
            
            const statusMsg = await ctx.reply(processingText, { parse_mode: 'Markdown' });

            // Get or create customer for this chat
            const chatTitle = this.getChatTitle(ctx);

            const customer = await unthreadService.getOrCreateCustomer(chatTitle, chatId);
            
            // Get user data - might not have email
            let userData = await unthreadService.getOrCreateUser(userId, ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name);
            
            // Check if we have email from user state (just provided) or stored
            const emailToUse = userState.email || userData.email;
            
            if (!emailToUse) {
                // No email available - this shouldn't happen in normal flow
                // but let's handle it gracefully
                LogEngine.error('Ticket creation attempted without email', {
                    userId,
                    hasUserStateEmail: !!userState.email,
                    hasUserDataEmail: !!userData.email
                });
                
                await ctx.editMessageText(
                    "❌ **Unable to Create Ticket**\n\n" +
                    "Email information is missing. Please try again with `/support`.",
                    { parse_mode: 'Markdown' }
                );
                return false;
            }
            
            // If user provided email during ticket creation, update their unthreadEmail
            if (userState.email) {
                await BotsStore.updateUser(userId, { unthreadEmail: userState.email });
                // Refresh userData to get the updated email
                userData = await unthreadService.getOrCreateUser(userId, ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name);
            }

            // Use unified approach: create ticket with attachments in single API call when attachments exist
            let ticketResponse;
            
            if (hasAttachments) {
                LogEngine.info('Creating ticket with unified attachment approach', {
                    userId,
                    attachmentCount: attachmentIds.length,
                    method: 'unified_buffer_approach'
                });
                
                try {
                    // Update status to show unified processing
                    await ctx.editMessageText(
                        `🎫 **Creating Unified Ticket**\n\n⚡ Creating ticket with ${attachmentIds.length} attachment${attachmentIds.length > 1 ? 's' : ''} in a single operation...`,
                        { parse_mode: 'Markdown' }
                    );
                    
                    // Convert file IDs to buffers for unified processing
                    const attachmentBuffers = await attachmentHandler.convertFileIdsToBuffers(attachmentIds);
                    
                    if (attachmentBuffers.length === 0) {
                        LogEngine.warn('Failed to convert file IDs to buffers, falling back to standard ticket creation', {
                            originalAttachmentCount: attachmentIds.length,
                            userId
                        });
                        
                        // Notify user about attachment processing failure
                        await ctx.editMessageText(
                            `⚠️ **Attachment Processing Issue**\n\n❌ Unable to process ${attachmentIds.length} file attachment${attachmentIds.length > 1 ? 's' : ''} due to technical issues.\n\n🎫 Creating your ticket without attachments...`,
                            { parse_mode: 'Markdown' }
                        );
                        
                        // Fallback to standard ticket creation without attachments
                        ticketResponse = await unthreadService.createTicket({
                            groupChatName: chatTitle,
                            customerId: customer.id,
                            summary: userState.summary,
                            onBehalfOf: {
                                name: userData.name || ctx.from?.first_name || 'Telegram User',
                                email: emailToUse
                            }
                        });
                    } else {
                        // Use unified ticket creation with buffer attachments
                        ticketResponse = await unthreadService.createTicketWithBufferAttachments({
                            groupChatName: chatTitle,
                            customerId: customer.id,
                            summary: userState.summary,
                            onBehalfOf: {
                                name: userData.name || ctx.from?.first_name || 'Telegram User',
                                email: emailToUse
                            },
                            attachments: attachmentBuffers
                        });
                        
                        LogEngine.info('Unified ticket with attachments created successfully', {
                            ticketId: ticketResponse.id,
                            friendlyId: ticketResponse.friendlyId,
                            attachmentCount: attachmentBuffers.length,
                            method: 'unified_buffer_approach'
                        });
                    }
                } catch (unifiedError) {
                    LogEngine.error('Error in unified ticket creation, falling back to standard approach', {
                        error: unifiedError instanceof Error ? unifiedError.message : 'Unknown error',
                        userId,
                        attachmentCount: attachmentIds.length
                    });
                    
                    // Fallback to standard ticket creation
                    ticketResponse = await unthreadService.createTicket({
                        groupChatName: chatTitle,
                        customerId: customer.id,
                        summary: userState.summary,
                        onBehalfOf: {
                            name: userData.name || ctx.from?.first_name || 'Telegram User',
                            email: emailToUse
                        }
                    });
                }
            } else {
                // Standard ticket creation without attachments
                ticketResponse = await unthreadService.createTicket({
                    groupChatName: chatTitle,
                    customerId: customer.id,
                    summary: userState.summary,
                    onBehalfOf: {
                        name: userData.name || ctx.from?.first_name || 'Telegram User',
                        email: emailToUse
                    }
                });
                
                LogEngine.info('Standard ticket created successfully', {
                    ticketId: ticketResponse.id,
                    friendlyId: ticketResponse.friendlyId,
                    method: 'standard_no_attachments'
                });
            }

            LogEngine.info('Ticket creation completed', {
                ticketId: ticketResponse.id,
                friendlyId: ticketResponse.friendlyId,
                hasAttachments: hasAttachments,
                attachmentCount: hasAttachments ? attachmentIds.length : 0
            });

            // Clear user state
            await BotsStore.clearUserState(userId);

            // Fail-fast template system integration - No fallbacks for enterprise users!
            let successMessage: string;
            
            // Pre-flight validation: Ensure template system is operational
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const templates = await templateManager.getGlobalTemplates();
            
            if (!templates.templates.ticket_created) {
                LogEngine.error('Template configuration missing - failing ticket creation message', {
                    ticketId: ticketResponse.id,
                    userId,
                    availableTemplates: Object.keys(templates.templates)
                });
                await ctx.editMessageText(
                    "❌ **System Configuration Error**\n\n" +
                    "Template system configuration is missing. Please contact administrators.\n\n" +
                    "*Message generation failed to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return false;
            }
            
            if (!templates.templates.ticket_created.enabled) {
                LogEngine.error('Template system disabled - failing ticket creation message', {
                    ticketId: ticketResponse.id,
                    userId,
                    templateEnabled: templates.templates.ticket_created.enabled
                });
                await ctx.editMessageText(
                    "❌ **System Configuration Error**\n\n" +
                    "Template system is disabled. Please contact administrators.\n\n" +
                    "*Message generation failed to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return false;
            }
            
            if (!templates.templates.ticket_created.content.trim()) {
                LogEngine.error('Template content empty - failing ticket creation message', {
                    ticketId: ticketResponse.id,
                    userId,
                    templateLength: templates.templates.ticket_created.content.length
                });
                await ctx.editMessageText(
                    "❌ **Template Configuration Error**\n\n" +
                    "Template content is empty. Please contact administrators.\n\n" +
                    "*Message generation failed to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return false;
            }

            // Prepare template data
            const templateData = {
                ticket: {
                    id: ticketResponse.id,
                    friendlyId: ticketResponse.friendlyId,
                    summary: userState.summary
                },
                customer: {
                    name: userData.name || ctx.from?.first_name || 'Unknown User',
                    email: userData.email || userState.email || 'Not provided'
                },
                timestamp: new Date().toISOString()
            };

            // Template system is operational - proceed with rendering (must succeed)
            try {
                successMessage = templates.templates.ticket_created.content
                    .replace(/\{\{ticketId\}\}/g, escapeMarkdown(String(ticketResponse.friendlyId)))
                    .replace(/\{\{summary\}\}/g, templateData.ticket.summary)  // Don't escape - summary is raw text
                    .replace(/\{\{customerName\}\}/g, escapeMarkdown(templateData.customer.name));
            } catch (templateRenderError) {
                LogEngine.error('Template rendering failed - failing ticket creation message', {
                    error: templateRenderError instanceof Error ? templateRenderError.message : 'Unknown error',
                    ticketId: ticketResponse.id,
                    userId,
                    templateContent: templates.templates.ticket_created.content.substring(0, 100)
                });
                await ctx.editMessageText(
                    "❌ **Template Rendering Error**\n\n" +
                    "Failed to process template content. Please contact administrators.\n\n" +
                    "*Message generation failed to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return false;
            }

            try {
                await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });
            } catch (editError) {
                // If editing fails, send a new message instead
                LogEngine.warn('Failed to edit status message, sending new message instead', {
                    error: editError instanceof Error ? editError.message : 'Unknown error',
                    ticketId: ticketResponse.id
                });
                
                await ctx.reply(successMessage, { parse_mode: 'Markdown' });
            }

            // Register ticket confirmation for bidirectional messaging AFTER final success message is displayed
            await unthreadService.registerTicketConfirmation({
                messageId: statusMsg.message_id,
                ticketId: ticketResponse.id,
                friendlyId: ticketResponse.friendlyId,
                customerId: customer.id,
                chatId: chatId,
                telegramUserId: userId,
                summary: userState.summary
            });

            LogEngine.info('Ticket stored for bidirectional messaging after final message display', {
                storedConversationId: ticketResponse.id,
                friendlyId: ticketResponse.friendlyId,
                messageId: statusMsg.message_id,
                chatId: chatId,
                registrationTiming: 'after_template_rendering'
            });

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

    /**
     * Type-safe method to get chat title
     */
    private getChatTitle(ctx: BotContext): string {
        const chat = ctx.chat;
        if (!chat) {
            return 'Unknown Chat';
        }

        // Type guard for group chats that have titles
        if ((chat.type === 'group' || chat.type === 'supergroup') && 'title' in chat) {
            return chat.title || 'Telegram Group';
        }

        // For private chats or channels
        if (chat.type === 'private') {
            return 'Private Chat';
        }

        if (chat.type === 'channel' && 'title' in chat) {
            return chat.title || 'Telegram Channel';
        }

        return 'Telegram Chat';
    }
}



/**
 * DM Setup Input Processor
 * Handles text input during DM-based setup flows (like custom customer names)
 */
export class DmSetupInputProcessor implements IConversationProcessor {
    async canHandle(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        
        // DmSetupInputProcessor ONLY handles private chat messages
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
            
            LogEngine.debug('DmSetupInputProcessor.canHandle evaluation', {
                userId,
                chatType: ctx.chat?.type,
                hasActiveSessions: !!activeSessions,
                currentStep: activeSessions?.currentStep,
                canHandle,
                messageId: ctx.message?.message_id
            });
            
            return canHandle;
        } catch (error) {
            logError(error, 'DmSetupInputProcessor.canHandle', { userId });
            return false;
        }
    }

    async process(ctx: BotContext): Promise<boolean> {
        const userId = ctx.from?.id;
        const inputText = getMessageText(ctx);

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

    private async handleCustomerIdInput(ctx: BotContext, session: DmSetupSession, customerId: string): Promise<boolean> {
        try {
            // First, extend session expiry to prevent timeout during customer validation
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const now = new Date();
            const extendedExpiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
            
            await BotsStore.updateDmSetupSession(session.sessionId, {
                expiresAt: extendedExpiresAt.toISOString()
            });
            
            // Validate customer ID and check existence
            const validation = await this.validateCustomerId(ctx, customerId, session);
            if (!validation.isValid || !validation.customerName) {
                return true; // Error already handled in validation method
            }

            const trimmedCustomerId = customerId.trim();
            const customerName = validation.customerName;

            // Update session with the customer ID
            await BotsStore.updateDmSetupSession(session.sessionId, {
                currentStep: 'customer_link_complete',
                stepData: {
                    ...session.stepData,
                    existingCustomerId: trimmedCustomerId,
                    linkType: 'existing'
                }
            });

            // Complete the setup by creating the group configuration
            try {
                await this.createGroupConfigForCustomer(session, trimmedCustomerId, customerName);

                const successMessage = this.generateSetupSuccessMessage(customerName, trimmedCustomerId, session.groupChatName);

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

    private async handleCustomNameInput(ctx: BotContext, session: DmSetupSession, inputText: string): Promise<boolean> {
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
    private async handleTemplateContentInput(ctx: BotContext, session: DmSetupSession, templateContent: string): Promise<boolean> {
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
                const validVars = ['ticketId', 'summary', 'customerName', 'status', 'response', 'createdAt', 'updatedAt'];
                
                for (const match of variableMatches) {
                    const varName = match.replace(/[{}]/g, '').trim();
                    if (!validVars.includes(varName)) {
                        invalidVars.push(varName);
                    }
                }
                
                if (invalidVars.length > 0) {
                    await ctx.reply(
                        `❌ **Invalid Variables**\n\nThe following variables are not recognized:\n• ${invalidVars.join('\n• ')}\n\n**Valid variables:**\n• ticketId, summary, customerName, status\n• response, createdAt, updatedAt\n\nPlease fix your template:`,
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
                templateType as GlobalTemplateEvent,
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

    /**
     * Validate customer ID format and existence
     */
    private async validateCustomerId(ctx: BotContext, customerId: string, session: DmSetupSession): Promise<{
        isValid: boolean;
        customerName?: string;
        error?: string;
        validationMsg?: any;
    }> {
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
            return { isValid: false, error: 'Invalid format' };
        }

        // Send validation message
        const validationMsg = await ctx.reply("🔍 Validating customer ID with Unthread...", { parse_mode: 'Markdown' });

        // Validate customer exists and get customer details
        const trimmedCustomerId = customerId.trim();
        
        try {
            const { validateCustomerExists } = await import('../../services/unthread.js');
            const validationResult = await validateCustomerExists(trimmedCustomerId);

            if (!validationResult.exists) {
                // Clean up validation message
                try {
                    await ctx.deleteMessage(validationMsg.message_id);
                } catch {
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
                return { isValid: false, error: 'Customer not found' };
            }

            const customerName = validationResult.customer?.name || `Customer ${trimmedCustomerId.substring(0, 8)}...`;
            
            // Clean up validation message and show success
            try {
                await ctx.deleteMessage(validationMsg.message_id);
            } catch {
                // Ignore deletion errors
            }
            
            // Clean up any stale cancel button messages from the session
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const currentSession = await BotsStore.getDmSetupSession(session.sessionId);
            if (currentSession?.messageIds) {
                for (const messageId of currentSession.messageIds) {
                    try {
                        // Try to edit the message to remove buttons
                        if (ctx.chat?.id) {
                            await ctx.telegram.editMessageReplyMarkup(
                                ctx.chat.id,
                                messageId,
                                undefined,
                                { inline_keyboard: [] }
                            );
                        }
                    } catch {
                        // If edit fails, ignore - the message might be too old or already deleted
                    }
                }
                
                // Clear the tracked message IDs since they've been cleaned up
                await BotsStore.updateDmSetupSession(session.sessionId, { 
                    messageIds: [] 
                });
            }
            
            await ctx.reply(`✅ Customer found: **${escapeMarkdown(customerName)}**\n\nLinking to existing customer...`, { parse_mode: 'Markdown' });

            return { isValid: true, customerName, validationMsg };

        } catch (validationError) {
            logError(validationError, 'DmSetupInputProcessor.validateCustomerId', { 
                customerId: trimmedCustomerId,
                sessionId: session.sessionId 
            });
            
            throw new Error(`Customer validation failed: ${(validationError as Error).message}`);
        }
    }

    /**
     * Create group configuration for existing customer
     */
    private async createGroupConfigForCustomer(session: DmSetupSession, customerId: string, customerName: string): Promise<void> {
        const { BotsStore } = await import('../../sdk/bots-brain/index.js');
        
        // Create group configuration for existing customer
        const groupConfig = {
            chatId: session.groupChatId,
            chatTitle: session.groupChatName,
            isConfigured: true,
            customerId: customerId,
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
    }

    /**
     * Generate setup success message for existing customer link
     */
    private generateSetupSuccessMessage(customerName: string, customerId: string, groupName: string): string {
        return `🎉 **Setup Complete!**

**Linked to Existing Customer**
**Customer:** ${customerName}
**Customer ID:** \`${customerId}\`
**Group:** ${groupName}

✅ **What's configured:**
• Group linked to existing customer account
• Support ticket system enabled
• Bot admin permissions verified

📝 **Template Configuration** (Optional)

Choose how you'd like to handle message templates:`;
    }
}
