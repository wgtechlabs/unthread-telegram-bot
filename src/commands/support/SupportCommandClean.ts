/**
 * Support Command - Complete Clean Implementation
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js';
import { BotsStore } from '../../sdk/bots-brain/index.js';
import * as unthreadService from '../../services/unthread.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import { BotContext } from '../../types/index.js';
import { UserState } from '../../sdk/types.js';
import { getUserEmailStatus, generateDummyEmail } from '../../utils/emailManager.js';
import { escapeMarkdown } from '../../utils/markdownEscape.js';

export class SupportCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'support',
        description: 'Create a new support ticket',
        usage: '/support',
        examples: [
            '/support - Start the support ticket creation wizard'
        ],
        requiresSetup: true
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const userId = ctx.from?.id;
        const chatId = ctx.chat?.id;
        
        if (!userId || !chatId || chatId > 0) {
            await ctx.reply(
                "❌ **Support tickets can only be created in group chats.**\n\n" +
                "Please use this command in your designated support group chat.",
                { parse_mode: 'Markdown' }
            );
            return;
        }

        try {
            // Check if user already has an active ticket creation session
            const existingState = await BotsStore.getUserState(userId);
            if (existingState) {
                await this.handleExistingSession(ctx, existingState);
                return;
            }

            // Start new ticket creation process
            await this.startTicketCreation(ctx);
            
        } catch (error) {
            LogEngine.error('Error in support command', {
                error: (error as Error).message,
                userId,
                chatId
            });
            
            await ctx.reply(
                "❌ **Error starting support ticket**\n\n" +
                "An unexpected error occurred. Please try again or contact an administrator.",
                { parse_mode: 'Markdown' }
            );
        }
    }

    private async handleExistingSession(ctx: BotContext, state: UserState): Promise<void> {
        const message = 
            "🎫 **Support Ticket in Progress**\n\n" +
            "You already have a support ticket creation session active.\n\n" +
            "**Current Step:** " + (state.field === 'summary' ? 'Waiting for issue summary' : 'Waiting for email address') + "\n\n" +
            "**What would you like to do?**";

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "▶️ Continue", callback_data: "support_continue" },
                        { text: "🔄 Restart", callback_data: "support_restart" }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: "support_cancel" }
                    ]
                ]
            }
        });
    }

    private async startTicketCreation(ctx: BotContext): Promise<void> {
        // Defensive check for ctx.from
        if (!ctx.from) {
            LogEngine.warn('Support command executed without sender information');
            await ctx.reply("❌ Unable to process request. Please try again.");
            return;
        }

        // Defensive check for ctx.chat
        if (!ctx.chat) {
            LogEngine.warn('Support command executed without chat information');
            await ctx.reply("❌ Unable to process request. Please try again.");
            return;
        }

        const userId = ctx.from.id;
        
        // Get user's email status for progressive onboarding
        const emailStatus = await getUserEmailStatus(userId);

        switch (emailStatus.recommendedAction) {
            case 'first_time_setup':
                await this.showFirstTimeWelcome(ctx, userId);
                break;
            case 'suggest_real_email':
                await this.showUpgradeEmailSuggestion(ctx, userId, emailStatus.email!);
                break;
            case 'continue_with_existing':
                await this.startDirectTicketCreation(ctx, userId, emailStatus.email!);
                break;
        }
    }

    /**
     * Shows welcome screen for first-time users with email setup options
     */
    private async showFirstTimeWelcome(ctx: BotContext, userId: number): Promise<void> {
        const username = ctx.from?.username || `user${userId}`;
        const dummyEmail = generateDummyEmail(userId, username);

        const message = 
            "🎫 **Welcome to Support Tickets!**\n\n" +
            "I'll help you create a support ticket to connect with our team. This is your first time using our support system.\n\n" +
            "📧 **Email Setup Options:**\n\n" +
            "**Option 1: Set your email** _(Recommended)_\n" +
            "• Get direct updates from our support team\n" +
            "• Receive notifications about your tickets\n" +
            "• Better communication experience\n\n" +
            "**Option 2: Use temporary email**\n" +
            "• Quick ticket creation without personal email\n" +
            `• We'll use: \`${escapeMarkdown(dummyEmail)}\`\n` +
            "• You can set a real email later\n\n" +
            "**Choose your preferred option:**";

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📧 Set My Email", callback_data: "support_setup_email" }
                    ],
                    [
                        { text: "⚡ Use Temporary Email", callback_data: "support_use_temp" }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: "support_cancel" }
                    ]
                ]
            }
        });

        LogEngine.info('Showed first-time support welcome', { userId });
    }

    /**
     * Shows suggestion to upgrade from dummy email to real email
     */
    private async showUpgradeEmailSuggestion(ctx: BotContext, userId: number, currentEmail: string): Promise<void> {
        const message = 
            "🎫 **Create Support Ticket**\n\n" +
            `You're currently using a temporary email: \`${escapeMarkdown(currentEmail)}\`\n\n` +
            "💡 **Would you like to upgrade to a real email?**\n" +
            "This will help our support team contact you directly.\n\n" +
            "**Your options:**";

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📧 Set Real Email", callback_data: "support_upgrade_email" }
                    ],
                    [
                        { text: "▶️ Continue with Temporary", callback_data: "support_continue_temp" }
                    ],
                    [
                        { text: "❌ Cancel", callback_data: "support_cancel" }
                    ]
                ]
            }
        });

        LogEngine.info('Showed email upgrade suggestion', { userId, hasTemp: true });
    }

    /**
     * Starts direct ticket creation for users with confirmed email
     */
    private async startDirectTicketCreation(ctx: BotContext, userId: number, email: string): Promise<void> {
        // Set user state for ticket creation
        await BotsStore.setUserState(userId, {
            field: 'summary',
            step: 1,
            totalSteps: 1,
            hasEmail: true,
            email: email,
            chatId: ctx.chat!.id,
            startedAt: new Date().toISOString()
        });

        const message = 
            "🎫 **Create Support Ticket**\n\n" +
            "I'll help you create a support ticket. Our team will respond directly to your confirmed email address.\n\n" +
            "**Please describe your issue or question:**\n\n" +
            "*Be as detailed as possible to help our team assist you better.*";

        await ctx.reply(message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                force_reply: true,
                input_field_placeholder: "Describe your issue in detail..."
            }
        });

        LogEngine.info('Started direct ticket creation', { userId, emailConfirmed: true });
    }
}
