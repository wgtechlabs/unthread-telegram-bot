/**
 * Admin Commands - Complete Implementation
 * 
 * Handles admin-specific commands including activation, setup, and templates
 * following Clean Code principles and SOLID design.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js';
import type { BotContext } from '../../types/index.js';
import { BotsStore } from '../../sdk/bots-brain/index.js';
import { checkAndPromptBotAdmin, isBotAdmin } from '../../utils/botPermissions.js';
import { logError, createUserErrorMessage } from '../utils/errorHandler.js';
import { getCompanyName } from '../../config/env.js';

export class ActivateCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'activate',
        description: 'Activate admin privileges for advanced features',
        usage: '/activate',
        examples: [
            '/activate - Activate admin access in private chat'
        ],
        adminOnly: true,
        privateOnly: true
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const userId = ctx.from!.id;
        
        try {
            // Check if admin is already activated
            const adminProfile = await BotsStore.getAdminProfile(userId);
            
            if (adminProfile?.isActivated) {
                await this.handleAlreadyActivated(ctx, adminProfile);
                return;
            }

            // Activate admin
            await this.activateAdmin(ctx, userId);

        } catch (error) {
            logError(error, 'ActivateCommand.executeCommand', { userId });
            await ctx.reply(createUserErrorMessage(error));
        }
    }

    private async handleAlreadyActivated(ctx: BotContext, adminProfile: any): Promise<void> {
        const lastActiveDate = new Date(adminProfile.lastActiveAt).toLocaleDateString();
        
        const message = 
            "✅ **Admin Already Activated**\n\n" +
            "Your administrator privileges are already active!\n\n" +
            `**Status:** Active\n` +
            `**Last Activity:** ${lastActiveDate}\n` +
            `**DM Chat ID:** ${adminProfile.dmChatId}\n\n` +
            "**Available Admin Commands:**\n" +
            "• `/setup` - Configure group chats\n" +
            "• `/templates` - Manage message templates\n" +
            "• `/help` - View all commands\n\n" +
            "*You're ready to manage bot settings!*";

        await ctx.reply(message, { parse_mode: 'Markdown' });
    }

    private async activateAdmin(ctx: BotContext, userId: number): Promise<void> {
        const companyName = getCompanyName();
        
        // Create admin profile
        const adminProfile = {
            telegramUserId: userId,
            isActivated: true,
            dmChatId: ctx.chat!.id,
            activatedAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString()
        };

        await BotsStore.storeAdminProfile(adminProfile);

        const activationMessage = 
            `🎉 **Admin Activation Successful!**\n\n` +
            `Welcome to ${companyName} Bot Administration!\n\n` +
            `**✅ Activated Features:**\n` +
            `• Group chat configuration via /setup\n` +
            `• Message template management via /templates\n` +
            `• Advanced bot administration tools\n` +
            `• Priority support and notifications\n\n` +
            `**🔧 Next Steps:**\n` +
            `1. Use /setup in group chats to configure support\n` +
            `2. Customize message templates with /templates\n` +
            `3. Check /help for all available commands\n\n` +
            `**🛡️ Security Note:**\n` +
            `Your admin status is linked to this private chat. Keep this conversation secure.\n\n` +
            `*You're now ready to manage the bot!*`;

        await ctx.reply(activationMessage, { parse_mode: 'Markdown' });
    }
}

export class SetupCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'setup',
        description: 'Configure group chat for support tickets',
        usage: '/setup',
        examples: [
            '/setup - Start group configuration wizard'
        ],
        adminOnly: true,
        groupOnly: true
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const userId = ctx.from!.id;
        const chatId = ctx.chat!.id;
        const chatTitle = 'title' in ctx.chat! ? ctx.chat!.title || 'Unknown Group' : 'Unknown Group';

        try {
            // Check if bot has admin permissions
            const hasBotAdmin = await isBotAdmin(ctx);
            if (!hasBotAdmin) {
                await checkAndPromptBotAdmin(ctx);
                return;
            }

            // Check for existing configuration
            const existingConfig = await BotsStore.getGroupConfig(chatId);
            if (existingConfig?.isConfigured) {
                await this.handleExistingSetup(ctx, existingConfig);
                return;
            }

            // Start setup wizard
            await this.startSetupWizard(ctx, userId, chatId, chatTitle);

        } catch (error) {
            logError(error, 'SetupCommand.executeCommand', { userId, chatId });
            await ctx.reply(createUserErrorMessage(error));
        }
    }

    private async handleExistingSetup(ctx: BotContext, config: any): Promise<void> {
        const setupDate = new Date(config.setupAt).toLocaleDateString();
        
        const message = 
            "⚙️ **Group Already Configured**\n\n" +
            "This group is already set up for support tickets!\n\n" +
            `**Current Configuration:**\n` +
            `• Customer: ${config.customerName}\n` +
            `• Customer ID: ${config.customerId}\n` +
            `• Configured: ${setupDate}\n` +
            `• Setup By: Admin #${config.setupBy}\n\n` +
            "**Available Actions:**";

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🔄 Reconfigure", callback_data: `setup_reconfigure_${ctx.chat!.id}` },
                        { text: "👁️ View Details", callback_data: `setup_details_${ctx.chat!.id}` }
                    ],
                    [
                        { text: "📝 Edit Templates", callback_data: `setup_templates_${ctx.chat!.id}` },
                        { text: "❌ Remove Setup", callback_data: `setup_remove_${ctx.chat!.id}` }
                    ]
                ]
            }
        });
    }

    private async startSetupWizard(ctx: BotContext, userId: number, chatId: number, chatTitle: string): Promise<void> {
        const setupMessage = 
            "🚀 **Group Setup Wizard**\n\n" +
            `Configuring support for: **${chatTitle}**\n\n` +
            "This wizard will:\n" +
            "1. Link this group to a customer\n" +
            "2. Configure message templates\n" +
            "3. Enable support ticket creation\n\n" +
            "**Customer Linking Options:**";

        await ctx.reply(setupMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🆕 Create New Customer", callback_data: `setup_create_${chatId}` },
                        { text: "🔗 Link Existing Customer", callback_data: `setup_link_${chatId}` }
                    ],
                    [
                        { text: "🤖 Auto-Generate", callback_data: `setup_auto_${chatId}` },
                        { text: "❌ Cancel", callback_data: `setup_cancel_${chatId}` }
                    ]
                ]
            }
        });
    }
}

export class TemplatesCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'templates',
        description: 'Manage message templates for notifications',
        usage: '/templates',
        examples: [
            '/templates - Open template management interface'
        ],
        adminOnly: true,
        privateOnly: true
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const userId = ctx.from!.id;

        try {
            // Check admin activation
            const adminProfile = await BotsStore.getAdminProfile(userId);
            if (!adminProfile?.isActivated) {
                await ctx.reply(
                    "🔒 **Admin Activation Required**\n\n" +
                    "Please use `/activate` first to enable admin features.",
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            await this.showTemplateManager(ctx);

        } catch (error) {
            logError(error, 'TemplatesCommand.executeCommand', { userId });
            await ctx.reply(createUserErrorMessage(error));
        }
    }

    private async showTemplateManager(ctx: BotContext): Promise<void> {
        const templateMessage = 
            "📝 **Message Template Manager**\n\n" +
            "Customize how the bot communicates with users and admins.\n\n" +
            "**Template Categories:**\n" +
            "• 🎫 **Support Templates** - Ticket notifications\n" +
            "• 👥 **Group Templates** - Group-specific messages\n" +
            "• 🔧 **Admin Templates** - Administrative notifications\n" +
            "• 🌐 **Global Templates** - System-wide messages\n\n" +
            "**Management Options:**";

        await ctx.reply(templateMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🎫 Support Templates", callback_data: "templates_support" },
                        { text: "👥 Group Templates", callback_data: "templates_group" }
                    ],
                    [
                        { text: "🔧 Admin Templates", callback_data: "templates_admin" },
                        { text: "🌐 Global Templates", callback_data: "templates_global" }
                    ],
                    [
                        { text: "📊 Template Stats", callback_data: "templates_stats" },
                        { text: "🔄 Reset to Defaults", callback_data: "templates_reset" }
                    ],
                    [
                        { text: "❌ Close", callback_data: "templates_close" }
                    ]
                ]
            }
        });
    }
}
