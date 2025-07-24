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
import type { GlobalTemplate, GlobalTemplateEvent } from '../../config/globalTemplates.js';
import { logError } from '../utils/errorHandler.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import { generateStatusMessage } from '../../utils/messageAnalyzer.js';
import { BotsStore } from '../../sdk/bots-brain/index.js';
import * as unthreadService from '../../services/unthread.js';
import { generateDummyEmail, updateUserEmail } from '../../utils/emailManager.js';
import { escapeMarkdown } from '../../utils/markdownEscape.js';
import { attachmentHandler } from '../../utils/attachmentHandler.js';

// Clean Code: Extract constants to avoid magic strings and numbers
const CALLBACK_CONSTANTS = {
    SESSION: {
        EXPIRY_EXTENSION_MINUTES: 30, // Increased from 15 to 30 minutes for better UX
        MAX_CACHED_MAPPINGS: 100
    },
    TEMPLATE_CODES: {
        TICKET_CREATED: 'tc',
        AGENT_RESPONSE: 'ar',
        TICKET_STATUS: 'ts'
    },
    TEMPLATE_TYPES: {
        tc: 'ticket_created',
        ar: 'agent_response',
        ts: 'ticket_status'
    }
} as const;

/**
 * Support Callback Processor
 * Handles callbacks related to support ticket creation
 */
export class SupportCallbackProcessor implements ICallbackProcessor {
    // Callback ID mapping to handle Telegram's 64-byte limit (following setup pattern)
    private static callbackSessionMap = new Map<string, string>();
    private static callbackIdCounter = 1;

    canHandle(callbackData: string): boolean {
        return callbackData.startsWith('support_');
    }

    /**
     * Generate a short callback ID for long user IDs to work within Telegram's 64-byte limit
     * Following the same pattern as SetupCallbackProcessor
     */
    public static generateShortCallbackId(userId: string): string {
        // Check if we already have a mapping for this user
        for (const [shortId, fullId] of SupportCallbackProcessor.callbackSessionMap.entries()) {
            if (fullId === userId) {
                return shortId;
            }
        }
        
        // Generate new short ID
        const shortId = `cb${SupportCallbackProcessor.callbackIdCounter++}`;
        SupportCallbackProcessor.callbackSessionMap.set(shortId, userId);
        
        // Clean up old mappings (keep only last 100)
        if (SupportCallbackProcessor.callbackSessionMap.size > CALLBACK_CONSTANTS.SESSION.MAX_CACHED_MAPPINGS) {
            const firstKey = SupportCallbackProcessor.callbackSessionMap.keys().next().value;
            if (firstKey) {
                SupportCallbackProcessor.callbackSessionMap.delete(firstKey);
            }
        }
        
        return shortId;
    }
    
    /**
     * Resolve short callback ID back to full user ID
     */
    private static resolveCallbackId(shortId: string): string | undefined {
        return SupportCallbackProcessor.callbackSessionMap.get(shortId);
    }

    async process(ctx: BotContext, callbackData: string): Promise<boolean> {
        try {
            // Handle new short callback patterns for confirmation flow
            if (callbackData.startsWith('support_proceed_')) {
                const parts = callbackData.split('_');
                const shortId = parts[2]; // cb123
                
                if (!shortId) {
                    await ctx.answerCbQuery("❌ Invalid callback format.");
                    return true;
                }
                
                const userId = SupportCallbackProcessor.resolveCallbackId(shortId);
                
                if (!userId || parseInt(userId) !== ctx.from?.id) {
                    await ctx.answerCbQuery("❌ Session expired. Please start again.");
                    return true;
                }
                
                return await this.handleProceedWithSummary(ctx);
            }
            
            if (callbackData.startsWith('support_edit_')) {
                const parts = callbackData.split('_');
                const shortId = parts[2]; // cb123
                
                if (!shortId) {
                    await ctx.answerCbQuery("❌ Invalid callback format.");
                    return true;
                }
                
                const userId = SupportCallbackProcessor.resolveCallbackId(shortId);
                
                if (!userId || parseInt(userId) !== ctx.from?.id) {
                    await ctx.answerCbQuery("❌ Session expired. Please start again.");
                    return true;
                }
                
                return await this.handleEditSummary(ctx);
            }
            
            if (callbackData.startsWith('support_cancel_')) {
                const parts = callbackData.split('_');
                const shortId = parts[2]; // cb123
                
                if (!shortId) {
                    await ctx.answerCbQuery("❌ Invalid callback format.");
                    return true;
                }
                
                const userId = SupportCallbackProcessor.resolveCallbackId(shortId);
                
                if (!userId || parseInt(userId) !== ctx.from?.id) {
                    await ctx.answerCbQuery("❌ Session expired. Please start again.");
                    return true;
                }
                
                return await this.handleCancel(ctx);
            }
            
            // Handle legacy callback patterns
            const action = callbackData.replace('support_', '');
            
            switch (action) {
                case 'continue':
                    return await this.handleContinue(ctx);
                case 'restart':
                    return await this.handleRestart(ctx);
                case 'cancel':
                    return await this.handleCancel(ctx);
                case 'create_new':
                    return await this.handleCreateNew(ctx);
                case 'setup_email':
                    return await this.handleSetupEmail(ctx);
                case 'use_temp':
                    return await this.handleUseTempEmail(ctx);
                case 'upgrade_email':
                    return await this.handleUpgradeEmail(ctx);
                case 'continue_temp':
                    return await this.handleContinueWithTemp(ctx);
                default:
                    return false;
            }
        } catch (error) {
            logError(error, 'SupportCallbackProcessor.process', { 
                callbackData, 
                userId: ctx.from?.id 
            });
            await ctx.answerCbQuery("❌ An error occurred. Please try again.");
            return true;
        }
    }

    private async handleContinue(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("✅ Continuing support form...");
        
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        const userState = await BotsStore.getUserState(userId);
        if (!userState) {
            await ctx.editMessageText(
                "❌ **No Active Session**\n\nNo active support session found. Use `/support` to start a new ticket.",
                { parse_mode: 'Markdown' }
            );
            return true;
        }

        const stepText = userState.field === 'summary' ? 
            "Please describe your issue:" : 
            "Please provide your email address:";

        await ctx.editMessageText(
            `🎫 **Continue Support Ticket**\n\n` +
            `**Step ${userState.step} of ${userState.totalSteps}:** ${stepText}\n\n` +
            "*Type your response below:*",
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    /**
     * Shared logic for initializing support ticket flow
     */
    private async initializeSupportFlow(ctx: BotContext, options: {
        title: string;
        emoji: string;
        stepDescription: string;
    }): Promise<boolean> {
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        // Clear existing state
        await BotsStore.clearUserState(userId);

        // Check if user has email
        const userData = await unthreadService.getOrCreateUser(userId, ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name);
        const hasEmail = userData?.email;

        // Set new state
        await BotsStore.setUserState(userId, {
            field: 'summary',
            step: 1,
            totalSteps: hasEmail ? 1 : 2,
            hasEmail: !!hasEmail,
            chatId: ctx.chat!.id,
            startedAt: new Date().toISOString()
        });

        await ctx.editMessageText(
            `${options.emoji} **${options.title}**\n\n` +
            `**Step 1 of ${hasEmail ? 1 : 2}:** ${options.stepDescription}\n\n` +
            "*Type your message below:*",
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    private async handleRestart(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("🔄 Restarting support form...");
        
        return await this.initializeSupportFlow(ctx, {
            title: "Support Ticket Restarted",
            emoji: "🔄",
            stepDescription: "Please describe your issue."
        });
    }

    private async handleCancel(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("❌ Support form cancelled");
        
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        // Clear user state
        await BotsStore.clearUserState(userId);

        await ctx.editMessageText(
            `❌ **Support Ticket Cancelled**\n\n` +
            "Your support ticket creation has been cancelled. No ticket was created.\n\n" +
            "Use `/support` anytime to create a new support ticket.",
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    private async handleCreateNew(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("🎫 Creating new ticket...");
        
        return await this.initializeSupportFlow(ctx, {
            title: "Create New Support Ticket",
            emoji: "🎫",
            stepDescription: "Please describe your issue or question."
        });
    }

    /**
     * Handles email setup callback for first-time users
     */
    private async handleSetupEmail(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("📧 Setting up email...");
        
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        // Set state for email collection
        await BotsStore.setUserState(userId, {
            field: 'email_setup',
            step: 1,
            totalSteps: 2,
            hasEmail: false,
            chatId: ctx.chat?.id || 0,
            startedAt: new Date().toISOString()
        });

        await ctx.editMessageText(
            "📧 **Email Address Setup**\n\n" +
            "Please provide your email address. Our support team will use this to contact you directly about your tickets.\n\n" +
            "**Benefits of setting a real email:**\n" +
            "• Direct communication with support agents\n" +
            "• Ticket updates and notifications\n" +
            "• Better support experience\n\n" +
            "*Please reply with your email address.*",
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Handles temporary email setup for users who want to skip email
     */
    private async handleUseTempEmail(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("⚡ Using temporary email...");
        
        const userId = ctx.from?.id;
        const username = ctx.from?.username;
        if (!userId) {return false;}

        try {
            const userState = await BotsStore.getUserState(userId);
            if (!userState || !userState.summary) {
                await ctx.editMessageText(
                    "❌ **No Summary Found**\n\nPlease start over with `/support`.",
                    { parse_mode: 'Markdown' }
                );
                return true;
            }

            // Generate and save dummy email
            const dummyEmail = generateDummyEmail(userId, username);
            await updateUserEmail(userId, dummyEmail, true);

            // Update state with dummy email and create ticket immediately
            const updatedState = {
                ...userState,
                email: dummyEmail,
                field: 'completed'
            };

            await BotsStore.setUserState(userId, updatedState);

            await ctx.editMessageText(
                "⚡ **Quick Setup Complete!**\n\n" +
                "✅ **Temporary email configured for ticket creation**\n\n" +
                "🎫 **Creating your support ticket...**",
                { parse_mode: 'Markdown' }
            );

            // Log the action before creating ticket
            LogEngine.info('User selected temporary email for support', { userId, dummyEmail });

            // Create the ticket directly
            return await this.createTicketDirectly(ctx, updatedState);

        } catch (error) {
            LogEngine.error('Error setting up temporary email', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            
            await ctx.editMessageText(
                "❌ **Error setting up temporary email**\n\nPlease try again or contact an administrator.",
                { parse_mode: 'Markdown' }
            );
            return true;
        }
    }

    /**
     * Handles email upgrade for users with dummy emails
     */
    private async handleUpgradeEmail(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("📧 Upgrading to real email...");
        
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        await BotsStore.setUserState(userId, {
            field: 'email_upgrade',
            step: 1,
            totalSteps: 2,
            hasEmail: false,
            chatId: ctx.chat?.id || 0,
            startedAt: new Date().toISOString()
        });

        await ctx.editMessageText(
            "📧 **Upgrade to Real Email**\n\n" +
            "Great choice! Please provide your email address for better communication with our support team.\n\n" +
            "**What you'll get:**\n" +
            "• Direct email updates about your tickets\n" +
            "• Faster response times\n" +
            "• Better support experience\n\n" +
            "*Please reply with your email address.*",
            { parse_mode: 'Markdown' }
        );

        return true;
    }

    /**
     * Handles continuing with temporary email
     */
    private async handleContinueWithTemp(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("▶️ Continuing with temporary email...");
        
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        // Start ticket creation flow
        await BotsStore.setUserState(userId, {
            field: 'summary',
            step: 1,
            totalSteps: 1,
            hasEmail: true,
            chatId: ctx.chat?.id || 0,
            startedAt: new Date().toISOString()
        });

        await ctx.editMessageText(
            "🎫 **Create Support Ticket**\n\n" +
            "I'll create your ticket using your current temporary email. You can upgrade to a real email anytime using `/setemail`.\n\n" +
            "**Please describe your issue or question:**\n\n" +
            "*Reply with a detailed description of your issue.*",
            { parse_mode: 'Markdown' }
        );

        LogEngine.info('User continued with temporary email', { userId });
        return true;
    }

    /**
     * Handle proceeding with the current summary (Phase 4: Confirmation Flow)
     */
    private async handleProceedWithSummary(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("✅ Processing your request...");
        
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        try {
            const userState = await BotsStore.getUserState(userId);
            if (!userState || !userState.summary) {
                await ctx.editMessageText(
                    "❌ **No Summary Found**\n\nPlease start over with `/support`.",
                    { parse_mode: 'Markdown' }
                );
                return true;
            }

            // Check if user has email - ONLY prompt first-time users
            const { getUserEmailPreferences } = await import('../../utils/emailManager.js');
            const emailPrefs = await getUserEmailPreferences(userId);
            
            if (!emailPrefs || !emailPrefs.email) {
                // FIRST-TIME USER: Show email setup choice (this is what you wanted!)
                await BotsStore.setUserState(userId, {
                    ...userState,
                    field: 'email_setup',
                    step: 2,
                    preservedSummary: userState.summary  // CRITICAL: Preserve the summary!
                });

                const shortId = SupportCallbackProcessor.generateShortCallbackId(userId.toString());

                await ctx.editMessageText(
                    "📧 **Email Setup Required**\n\n" +
                    "To create your support ticket, we need your email address for updates and communication.\n\n" +
                    "**Benefits:**\n" +
                    "• Direct communication with support agents\n" +
                    "• Ticket status updates and notifications\n" +
                    "• Better support experience\n\n" +
                    "What would you like to do?",
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "📧 Set Up Email", callback_data: "support_setup_email" }
                                ],
                                [
                                    { text: "⚡ Skip (Use Temporary)", callback_data: "support_use_temp" }
                                ],
                                [
                                    { text: "❌ Cancel", callback_data: `support_cancel_${shortId}` }
                                ]
                            ]
                        }
                    }
                );
                return true;
            }

            // RETURNING USER: Has email - proceed directly to ticket creation (no prompt!)
            const updatedState = {
                ...userState,
                email: emailPrefs.email,
                field: 'completed'
            };
            
            await BotsStore.setUserState(userId, updatedState);
            return await this.createTicketDirectly(ctx, updatedState);
            
        } catch (error) {
            logError(error, 'SupportCallbackProcessor.handleProceedWithSummary', { userId });
            await ctx.editMessageText(
                "❌ **Error Processing Request**\n\nSomething went wrong. Please try again or contact support.",
                { parse_mode: 'Markdown' }
            );
            return true;
        }
    }

    /**
     * Create ticket directly when processor can't handle
     */
    private async createTicketDirectly(ctx: BotContext, userState: any): Promise<boolean> {
        try {
            const userId = ctx.from?.id;
            if (!userId) {return false;}

            // Check if we have email - should always have it at this point
            if (!userState.email) {
                LogEngine.error('createTicketDirectly called without email', { userId });
                await ctx.editMessageText(
                    "❌ **Unable to Create Ticket**\n\n" +
                    "Email information is missing. Please try again with `/support`.",
                    { parse_mode: 'Markdown' }
                );
                return false;
            }

            // Detect file attachments from stored user state (not from callback message)
            const attachmentIds = userState.attachmentIds || [];
            const hasAttachments = userState.hasAttachments || false;

            // Generate smart status message with attachment awareness
            const processingText = generateStatusMessage(ctx, 'ticket-creation');

            await ctx.editMessageText(processingText, { parse_mode: 'Markdown' });

            // Get user data using the unified function for consistent naming
            const userData = await unthreadService.getOrCreateUser(userId, ctx.from?.username, ctx.from?.first_name, ctx.from?.last_name);
            
            // Prepare the OnBehalfOfUser parameter with the user's email
            const onBehalfOf = {
                name: userData.name,
                email: userState.email // Must exist at this point
            };

            // Use unified approach: create ticket with attachments in single API call when attachments exist
            let ticketResponse;
            
            if (hasAttachments) {
                LogEngine.info('Creating ticket with unified attachment approach via callback', {
                    userId,
                    attachmentCount: attachmentIds.length,
                    method: 'callback_unified_buffer_approach'
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
                        LogEngine.warn('Failed to convert file IDs to buffers via callback, falling back to standard ticket creation', {
                            originalAttachmentCount: attachmentIds.length,
                            userId
                        });
                        
                        // Notify user about attachment processing failure
                        await ctx.editMessageText(
                            `⚠️ **Attachment Processing Issue**\n\n` +
                            `We encountered an issue processing your ${attachmentIds.length} attachment${attachmentIds.length > 1 ? 's' : ''}. ` +
                            `Your ticket will be created without the attachments.\n\n` +
                            `You can attach files later by replying to the ticket confirmation message.\n\n` +
                            `🎫 Creating your ticket now...`,
                            { parse_mode: 'Markdown' }
                        );
                        
                        // Brief delay to let user read the notification
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // Fallback to standard ticket creation without attachments
                        ticketResponse = await unthreadService.createTicket({
                            groupChatName: 'Telegram Support', // Default group chat name
                            customerId: process.env.UNTHREAD_CUSTOMER_ID!,
                            summary: userState.summary,
                            onBehalfOf
                        });
                    } else {
                        // Use unified ticket creation with buffer attachments
                        ticketResponse = await unthreadService.createTicketWithBufferAttachments({
                            groupChatName: 'Telegram Support', // Default group chat name
                            customerId: process.env.UNTHREAD_CUSTOMER_ID!,
                            summary: userState.summary,
                            onBehalfOf,
                            attachments: attachmentBuffers
                        });
                        
                        LogEngine.info('Unified ticket with attachments created successfully via callback', {
                            ticketId: ticketResponse.id,
                            friendlyId: ticketResponse.friendlyId,
                            attachmentCount: attachmentBuffers.length,
                            method: 'callback_unified_buffer_approach'
                        });
                    }
                } catch (unifiedError) {
                    LogEngine.error('Error in unified ticket creation via callback, falling back to standard approach', {
                        error: unifiedError instanceof Error ? unifiedError.message : 'Unknown error',
                        userId,
                        attachmentCount: attachmentIds.length
                    });
                    
                    // Fallback to standard ticket creation
                    ticketResponse = await unthreadService.createTicket({
                        groupChatName: 'Telegram Support', // Default group chat name
                        customerId: process.env.UNTHREAD_CUSTOMER_ID!,
                        summary: userState.summary,
                        onBehalfOf
                    });
                }
            } else {
                // Standard ticket creation without attachments
                ticketResponse = await unthreadService.createTicket({
                    groupChatName: 'Telegram Support', // Default group chat name
                    customerId: process.env.UNTHREAD_CUSTOMER_ID!,
                    summary: userState.summary,
                    onBehalfOf
                });
                
                LogEngine.info('Standard ticket created successfully via callback', {
                    ticketId: ticketResponse.id,
                    friendlyId: ticketResponse.friendlyId,
                    method: 'callback_standard_no_attachments'
                });
            }

            LogEngine.info('Ticket creation completed via callback', {
                ticketId: ticketResponse.id,
                friendlyId: ticketResponse.friendlyId,
                hasAttachments: hasAttachments,
                attachmentCount: hasAttachments ? attachmentIds.length : 0,
                attachmentIds: hasAttachments ? attachmentIds : [],
                method: 'callback_createTicketDirectly'
            });

            // The response is just { id, friendlyId }
            const ticket = ticketResponse;
            
            // Register ticket confirmation for bidirectional messaging
            await unthreadService.registerTicketConfirmation({
                messageId: ctx.callbackQuery?.message?.message_id || 0, // Use callback message ID
                ticketId: ticket.id,
                friendlyId: ticket.friendlyId,
                customerId: process.env.UNTHREAD_CUSTOMER_ID!,
                chatId: ctx.chat?.id || 0,
                telegramUserId: userId,
                summary: userState.summary
            });

            LogEngine.info('Ticket registered for bidirectional messaging via callback', {
                storedConversationId: ticket.id,
                friendlyId: ticket.friendlyId,
                messageId: ctx.callbackQuery?.message?.message_id,
                chatId: ctx.chat?.id,
                method: 'callback_createTicketDirectly'
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
                LogEngine.error('Template configuration missing - failing ticket creation', {
                    ticketId: ticket.id,
                    userId,
                    availableTemplates: Object.keys(templates.templates)
                });
                await ctx.editMessageText(
                    "❌ **System Configuration Error**\n\n" +
                    "Template system configuration is missing. Please contact administrators.\n\n" +
                    "*Ticket creation halted to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return true;
            }
            
            if (!templates.templates.ticket_created.enabled) {
                LogEngine.error('Template system disabled - failing ticket creation', {
                    ticketId: ticket.id,
                    userId,
                    templateEnabled: templates.templates.ticket_created.enabled
                });
                await ctx.editMessageText(
                    "❌ **System Configuration Error**\n\n" +
                    "Template system is disabled. Please contact administrators.\n\n" +
                    "*Ticket creation halted to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return true;
            }
            
            if (!templates.templates.ticket_created.content.trim()) {
                LogEngine.error('Template content empty - failing ticket creation', {
                    ticketId: ticket.id,
                    userId,
                    templateLength: templates.templates.ticket_created.content.length
                });
                await ctx.editMessageText(
                    "❌ **Template Configuration Error**\n\n" +
                    "Template content is empty. Please contact administrators.\n\n" +
                    "*Ticket creation halted to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return true;
            }

            // Prepare template data
            const templateData = {
                ticket: {
                    id: ticket.id,
                    friendlyId: ticket.friendlyId,
                    summary: userState.summary
                },
                customer: {
                    name: ctx.from?.first_name || ctx.from?.username || `User ${userId}`,
                    email: userState.email || 'Not provided'
                },
                timestamp: new Date().toISOString()
            };

            // Template system is operational - proceed with rendering (must succeed)
            try {
                successMessage = templates.templates.ticket_created.content
                    .replace(/\{\{ticketNumber\}\}/g, escapeMarkdown(String(ticket.friendlyId)))
                    .replace(/\{\{friendlyId\}\}/g, escapeMarkdown(String(ticket.friendlyId)))
                    .replace(/\{\{ticketId\}\}/g, escapeMarkdown(String(ticket.friendlyId))) // Legacy support
                    .replace(/\{\{summary\}\}/g, templateData.ticket.summary)  // Don't escape - summary is raw text
                    .replace(/\{\{customerName\}\}/g, escapeMarkdown(templateData.customer.name));
            } catch (templateRenderError) {
                LogEngine.error('Template rendering failed - failing ticket creation', {
                    error: templateRenderError instanceof Error ? templateRenderError.message : 'Unknown error',
                    ticketId: ticket.id,
                    userId,
                    templateContent: templates.templates.ticket_created.content.substring(0, 100)
                });
                await ctx.editMessageText(
                    "❌ **Template Rendering Error**\n\n" +
                    "Failed to process template content. Please contact administrators.\n\n" +
                    "*Ticket creation halted to maintain consistency.*",
                    { parse_mode: 'Markdown' }
                );
                return true;
            }

            await ctx.editMessageText(successMessage, { parse_mode: 'Markdown' });
            
            LogEngine.info('Support ticket created successfully via callback', {
                ticketId: ticket.id,
                friendlyId: ticket.friendlyId,
                userId,
                method: 'callback_proceed'
            });
            
            return true;
        } catch (error) {
            logError(error, 'SupportCallbackProcessor.createTicketDirectly', { userId: ctx.from?.id });
            await ctx.editMessageText(
                "❌ **Error Creating Ticket**\n\nSomething went wrong. Please try again or contact support.",
                { parse_mode: 'Markdown' }
            );
            return true;
        }
    }

    /**
     * Handle editing the summary (Phase 4: Confirmation Flow)
     */
    private async handleEditSummary(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("✏️ Edit your summary...");
        
        const userId = ctx.from?.id;
        if (!userId) {return false;}

        try {
            const userState = await BotsStore.getUserState(userId);
            if (!userState) {
                await ctx.editMessageText(
                    "❌ **No Active Session**\n\nPlease start over with `/support`.",
                    { parse_mode: 'Markdown' }
                );
                return true;
            }

            // Reset to summary input state
            await BotsStore.setUserState(userId, {
                ...userState,
                field: 'summary',
                step: 1,
                isEditing: true
            });

            await ctx.editMessageText(
                "✏️ **Edit Your Summary**\n\n" +
                "Please provide an updated description of your issue:\n\n" +
                "*Type your new summary below:*",
                { parse_mode: 'Markdown' }
            );

            return true;
        } catch (error) {
            logError(error, 'SupportCallbackProcessor.handleEditSummary', { userId });
            await ctx.editMessageText(
                "❌ **Error**\n\nSomething went wrong. Please try again.",
                { parse_mode: 'Markdown' }
            );
            return true;
        }
    }
}

/**
 * Setup Callback Processor
 * Handles callbacks related to DM-based group setup flow
 */
export class SetupCallbackProcessor implements ICallbackProcessor {
    // Callback ID mapping to handle Telegram's 64-byte limit
    private static callbackSessionMap = new Map<string, string>();
    private static callbackIdCounter = 1;

    canHandle(callbackData: string): boolean {
        // Only handle setup-related and session-based template editing (during setup flow)
        // Standalone template editing (from /templates command) should be handled by TemplateCallbackProcessor
        return callbackData.startsWith('setup_') || 
               callbackData.startsWith('dmsetup_') || 
               (callbackData.startsWith('template_edit_') && this.isSessionBasedTemplateEdit(callbackData)) ||
               (callbackData.startsWith('template_start_edit_') && this.isSessionBasedTemplateEdit(callbackData)) ||
               (callbackData.startsWith('template_cancel_edit_') && this.isSessionBasedTemplateEdit(callbackData));
    }

    /**
     * Check if template edit callback is session-based (has session ID) vs standalone
     */
    private isSessionBasedTemplateEdit(callbackData: string): boolean {
        // Session-based template edits have session IDs in their callback data
        // Format: template_edit_tc_cb123 or template_start_edit_tc_cb123
        const parts = callbackData.split('_');
        
        // Check if the callback has a session identifier (cb123 format or setup_chatId_timestamp format)
        if (parts.length >= 4) {
            const lastPart = parts[parts.length - 1];
            return lastPart !== undefined && (lastPart.startsWith('cb') || lastPart.startsWith('setup'));
        }
        
        return false;
    }

    // Helper function to convert template types to short codes for callback data
    private getTemplateShortCode(templateType: string): string {
        // Clean Code: Use constants instead of magic strings
        return CALLBACK_CONSTANTS.TEMPLATE_CODES[templateType as keyof typeof CALLBACK_CONSTANTS.TEMPLATE_CODES] || templateType;
    }

    // Helper function to convert short codes back to template types
    private getTemplateTypeFromCode(shortCode: string): string | undefined {
        return CALLBACK_CONSTANTS.TEMPLATE_TYPES[shortCode as keyof typeof CALLBACK_CONSTANTS.TEMPLATE_TYPES];
    }

    /**
     * Generate a short callback ID for long session IDs to work within Telegram's 64-byte limit
     */
    public static generateShortCallbackId(sessionId: string): string {
        // Check if we already have a mapping for this session
        for (const [shortId, fullId] of SetupCallbackProcessor.callbackSessionMap.entries()) {
            if (fullId === sessionId) {
                return shortId;
            }
        }
        
        // Generate new short ID
        const shortId = `cb${SetupCallbackProcessor.callbackIdCounter++}`;
        SetupCallbackProcessor.callbackSessionMap.set(shortId, sessionId);
        
        // Clean up old mappings (keep only last 100)
        if (SetupCallbackProcessor.callbackSessionMap.size > CALLBACK_CONSTANTS.SESSION.MAX_CACHED_MAPPINGS) {
            const firstKey = SetupCallbackProcessor.callbackSessionMap.keys().next().value;
            if (firstKey) {
                SetupCallbackProcessor.callbackSessionMap.delete(firstKey);
            }
        }
        
        return shortId;
    }
    
    /**
     * Resolve short callback ID back to full session ID
     */
    private static resolveCallbackId(shortId: string): string | undefined {
        return SetupCallbackProcessor.callbackSessionMap.get(shortId);
    }

    /**
     * Extract session ID from callback data parts based on action type
     */
    private extractSessionId(action: string, parts: string[]): string {
        if (action === 'existing' && parts[2] === 'customer') {
            // Format: setup_existing_customer_setup_chatId_timestamp
            return parts.slice(3).join('_');
        } else if (action === 'customize' && parts[2] === 'templates') {
            // Format: setup_customize_templates_[shortId OR setup_chatId_timestamp]
            return parts.slice(3).join('_');
        } else if (action === 'use' && parts[2] === 'defaults') {
            // Format: setup_use_defaults_[shortId OR setup_chatId_timestamp]
            return parts.slice(3).join('_');
        } else if (action === 'use' && parts[2] === 'suggested') {
            // Format: setup_use_suggested_[sessionId]
            return parts.slice(3).join('_');
        } else if (action === 'template' && parts[2] === 'info') {
            // Format: setup_template_info_[shortId OR setup_chatId_timestamp]
            return parts.slice(3).join('_');
        } else if (action === 'back' && parts[2] === 'to' && parts[3] === 'completion') {
            // Format: setup_back_to_completion_[shortId OR setup_chatId_timestamp]
            return parts.slice(4).join('_');
        } else if (action === 'back' && parts[2] === 'to' && parts[3] === 'customer' && parts[4] === 'selection') {
            // Format: setup_back_to_customer_selection_[sessionId]
            return parts.slice(5).join('_');
        } else if (action === 'finish' && parts[2] === 'custom') {
            // Format: setup_finish_custom_[shortId OR setup_chatId_timestamp]
            return parts.slice(3).join('_');
        } else {
            // Standard format: session ID is the last part
            return parts[parts.length - 1] || '';
        }
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
                const shortCallbackId = parts[3]; // Short callback ID
                
                // Ensure we have the shortCallbackId
                if (!shortCallbackId) {
                    await ctx.answerCbQuery("❌ Invalid callback format.");
                    return true;
                }
                
                // Resolve short callback ID to full session ID
                const sessionId = SetupCallbackProcessor.resolveCallbackId(shortCallbackId);
                if (!sessionId) {
                    await ctx.answerCbQuery("❌ Session expired. Please start setup again.");
                    return true;
                }
                
                // Clean Code: Use helper method instead of duplicated mapping
                const templateType = shortCode ? this.getTemplateTypeFromCode(shortCode) : undefined;
                if (!templateType) {
                    await ctx.answerCbQuery("❌ Invalid template edit request.");
                    return true;
                }
                
                return await this.handleTemplateEdit(ctx, sessionId, templateType);
            }
            
            // Handle template_start_edit_ prefixed callbacks (shortened)
            if (callbackData.startsWith('template_start_edit_')) {
                const parts = callbackData.split('_');
                // Format: template_start_edit_shortCode_shortCallbackId
                const shortCode = parts[3]; // tc, ar, or ts  
                const shortCallbackId = parts[4]; // Short callback ID
                
                // Ensure we have the shortCallbackId
                if (!shortCallbackId) {
                    await ctx.answerCbQuery("❌ Invalid callback format.");
                    return true;
                }
                
                // Resolve short callback ID to full session ID
                const sessionId = SetupCallbackProcessor.resolveCallbackId(shortCallbackId);
                if (!sessionId) {
                    await ctx.answerCbQuery("❌ Session expired. Please start setup again.");
                    return true;
                }
                
                // Clean Code: Use helper method instead of duplicated mapping  
                const templateType = shortCode ? this.getTemplateTypeFromCode(shortCode) : undefined;
                if (!templateType) {
                    await ctx.answerCbQuery("❌ Invalid template edit request.");
                    return true;
                }
                
                return await this.handleTemplateStartEdit(ctx, sessionId, templateType);
            }
            
            // Handle template_cancel_edit_ prefixed callbacks (shortened)
            if (callbackData.startsWith('template_cancel_edit_')) {
                const parts = callbackData.split('_');
                // Format: template_cancel_edit_shortCode_shortCallbackId
                const shortCode = parts[3]; // tc, ar, or ts
                const shortCallbackId = parts[4]; // Short callback ID
                
                // Ensure we have the shortCallbackId
                if (!shortCallbackId) {
                    await ctx.answerCbQuery("❌ Invalid callback format.");
                    return true;
                }
                
                // Resolve short callback ID to full session ID
                const sessionId = SetupCallbackProcessor.resolveCallbackId(shortCallbackId);
                if (!sessionId) {
                    await ctx.answerCbQuery("❌ Session expired. Please start setup again.");
                    return true;
                }
                
                // Clean Code: Use helper method instead of duplicated mapping
                const templateType = shortCode ? this.getTemplateTypeFromCode(shortCode) : undefined;
                if (!templateType) {
                    await ctx.answerCbQuery("❌ Invalid template cancel request.");
                    return true;
                }
                
                return await this.handleTemplateCancelEdit(ctx, sessionId, templateType);
            }
            
            // Handle setup_ prefixed callbacks
            const parts = callbackData.split('_');
            const action = parts[1] || '';
            
            // Extract session ID using dedicated method
            const rawSessionId = this.extractSessionId(action, parts);
            
            // Check if this is a short callback ID (starts with 'cb') that needs resolution
            let sessionId: string;
            if (rawSessionId.startsWith('cb') && /^cb\d+$/.test(rawSessionId)) {
                sessionId = SetupCallbackProcessor.resolveCallbackId(rawSessionId) || '';
                if (!sessionId) {
                    await ctx.answerCbQuery("❌ Session expired. Please start setup again.");
                    return true;
                }
            } else {
                sessionId = rawSessionId;
            }
            
            // Session ID resolution complete - ready for processing
            
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
                    } else if (parts[2] === 'to' && parts[3] === 'customer' && parts[4] === 'selection') {
                        return await this.handleBackToCustomerSelection(ctx, sessionId);
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
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session not found. Please start over with `/setup` in the group.");
                return true;
            }
            
            if (!session.stepData?.suggestedName) {
                await ctx.editMessageText("❌ Setup session missing customer name. Please start over with `/setup` in the group.");
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
        
        // First, extend session expiry before any operations to prevent expiration
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            
            // Get current session and extend expiry immediately
            const currentSession = await BotsStore.getDmSetupSession(sessionId);
            if (!currentSession) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }
            
            // Extend session expiry to 30 minutes from now
            const now = new Date();
            const extendedExpiresAt = new Date(now.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            
            const _updateResult = await BotsStore.updateDmSetupSession(sessionId, {
                expiresAt: extendedExpiresAt.toISOString(),
                currentStep: 'awaiting_custom_name'
            });
            
            // Verify the update with multiple attempts if needed
            let verifySession = await BotsStore.getDmSetupSession(sessionId);
            let attemptCount = 1;
            
            // Retry verification up to 3 times if step update failed
            while (verifySession?.currentStep !== 'awaiting_custom_name' && attemptCount <= 3) {
                // Wait 100ms and retry
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Try updating again
                await BotsStore.updateDmSetupSession(sessionId, {
                    currentStep: 'awaiting_custom_name'
                });
                
                verifySession = await BotsStore.getDmSetupSession(sessionId);
                attemptCount++;
            }
            
            if (verifySession?.currentStep !== 'awaiting_custom_name') {
                logError(`Critical: Session step update failed after retries`, 'Error', {
                    sessionId,
                    finalStep: verifySession?.currentStep,
                    expectedStep: 'awaiting_custom_name'
                });
            }
            
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleCustomName.sessionUpdate', { sessionId });
        }
        
        // Generate short callback IDs to stay within Telegram's 64-byte limit
        const shortBackId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
        const shortCancelId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
        
        await ctx.editMessageText(
            `✏️ **Custom Customer Name**

Please type the customer name you'd like to use:

*(Type your customer name and I'll set it up)*`,
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

    private async handleExistingCustomer(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("🔗 Link existing customer...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            
            // Get current session and extend expiry immediately
            const session = await BotsStore.getDmSetupSession(sessionId);
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }
            
            // Extend session expiry to 30 minutes from now
            const now = new Date();
            const extendedExpiresAt = new Date(now.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            
            // Update session to expect customer ID input and extend expiry
            await BotsStore.updateDmSetupSession(sessionId, {
                currentStep: 'awaiting_customer_id',
                expiresAt: extendedExpiresAt.toISOString()
            });
            
            // Generate short callback IDs to stay within Telegram's 64-byte limit
            const shortBackId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
            const shortCancelId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
            
            const customerIdMsg = await ctx.editMessageText(
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

            // Track this message for cleanup when input is successful
            const messageIds = session.messageIds || [];
            if (customerIdMsg && typeof customerIdMsg === 'object' && 'message_id' in customerIdMsg) {
                messageIds.push(customerIdMsg.message_id);
                await BotsStore.updateDmSetupSession(sessionId, { messageIds });
            }
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleExistingCustomer', { sessionId });
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

    /**
     * Create a new customer via Unthread API and store locally
     */
    private async createNewCustomer(customerName: string, session: DmSetupSession, sessionId: string): Promise<{customerId: string, finalCustomerName: string}> {
        if (!customerName) {
            throw new Error('Customer name is required for new customer creation');
        }
        
        try {
            // Import and use the proper Unthread service to create customer
            const { createCustomerWithName } = await import('../../services/unthread.js');
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const createdCustomer = await createCustomerWithName(customerName);
            
            const customerId = createdCustomer.id; // Use the real UUID from Unthread
            const finalCustomerName = createdCustomer.name || customerName;
            
            // Create customer record in local storage
            const customerData = {
                id: customerId,
                unthreadCustomerId: customerId,
                telegramChatId: session.groupChatId,
                chatId: session.groupChatId,
                chatTitle: session.groupChatName,
                customerName: finalCustomerName,
                name: finalCustomerName,
                company: finalCustomerName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await BotsStore.storeCustomer(customerData);
            
            return { customerId, finalCustomerName };
            
        } catch (apiError) {
            logError(apiError, 'CallbackProcessors.createNewCustomer', { 
                customerName,
                sessionId 
            });
            
            // Fail fast - do not generate fake data
            throw new Error(`Failed to create customer via Unthread API: ${(apiError as Error).message}`);
        }
    }

    /**
     * Link to existing customer and validate
     */
    private async linkExistingCustomer(existingCustomerId: string): Promise<{customerId: string, finalCustomerName: string}> {
        try {
            // Import and use validateCustomerExists to get the actual customer name
            const { validateCustomerExists } = await import('../../services/unthread.js');
            const validationResult = await validateCustomerExists(existingCustomerId);
            
            if (validationResult.exists && validationResult.customer?.name) {
                return {
                    customerId: existingCustomerId,
                    finalCustomerName: validationResult.customer.name
                };
            } else {
                // Fail fast - don't generate fake names
                throw new Error(`Customer validation failed: Customer ID ${existingCustomerId} not found or has no name`);
            }
        } catch (error) {
            logError(error, 'CallbackProcessors.linkExistingCustomer', { existingCustomerId });
            // Fail fast - don't generate fake names
            throw new Error(`Customer validation failed: ${(error as Error).message}`);
        }
    }

    /**
     * Create group configuration
     */
    private async createGroupConfiguration(
        session: DmSetupSession, 
        customerId: string, 
        finalCustomerName: string, 
        sessionId: string, 
        isExistingCustomer: boolean
    ): Promise<void> {
        const { BotsStore } = await import('../../sdk/bots-brain/index.js');
        
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
    }

    /**
     * Send completion message with template options
     */
    private async sendCompletionMessage(
        ctx: BotContext, 
        sessionId: string, 
        session: DmSetupSession, 
        customerId: string, 
        finalCustomerName: string, 
        isExistingCustomer: boolean
    ): Promise<void> {
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

        // Generate short callback ID for this session
        const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId);

        try {
            await ctx.editMessageText(successMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Finish Setup", callback_data: `setup_use_defaults_${shortId}` },
                            { text: "🎨 Customize Templates", callback_data: `setup_customize_templates_${shortId}` }
                        ]
                    ]
                }
            });
        } catch (_editError) {
            // Note: _editError is intentionally unused - we handle all edit failures the same way
            // If edit fails (e.g., message too old or from text input), send a new message
            await ctx.reply(successMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Finish Setup", callback_data: `setup_use_defaults_${shortId}` },
                            { text: "🎨 Customize Templates", callback_data: `setup_customize_templates_${shortId}` }
                        ]
                    ]
                }
            });
        }
    }

    public async completeCustomerSetup(ctx: BotContext, sessionId: string, customerName: string | null, session: DmSetupSession, existingCustomerId?: string): Promise<void> {
        try {
            let customerId: string;
            let finalCustomerName: string;
            let isExistingCustomer = false;

            // Step 1: Handle customer creation or linking
            if (existingCustomerId) {
                // Link to existing customer
                isExistingCustomer = true;
                const result = await this.linkExistingCustomer(existingCustomerId);
                customerId = result.customerId;
                finalCustomerName = result.finalCustomerName;
            } else {
                // Create new customer
                const result = await this.createNewCustomer(customerName || '', session, sessionId);
                customerId = result.customerId;
                finalCustomerName = result.finalCustomerName;
            }

            // Step 2: Create group configuration
            await this.createGroupConfiguration(session, customerId, finalCustomerName, sessionId, isExistingCustomer);

            // Step 3: Send completion message
            await this.sendCompletionMessage(ctx, sessionId, session, customerId, finalCustomerName, isExistingCustomer);

        } catch (error) {
            logError(error, 'SetupCallbackProcessor.completeCustomerSetup', { sessionId, customerName, existingCustomerId });
            
            try {
                await ctx.editMessageText(`❌ **Setup Failed**

Failed to complete customer setup. Please try again.`);
            } catch (_editError) {
                // If edit fails, send a new message
                await ctx.reply(`❌ **Setup Failed**

Failed to complete customer setup. Please try again.`);
            }
        }
    }

    /**
     * Handle using default templates during setup
     */
    private async handleUseDefaultTemplates(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("✅ Finishing setup with default templates...");
        
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
                LogEngine.warn('Session not found during template customization', { 
                    sessionId,
                    userId: ctx.from?.id,
                    context: 'handleCustomizeTemplates'
                });
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            LogEngine.info('Session found for template customization', { 
                sessionId, 
                currentExpiresAt: session.expiresAt,
                currentStep: session.currentStep,
                userId: ctx.from?.id
            });

            // Extend session expiration to give user more time for template customization
            const now = new Date();
            const currentExpiry = new Date(session.expiresAt);
            
            // Extend to 15 minutes from now, or add 15 minutes to current expiry, whichever is later
            const newExpiryFromNow = new Date(now.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            const newExpiryFromCurrent = new Date(currentExpiry.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            const extendedExpiresAt = newExpiryFromNow > newExpiryFromCurrent ? newExpiryFromNow : newExpiryFromCurrent;
            
            LogEngine.info('Extending session expiration for template customization', { 
                sessionId, 
                currentTime: now.toISOString(),
                currentExpiry: session.expiresAt, 
                newExpiryFromNow: newExpiryFromNow.toISOString(),
                newExpiryFromCurrent: newExpiryFromCurrent.toISOString(),
                finalExpiry: extendedExpiresAt.toISOString(),
                extensionMinutes: CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES
            });
            
            const updateResult = await BotsStore.updateDmSetupSession(sessionId, {
                expiresAt: extendedExpiresAt.toISOString()
            });

            LogEngine.info('Session update completed', { 
                sessionId, 
                updateResult,
                newExpiresAt: extendedExpiresAt.toISOString()
            });

            // Show template customization interface
            await this.showTemplateCustomization(ctx, sessionId, session);
            
            return true;
        } catch (error) {
            LogEngine.error('Error in handleCustomizeTemplates', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                sessionId,
                userId: ctx.from?.id,
                context: 'handleCustomizeTemplates'
            });
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
• \`{{ticketNumber}}\` - User-friendly ticket number (TKT-445)
• \`{{customerName}}\` - Customer name
• \`{{summary}}\` - Ticket description
• \`{{status}}\` - Current ticket status

**Example Template:**
\`\`\`
🎫 New Ticket: {{summary}}

ID: {{ticketNumber}}
Customer: {{customerName}}
Status: {{status}}

We'll respond soon!
\`\`\`

Choose your preferred approach:`;

        // Generate short callback ID for this session
        const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId);

        await ctx.editMessageText(infoMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🚀 Use Defaults", callback_data: `setup_use_defaults_${shortId}` },
                        { text: "🎨 Customize Now", callback_data: `setup_customize_templates_${shortId}` }
                    ],
                    [
                        { text: "⬅️ Back to Setup", callback_data: `setup_back_to_completion_${shortId}` }
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

            // Generate short callback ID for this session
            const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId);

            await ctx.editMessageText(successMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Finish Setup", callback_data: `setup_use_defaults_${shortId}` },
                            { text: "🎨 Customize Templates", callback_data: `setup_customize_templates_${shortId}` }
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

    // Enhanced validation method that performs actual validation logic
    private async performSetupValidation(ctx: BotContext, sessionId: string, groupChatId: number, groupTitle: string): Promise<void> {
        try {
            // Import and use existing validation service
            const { ValidationService } = await import('../../services/validationService.js');
            
            // Perform actual setup validation
            const validationResult = await ValidationService.performSetupValidation(ctx, groupChatId, groupTitle);
            
            if (validationResult.allPassed) {
                // Validation passed - continue with setup completion
                await ctx.editMessageText(
                    `✅ **Validation Successful**

Group "${groupTitle}" is properly configured and ready for setup completion.

${validationResult.message}

Please proceed with the next step in the setup process.`
                );
            } else {
                // Validation failed - provide specific error information
                const failedChecks = validationResult.checks
                    .filter(check => !check.passed)
                    .map(check => `• ${check.name}: ${check.details}`)
                    .join('\n');
                
                await ctx.editMessageText(
                    `❌ **Validation Failed**

${validationResult.message}

**Issues Found:**
${failedChecks}

Please return to the group and run \`/setup\` again after resolving these issues.`
                );
            }
            
        } catch (error) {
            // Fallback validation logic if service is unavailable
            logError(error, 'SetupCallbackProcessor.performSetupValidation', { 
                sessionId, 
                groupChatId, 
                groupTitle 
            });
            
            // Basic fallback validation - check if group exists and bot has access
            try {
                const { BotsStore } = await import('../../sdk/bots-brain/index.js');
                const existingConfig = await BotsStore.getGroupConfig(groupChatId);
                
                if (existingConfig?.isConfigured) {
                    await ctx.editMessageText(
                        `⚠️ **Setup Already Complete**

This group appears to already be configured. If you're experiencing issues, please contact support.`
                    );
                } else {
                    await ctx.editMessageText(
                        `🔄 **Validation Retry Required**

Unable to complete validation automatically. Please return to the group and run \`/setup\` again to retry the validation process.`
                    );
                }
            } catch (_fallbackError) {
                // Ultimate fallback
                await ctx.editMessageText(
                    `🔄 **Validation Retry Required**

Please return to the group and run \`/setup\` again to retry the validation process.`
                );
            }
        }
    }

    /**
     * Send setup completion notification to the group chat
     */
    private async sendGroupSetupNotification(ctx: BotContext, session: DmSetupSession): Promise<void> {
        try {
            const customerName = session.stepData?.customerName || 
                               session.stepData?.suggestedName || 
                               (session.stepData?.existingCustomerId ? `Customer ${session.stepData.existingCustomerId.substring(0, 8)}...` : 'Unknown');

            const groupNotification = `✅ **Setup Complete!**

📋 **This group is now configured for support tickets for ${customerName}.**

🎫 **Members can use** \`/support\` **to create support tickets and get help from our team.**`;

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
            const _templates = await templateManager.getGlobalTemplates();
            
            // Generate short callback ID for this session
            const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
            
            const customizationMessage = `🎨 **Template Customization**

**Group:** ${session.groupChatName}

Choose which template to customize first:

**Available Templates:**
• 🎫 **Ticket Created** - New support ticket notifications
• 👨‍💼 **Agent Response** - When agents reply to tickets  
• ✅ **Ticket Status** - Support ticket resolution messages

💡 **What You Can Customize:**
• Message content and formatting
• Use dynamic variables like \`{{ticketNumber}}\`, \`{{customerName}}\`
• Add your brand voice and personality
• Include specific instructions or next steps

🔧 **Available Variables:**
Each template has access to relevant data like ticket details, customer info, agent names, and timestamps.

*Click a template below to see all available variables and current content:*`;

            await ctx.reply(customizationMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🎫 Ticket Created", callback_data: `template_edit_tc_${shortId}` }
                        ],
                        [
                            { text: "👨‍💼 Agent Response", callback_data: `template_edit_ar_${shortId}` }
                        ],
                        [
                            { text: "✅ Ticket Status", callback_data: `template_edit_ts_${shortId}` },
                            { text: "ℹ️ Learn About Templates", callback_data: `setup_template_info_${shortId}` }
                        ],
                        [
                            { text: "🚀 Use Defaults Instead", callback_data: `setup_use_defaults_${shortId}` },
                            { text: "✅ Finish Setup", callback_data: `setup_finish_custom_${shortId}` }
                        ]
                    ]
                }
            });
            
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.showTemplateCustomization', { sessionId });
            await ctx.reply("❌ Failed to load template customization. Using defaults instead...");
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

            // Extend session expiration for template editing
            const now = new Date();
            const currentExpiry = new Date(session.expiresAt);
            
            // Extend to 15 minutes from now, or add 15 minutes to current expiry, whichever is later
            const newExpiryFromNow = new Date(now.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            const newExpiryFromCurrent = new Date(currentExpiry.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            const extendedExpiresAt = newExpiryFromNow > newExpiryFromCurrent ? newExpiryFromNow : newExpiryFromCurrent;
            
            LogEngine.info('Extending session expiration for template editing', {
                sessionId,
                templateType,
                currentTime: now.toISOString(),
                currentExpiry: session.expiresAt,
                finalExpiry: extendedExpiresAt.toISOString()
            });
            
            await BotsStore.updateDmSetupSession(sessionId, {
                expiresAt: extendedExpiresAt.toISOString()
            });

            // Get current template content and available variables
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const availableVariables = templateManager.getAvailableVariables();
            
            // Get current template
            const currentTemplate = await templateManager.getTemplate(templateType as GlobalTemplateEvent);
            
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

📝 **Current Template:**
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
• \`{{ticketNumber}}\` → TKT-445
• \`{{customerName}}\` → John Doe

**Ready to customize? Click "Edit Template" to start!**`;

            // Generate short callback ID for this session
            const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId);

            await ctx.editMessageText(editMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✏️ Edit Template", callback_data: `template_start_edit_${this.getTemplateShortCode(templateType)}_${shortId}` }
                        ],
                        [
                            { text: "⬅️ Back to Templates", callback_data: `setup_customize_templates_${shortId}` }
                        ],
                        [
                            { text: "🚀 Use Defaults Instead", callback_data: `setup_use_defaults_${shortId}` },
                            { text: "✅ Finish Setup", callback_data: `setup_finish_custom_${shortId}` }
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

            // Extend session expiration for template editing
            const now = new Date();
            const currentExpiry = new Date(session.expiresAt);
            
            // Extend to 15 minutes from now, or add 15 minutes to current expiry, whichever is later
            const newExpiryFromNow = new Date(now.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            const newExpiryFromCurrent = new Date(currentExpiry.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            const extendedExpiresAt = newExpiryFromNow > newExpiryFromCurrent ? newExpiryFromNow : newExpiryFromCurrent;
            
            LogEngine.info('Extending session expiration for template start edit', {
                sessionId,
                templateType,
                currentTime: now.toISOString(),
                currentExpiry: session.expiresAt,
                finalExpiry: extendedExpiresAt.toISOString()
            });
            
            await BotsStore.updateDmSetupSession(sessionId, {
                expiresAt: extendedExpiresAt.toISOString()
            });

            // Get current template content
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const currentTemplate = await templateManager.getTemplate(templateType as GlobalTemplateEvent);
            
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
• Use variables like \`{{ticketNumber}}\`, \`{{customerName}}\`, \`{{summary}}\`
• Keep it clear and professional
• You can use multiple lines

**Available Variables:**
• \`{{ticketNumber}}\` - User-friendly ticket number (TKT-445)
• \`{{summary}}\` - Ticket summary/title  
• \`{{customerName}}\` - Customer name
• \`{{status}}\` - Ticket status
• \`{{response}}\` - Agent response content
• \`{{createdAt}}\` - Creation time
• \`{{updatedAt}}\` - Last update time

**Type your new template content:**`;

            // Generate short callback ID for this session
            const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId);

            await ctx.editMessageText(editPromptMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "❌ Cancel Edit", callback_data: `template_cancel_edit_${this.getTemplateShortCode(templateType)}_${shortId}` }
                        ],
                        [
                            { text: "⬅️ Back to Template Info", callback_data: `template_edit_${this.getTemplateShortCode(templateType)}_${shortId}` }
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

    /**
     * Handle returning to customer selection screen
     */
    private async handleBackToCustomerSelection(ctx: BotContext, sessionId: string): Promise<boolean> {
        await ctx.answerCbQuery("⬅️ Returning to customer setup options...");
        
        try {
            const { BotsStore } = await import('../../sdk/bots-brain/index.js');
            const session = await BotsStore.getDmSetupSession(sessionId);
            
            if (!session) {
                await ctx.editMessageText("❌ Setup session expired. Please start over with `/setup` in the group.");
                return true;
            }

            // Extend session expiry when navigating back to prevent expiration
            const now = new Date();
            const extendedExpiresAt = new Date(now.getTime() + CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000);
            
            // Update session step and extend expiry
            await BotsStore.updateDmSetupSession(sessionId, {
                currentStep: 'customer_setup',
                expiresAt: extendedExpiresAt.toISOString()
            });

            const suggestedName = session.stepData?.suggestedName || 'Unknown';
            const groupTitle = session.stepData?.groupTitle || session.groupChatName || 'Unknown Group';

            const customerSetupMessage = `🎯 **Customer Setup**

**Group:** ${groupTitle}

Please choose how you'd like to set up the customer for this group:

**Suggested Customer Name:**
\`${suggestedName}\`

**Choose your preferred option:**`;

            // Generate short callback IDs to stay within Telegram's 64-byte limit
            const shortSuggestedId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
            const shortCustomId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
            const shortExistingId = SetupCallbackProcessor.generateShortCallbackId(sessionId);
            const shortCancelId = SetupCallbackProcessor.generateShortCallbackId(sessionId);

            await ctx.editMessageText(customerSetupMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [

                            { text: `✅ Use "${suggestedName}"`, callback_data: `setup_use_suggested_${shortSuggestedId}` }
                        ],
                        [
                            { text: "✏️ Use Different Name", callback_data: `setup_custom_name_${shortCustomId}` },
                            { text: "🔗 Existing Customer ID", callback_data: `setup_existing_customer_${shortExistingId}` }
                        ],
                        [
                            { text: "❌ Cancel Setup", callback_data: `setup_cancel_${shortCancelId}` }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'SetupCallbackProcessor.handleBackToCustomerSelection', { sessionId });
            await ctx.editMessageText("❌ Failed to return to customer setup. Please try again.");
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
        return callbackData.startsWith('admin_help_') ||
               callbackData.startsWith('template_preview_') ||
               callbackData.startsWith('template_reset_') ||
               callbackData.startsWith('template_close') ||
               callbackData.startsWith('template_edit_ticket_') ||
               callbackData.startsWith('template_edit_agent_') ||
               callbackData.startsWith('template_edit_status') ||
               callbackData === 'template_back_to_manager';
    }

    async process(ctx: BotContext, callbackData: string): Promise<boolean> {
        try {
            // Handle admin help callbacks
            if (callbackData.startsWith('admin_help_activation_')) {
                return await this.handleActivationHelp(ctx);
            }
            
            // Handle template management callbacks
            if (callbackData === 'template_preview_all') {
                return await this.handleTemplatePreview(ctx);
            }
            
            if (callbackData === 'template_reset_confirm') {
                return await this.handleTemplateResetConfirm(ctx);
            }
            
            if (callbackData === 'template_reset_confirmed') {
                return await this.handleTemplateResetConfirmed(ctx);
            }
            
            if (callbackData === 'template_close') {
                return await this.handleTemplateClose(ctx);
            }
            
            if (callbackData === 'template_back_to_manager') {
                return await this.handleBackToManager(ctx);
            }
            
            // Handle standalone template editing (outside setup flow)
            if (callbackData.startsWith('template_edit_')) {
                const templateType = callbackData.replace('template_edit_', '');
                return await this.handleStandaloneTemplateEdit(ctx, templateType);
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

    /**
     * Handle template preview - show all current templates with edit buttons
     */
    private async handleTemplatePreview(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("📊 Loading template preview...");
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const templates = await templateManager.getGlobalTemplates();
            
            // Smart status calculation for user-friendly display (consistent with template manager)
            const templateEntries = Object.entries(templates.templates);
            const customizedTemplates = templateEntries.filter(([_, template]) => 
                template.lastModifiedBy && template.lastModifiedAt
            );
            const totalTemplates = templateEntries.length;
            const customizedCount = customizedTemplates.length;
            
            // Generate status message based on customization state
            let statusMessage: string;
            let activityInfo: string;
            
            if (customizedCount === 0) {
                statusMessage = "Using default templates";
                activityInfo = "Never modified";
            } else if (customizedCount === totalTemplates) {
                statusMessage = "All templates customized";
                const lastModified = new Date(templates.lastUpdated).toLocaleDateString();
                activityInfo = `Last modified: ${lastModified}`;
            } else {
                statusMessage = `${customizedCount} of ${totalTemplates} templates customized`;
                const lastModified = new Date(templates.lastUpdated).toLocaleDateString();
                activityInfo = `Last modified: ${lastModified}`;
            }
            
            const previewMessage = 
                `📊 **Template Preview**\n\n` +
                `**Current Status:** ${statusMessage}\n` +
                `**Last Activity:** ${activityInfo}\n\n` +
                `**Available Templates:**\n\n` +
                `🎫 **Ticket Created Template:**\n` +
                `\`\`\`\n${templates.templates.ticket_created?.content || 'Using default template'}\n\`\`\`\n\n` +
                `👨‍💼 **Agent Response Template:**\n` +
                `\`\`\`\n${templates.templates.agent_response?.content || 'Using default template'}\n\`\`\`\n\n` +
                `✅ **Ticket Status Template:**\n` +
                `\`\`\`\n${templates.templates.ticket_status?.content || 'Using default template'}\n\`\`\`\n\n` +
                `*Click a template below to edit it:*`;

            await ctx.editMessageText(previewMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🎫 Edit Ticket Created", callback_data: "template_edit_ticket_created" },
                            { text: "👨‍💼 Edit Agent Response", callback_data: "template_edit_agent_response" }
                        ],
                        [
                            { text: "✅ Edit Ticket Status", callback_data: "template_edit_ticket_status" }
                        ],
                        [
                            { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'AdminCallbackProcessor.handleTemplatePreview');
            await ctx.editMessageText("❌ Failed to load template preview. Please try again.");
            return true;
        }
    }

    /**
     * Handle template reset confirmation
     */
    private async handleTemplateResetConfirm(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("⚠️ Reset confirmation required...");
        
        const confirmMessage = 
            `⚠️ **Reset Templates to Defaults**\n\n` +
            `**Warning:** This action will:\n` +
            `• Replace all custom templates with defaults\n` +
            `• Remove any personalization you've added\n` +
            `• Cannot be undone automatically\n\n` +
            `**Current templates will be lost permanently.**\n\n` +
            `Are you absolutely sure you want to proceed?`;

        await ctx.editMessageText(confirmMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "✅ Yes, Reset to Defaults", callback_data: "template_reset_confirmed" }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: "template_back_to_manager" }
                    ]
                ]
            }
        });
        
        return true;
    }

    /**
     * Handle confirmed template reset
     */
    private async handleTemplateResetConfirmed(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("🔄 Resetting templates to defaults...");
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            
            const result = await templateManager.resetToDefaults(ctx.from?.id);
            
            if (result.success) {
                const successMessage = 
                    `✅ **Templates Reset Successfully**\n\n` +
                    `All templates have been restored to their default values.\n\n` +
                    `**What's been reset:**\n` +
                    `• 🎫 Ticket Created Template\n` +
                    `• 👨‍💼 Agent Response Template\n` +
                    `• ✅ Ticket Status Template\n\n` +
                    `You can now customize them again as needed.`;

                await ctx.editMessageText(successMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "📊 Preview Templates", callback_data: "template_preview_all" }
                            ],
                            [
                                { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                            ]
                        ]
                    }
                });
            } else {
                await ctx.editMessageText(
                    `❌ **Reset Failed**\n\nFailed to reset templates: ${result.error || 'Unknown error'}\n\nPlease try again.`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "🔄 Try Again", callback_data: "template_reset_confirm" },
                                    { text: "⬅️ Back", callback_data: "template_back_to_manager" }
                                ]
                            ]
                        }
                    }
                );
            }
            
            return true;
        } catch (error) {
            logError(error, 'AdminCallbackProcessor.handleTemplateResetConfirmed');
            await ctx.editMessageText("❌ An error occurred while resetting templates. Please try again.");
            return true;
        }
    }

    /**
     * Handle template close - simply dismiss the interface
     */
    private async handleTemplateClose(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("✅ Template manager closed");
        
        await ctx.editMessageText(
            `✅ **Template Manager Closed**\n\n` +
            `Template management session ended.\n\n` +
            `Use \`/templates\` anytime to manage your message templates again.`,
            { parse_mode: 'Markdown' }
        );
        
        return true;
    }

    /**
     * Handle going back to template manager
     */
    private async handleBackToManager(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("⬅️ Returning to template manager...");
        
        try {
            // Import and call the template manager from AdminCommands
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const templates = await templateManager.getGlobalTemplates();
            const templateCount = Object.keys(templates.templates).length;
            
            const templateMessage = 
                "📝 **Message Template Manager**\n\n" +
                `**Current Status:** ${templateCount} templates configured\n\n` +
                "**Available Templates:**\n" +
                "• 🎫 **Ticket Created** - New support ticket notifications\n" +
                "• 👨‍💼 **Agent Response** - When agents reply to tickets\n" +
                "• ✅ **Ticket Closed** - Support ticket resolution messages\n\n" +
                "**Management Options:**";

            await ctx.editMessageText(templateMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🎫 Edit Ticket Created", callback_data: "template_edit_ticket_created" },
                            { text: "👨‍💼 Edit Agent Response", callback_data: "template_edit_agent_response" }
                        ],
                        [
                            { text: "✅ Edit Ticket Status", callback_data: "template_edit_ticket_status" },
                            { text: "📊 Template Preview", callback_data: "template_preview_all" }
                        ],
                        [
                            { text: "🔄 Reset to Defaults", callback_data: "template_reset_confirm" }
                        ],
                        [
                            { text: "❌ Close", callback_data: "template_close" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'AdminCallbackProcessor.handleBackToManager');
            await ctx.editMessageText("❌ Failed to return to template manager. Please try `/templates` again.");
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

    /**
     * Handle standalone template editing (outside of setup flow)
     */
    private async handleStandaloneTemplateEdit(ctx: BotContext, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery(`✏️ Opening ${templateType.replace('_', ' ')} editor...`);
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const availableVariables = templateManager.getAvailableVariables();
            const currentTemplate = await templateManager.getTemplate(templateType as GlobalTemplateEvent);
            
            // Map template type to readable name and description
            let templateDisplayName = templateType.charAt(0).toUpperCase() + templateType.slice(1).replace('_', ' ');
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
            }

            // Build available variables list
            const coreVars = availableVariables.core.map(v => `• \`{{${v.name}}}\` - ${v.description}`).join('\n');
            const agentVars = availableVariables.agent.map(v => `• \`{{${v.name}}}\` - ${v.description}`).join('\n');
            const timeVars = availableVariables.time.map(v => `• \`{{${v.name}}}\` - ${v.description}`).join('\n');

            const editMessage = `✏️ **Template Editor: ${templateDisplayName}**

**Purpose:** ${templateDescription}

📝 **Current Template:**
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
• \`{{ticketNumber}}\` → TKT-445
• \`{{customerName}}\` → John Doe

**To edit this template, type your new content below:**`;

            await ctx.editMessageText(editMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "📊 Preview All Templates", callback_data: "template_preview_all" }
                        ],
                        [
                            { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'AdminCallbackProcessor.handleStandaloneTemplateEdit', { templateType });
            await ctx.answerCbQuery("❌ Failed to open template editor. Please try again.");
            return true;
        }
    }
}

/**
 * Template Callback Processor
 * Handles callbacks related to standalone template management (from /templates command)
 * This processor doesn't require sessions and works independently
 */
export class TemplateCallbackProcessor implements ICallbackProcessor {
    canHandle(callbackData: string): boolean {
        return callbackData.startsWith('template_');
    }

    async process(ctx: BotContext, callbackData: string): Promise<boolean> {
        try {
            const action = callbackData.replace('template_', '');
            
            switch (true) {
                case action.startsWith('edit_ticket_created'):
                    return await this.handleEditTemplate(ctx, 'ticket_created');
                case action.startsWith('edit_agent_response'):
                    return await this.handleEditTemplate(ctx, 'agent_response');
                case action.startsWith('edit_ticket_status'):
                    return await this.handleEditTemplate(ctx, 'ticket_status');
                case action.startsWith('start_edit_'):
                    return await this.handleStartEdit(ctx, action.replace('start_edit_', ''));
                case action.startsWith('preview_'):
                    return await this.handlePreviewTemplate(ctx, action.replace('preview_', ''));
                case action.startsWith('reset_') && !action.startsWith('reset_confirm') && !action.startsWith('reset_execute'):
                    return await this.handleResetTemplate(ctx, action.replace('reset_', ''));
                case action === 'cancel_edit':
                    return await this.handleCancelEdit(ctx);
                case action === 'preview_all':
                    return await this.handlePreviewAll(ctx);
                case action === 'reset_confirm':
                    return await this.handleResetConfirm(ctx);
                case action === 'reset_execute':
                    return await this.handleResetExecute(ctx);
                case action === 'close':
                    return await this.handleClose(ctx);
                case action === 'back_to_manager':
                    return await this.handleBackToManager(ctx);
                default:
                    return false;
            }
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.process', { 
                callbackData, 
                userId: ctx.from?.id 
            });
            await ctx.answerCbQuery("❌ An error occurred. Please try again.");
            return true;
        }
    }

    /**
     * Handle editing a specific template
     */
    private async handleEditTemplate(ctx: BotContext, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery(`✏️ Opening ${templateType.replace('_', ' ')} editor...`);
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            
            // Get current template and available variables
            const currentTemplate = await templateManager.getTemplate(templateType as GlobalTemplateEvent);
            const availableVariables = templateManager.getAvailableVariables();
            
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

**Purpose:** ${templateDescription}

📝 **Current Template:**
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
• \`{{ticketNumber}}\` → TKT-445
• \`{{customerName}}\` → John Doe

**To edit this template:**
1. Click "✏️ Start Editing" below
2. Type your new template content
3. Use variables like \`{{ticketNumber}}\`, \`{{summary}}\`, etc.
4. Send your message to save the template`;

            await ctx.editMessageText(editMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✏️ Start Editing", callback_data: `template_start_edit_${templateType}` }
                        ],
                        [
                            { text: "📊 Preview", callback_data: `template_preview_${templateType}` },
                            { text: "🔄 Reset to Default", callback_data: `template_reset_${templateType}` }
                        ],
                        [
                            { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.handleEditTemplate', { templateType });
            await ctx.answerCbQuery("❌ Failed to open template editor. Please try again.");
            return true;
        }
    }

    /**
     * Handle starting template editing (conversation mode)
     */
    private async handleStartEdit(ctx: BotContext, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery("✏️ Starting template editor...");
        
        try {
            const userId = ctx.from?.id;
            if (!userId) {
                await ctx.answerCbQuery("❌ Unable to identify user.");
                return true;
            }

            // Store editing state in user state
            await BotsStore.setUserState(userId, {
                currentField: 'template_content',
                field: 'template_content',
                templateType: templateType,
                editMode: 'standalone'
            });

            const instructionMessage = `✏️ **Template Editing Mode**

You're now editing the **${templateType.replace('_', ' ')}** template.

**Instructions:**
• Type your new template content below
• Use variables like \`{{ticketNumber}}\`, \`{{summary}}\`, \`{{customerName}}\`
• Keep it clear and professional
• Multiple lines are supported

**Available Variables:**
• \`{{ticketNumber}}\` - User-friendly ticket number (TKT-445)
• \`{{summary}}\` - Ticket summary/title
• \`{{customerName}}\` - Customer name
• \`{{status}}\` - Ticket status
• \`{{response}}\` - Agent response content (for agent_response template)

**Send your new template content now:**`;

            await ctx.editMessageText(instructionMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "❌ Cancel Editing", callback_data: "template_cancel_edit" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.handleStartEdit', { templateType });
            await ctx.answerCbQuery("❌ Failed to start template editing. Please try again.");
            return true;
        }
    }

    /**
     * Handle preview all templates
     */
    private async handlePreviewAll(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("📊 Loading template preview...");
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const templates = await templateManager.getGlobalTemplates();

            const previewMessage = `📊 **Template Preview**

**🎫 Ticket Created Template:**
${templates.templates.ticket_created.enabled ? '✅ Enabled' : '❌ Disabled'}
\`\`\`
${templates.templates.ticket_created.content}
\`\`\`

**👨‍💼 Agent Response Template:**
${templates.templates.agent_response.enabled ? '✅ Enabled' : '❌ Disabled'}
\`\`\`
${templates.templates.agent_response.content}
\`\`\`

**✅ Ticket Status Template:**
${templates.templates.ticket_status.enabled ? '✅ Enabled' : '❌ Disabled'}
\`\`\`
${templates.templates.ticket_status.content}
\`\`\`

**Configuration:**
• Version: ${templates.version}
• Last Updated: ${new Date(templates.lastUpdated).toLocaleString()}`;

            await ctx.editMessageText(previewMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.handlePreviewAll');
            await ctx.answerCbQuery("❌ Failed to load preview. Please try again.");
            return true;
        }
    }

    /**
     * Handle reset confirmation
     */
    private async handleResetConfirm(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("⚠️ Reset confirmation...");
        
        const confirmMessage = `⚠️ **Reset Templates to Defaults**

This will reset **ALL** templates to their default values and **remove all customizations**.

**What will be reset:**
• 🎫 Ticket Created template
• 👨‍💼 Agent Response template  
• ✅ Ticket Status template

**This action cannot be undone.**

Are you sure you want to proceed?`;

        await ctx.editMessageText(confirmMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "⚠️ Yes, Reset All", callback_data: "template_reset_execute" }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: "template_back_to_manager" }
                    ]
                ]
            }
        });
        
        return true;
    }

    /**
     * Handle reset execution
     */
    private async handleResetExecute(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("🔄 Resetting templates...");
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            
            const result = await templateManager.resetToDefaults(ctx.from?.id);
            
            if (result.success) {
                const successMessage = `✅ **Templates Reset Successfully**

All templates have been reset to their default values.

**What's been reset:**
• 🎫 Ticket Created template → Default content
• 👨‍💼 Agent Response template → Default content
• ✅ Ticket Status template → Default content

Your templates are now using the standard, professional defaults.`;

                await ctx.editMessageText(successMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "📝 Open Template Manager", callback_data: "template_back_to_manager" }
                            ]
                        ]
                    }
                });
            } else {
                await ctx.editMessageText(`❌ **Reset Failed**\n\n${result.error || 'Unknown error occurred'}\n\nPlease try again.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                            ]
                        ]
                    }
                });
            }
            
            return true;
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.handleResetExecute');
            await ctx.answerCbQuery("❌ Failed to reset templates. Please try again.");
            return true;
        }
    }

    /**
     * Handle close
     */
    private async handleClose(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("👋 Closing template manager...");
        
        try {
            await ctx.deleteMessage();
        } catch (_error) {
            // If we can't delete, just edit with a closed message
            await ctx.editMessageText("📝 **Template Manager Closed**\n\nUse `/templates` to open it again.", {
                parse_mode: 'Markdown'
            });
        }
        
        return true;
    }

    /**
     * Handle back to manager
     */
    private async handleBackToManager(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("⬅️ Returning to template manager...");
        
        try {
            // Import and call the template manager show method
            // const { TemplatesCommand } = await import('../admin/AdminCommands.js');
            // Note: We're rebuilding the template manager interface directly here
            
            // Get current templates for status
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const templates = await templateManager.getGlobalTemplates();
            
            const templateEntries = Object.entries(templates.templates);
            const customizedTemplates = templateEntries.filter(([_, template]) => 
                template.lastModifiedBy && template.lastModifiedAt
            );
            const totalTemplates = templateEntries.length;
            const customizedCount = customizedTemplates.length;
            
            // Generate status message based on customization state
            let statusMessage: string;
            let activityInfo: string;
            
            if (customizedCount === 0) {
                statusMessage = "Using defaults";
                activityInfo = "No customizations yet";
            } else if (customizedCount === totalTemplates) {
                statusMessage = "Fully customized";
                const lastModified = Math.max(...customizedTemplates.map(([_, t]) => 
                    t.lastModifiedAt ? new Date(t.lastModifiedAt).getTime() : 0
                ));
                activityInfo = `Last updated ${new Date(lastModified).toLocaleDateString()}`;
            } else {
                statusMessage = `${customizedCount}/${totalTemplates} customized`;
                const lastModified = Math.max(...customizedTemplates.map(([_, t]) => 
                    t.lastModifiedAt ? new Date(t.lastModifiedAt).getTime() : 0
                ));
                activityInfo = `Last updated ${new Date(lastModified).toLocaleDateString()}`;
            }
            
            // Generate individual template status indicators
            const getTemplateStatus = (template: GlobalTemplate): string => {
                if (!template.enabled) {
                    return "❌ Disabled";
                }
                if (template.lastModifiedBy && template.lastModifiedAt) {
                    return "✏️ Customized";
                }
                return "🚀 Default";
            };
            
            const templateMessage = 
                "📝 **Message Template Manager**\n\n" +
                "Customize how the bot communicates with your customers.\n\n" +
                `**Current Status:** ${statusMessage}\n` +
                `**Last Activity:** ${activityInfo}\n\n` +
                "**Available Templates:**\n" +
                `• 🎫 **Ticket Created** - ${getTemplateStatus(templates.templates.ticket_created)}\n` +
                `• 👨‍💼 **Agent Response** - ${getTemplateStatus(templates.templates.agent_response)}\n` +
                `• ✅ **Ticket Status** - ${getTemplateStatus(templates.templates.ticket_status)}\n\n` +
                "**Management Options:**";

            await ctx.editMessageText(templateMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🎫 Edit Ticket Created", callback_data: "template_edit_ticket_created" },
                            { text: "👨‍💼 Edit Agent Response", callback_data: "template_edit_agent_response" }
                        ],
                        [
                            { text: "✅ Edit Ticket Status", callback_data: "template_edit_ticket_status" },
                            { text: "📊 Template Preview", callback_data: "template_preview_all" }
                        ],
                        [
                            { text: "🔄 Reset to Defaults", callback_data: "template_reset_confirm" }
                        ],
                        [
                            { text: "❌ Close", callback_data: "template_close" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.handleBackToManager');
            await ctx.answerCbQuery("❌ Failed to return to manager. Please try again.");
            return true;
        }
    }

    /**
     * Handle previewing a specific template
     */
    private async handlePreviewTemplate(ctx: BotContext, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery(`📊 Previewing ${templateType.replace('_', ' ')} template...`);
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const templateManager = GlobalTemplateManager.getInstance();
            const template = await templateManager.getTemplate(templateType as GlobalTemplateEvent);
            
            if (!template) {
                await ctx.answerCbQuery("❌ Template not found.");
                return true;
            }

            const templateDisplayName = templateType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            const previewMessage = `📊 **${templateDisplayName} Template Preview**

**Status:** ${template.enabled ? '✅ Enabled' : '❌ Disabled'}

**Content:**
\`\`\`
${template.content}
\`\`\`

**Example with sample data:**
${this.renderTemplateExample(template.content, templateType)}

**Last Modified:** ${template.lastModifiedAt ? new Date(template.lastModifiedAt).toLocaleString() : 'Never (default)'}`;

            await ctx.editMessageText(previewMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✏️ Edit Template", callback_data: `template_edit_${templateType}` }
                        ],
                        [
                            { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                        ]
                    ]
                }
            });
            
            return true;
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.handlePreviewTemplate', { templateType });
            await ctx.answerCbQuery("❌ Failed to load preview. Please try again.");
            return true;
        }
    }

    /**
     * Render template example with sample data
     */
    private renderTemplateExample(content: string, templateType: string): string {
        const sampleData: Record<string, string> = {
            ticketNumber: 'TKT-445',
            summary: 'Login issue with mobile app',
            customerName: 'John Doe',
            status: templateType === 'ticket_status' ? 'Resolved' : 'Open',
            response: 'Thanks for reaching out! I\'ve investigated your login issue...'
        };

        let example = content;
        for (const [key, value] of Object.entries(sampleData)) {
            const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            example = example.replace(pattern, value);
        }

        return example;
    }

    /**
     * Handle resetting a specific template
     */
    private async handleResetTemplate(ctx: BotContext, templateType: string): Promise<boolean> {
        await ctx.answerCbQuery(`🔄 Resetting ${templateType.replace('_', ' ')} template...`);
        
        try {
            const { GlobalTemplateManager } = await import('../../utils/globalTemplateManager.js');
            const { DEFAULT_GLOBAL_TEMPLATES } = await import('../../config/globalTemplates.js');
            
            const templateManager = GlobalTemplateManager.getInstance();
            const defaultTemplate = DEFAULT_GLOBAL_TEMPLATES.templates[templateType as keyof typeof DEFAULT_GLOBAL_TEMPLATES.templates];
            
            if (!defaultTemplate) {
                await ctx.answerCbQuery("❌ Default template not found.");
                return true;
            }

            const result = await templateManager.updateTemplate(
                templateType as GlobalTemplateEvent,
                defaultTemplate.content,
                true,
                ctx.from?.id
            );

            if (result.success) {
                const templateDisplayName = templateType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                const successMessage = `✅ **${templateDisplayName} Template Reset**

The template has been reset to its default content.

**Default Content:**
\`\`\`
${defaultTemplate.content}
\`\`\`

Your template is now using the standard, professional default.`;

                await ctx.editMessageText(successMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✏️ Customize Again", callback_data: `template_edit_${templateType}` }
                            ],
                            [
                                { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                            ]
                        ]
                    }
                });
            } else {
                await ctx.editMessageText(`❌ **Reset Failed**\n\n${result.error || 'Unknown error occurred'}\n\nPlease try again.`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "⬅️ Back to Manager", callback_data: "template_back_to_manager" }
                            ]
                        ]
                    }
                });
            }
            
            return true;
        } catch (error) {
            logError(error, 'TemplateCallbackProcessor.handleResetTemplate', { templateType });
            await ctx.answerCbQuery("❌ Failed to reset template. Please try again.");
            return true;
        }
    }

    /**
     * Handle canceling template edit
     */
    private async handleCancelEdit(ctx: BotContext): Promise<boolean> {
        await ctx.answerCbQuery("❌ Template editing canceled...");
        
        try {
            const userId = ctx.from?.id;
            if (userId) {
                // Clear any editing state
                await BotsStore.clearUserState(userId);
            }

            await ctx.editMessageText("❌ **Template Editing Canceled**\n\nNo changes were made to your templates.", {
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
            logError(error, 'TemplateCallbackProcessor.handleCancelEdit');
            await ctx.answerCbQuery("❌ Failed to cancel editing. Please try again.");
            return true;
        }
    }
}
