/**
 * Basic Information Commands
 * 
 * Provides essential bot information commands like start, help,
 * version, and about following Clean Code principles.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js';
import type { BotContext } from '../../types/index.js';
import { getCompanyName, isAdminUser } from '../../config/env.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import { getCommandArgs } from '../../utils/messageContentExtractor.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Read package.json with proper error handling
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJSONPath = join(__dirname, '../../../package.json');

// Fallback package information in case of read/parse errors
const fallbackPackageInfo = {
    name: 'unthread-telegram-bot',
    version: '1.0.0-rc1',
    description: 'Official Unthread integration for Telegram',
    author: 'Waren Gonzaga, WG Technology Labs',
    license: 'GPL-3.0'
};

let packageJSON = fallbackPackageInfo;

try {
    const packageJSONContent = readFileSync(packageJSONPath, 'utf-8');
    packageJSON = JSON.parse(packageJSONContent);
    LogEngine.debug('Package.json loaded successfully', { 
        name: packageJSON.name, 
        version: packageJSON.version 
    });
} catch (error) {
    const err = error as Error;
    LogEngine.error('Failed to load package.json, using fallback values', {
        error: err.message,
        path: packageJSONPath,
        fallback: fallbackPackageInfo
    });
    // packageJSON remains set to fallbackPackageInfo
}

export class StartCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'start',
        description: 'Welcome message and bot introduction',
        usage: '/start',
        privateOnly: true
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const startPayload = getCommandArgs(ctx).trim();
        if (startPayload === 'admin_activate') {
            const activationPromptMessage =
                '🔐 **Admin Activation**\n\n' +
                'You opened the admin activation flow from a group setup request.\n\n' +
                '**Next step:** Tap the button below to run `/activate` in this private chat.\n\n' +
                '*If the button does not work, send `/activate` manually.*';

            await ctx.reply(activationPromptMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: '/activate' }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
            return;
        }

        const userId = ctx.from?.id;
        const isAdmin = userId ? isAdminUser(userId) : false;

        if (isAdmin) {
            const companyName = getCompanyName() || 'Support';
            const adminWelcomeMessage = `🛠️ **Welcome, Admin!**\n\n` +
                `You're managing the ${companyName} support bot.\n\n` +
                `**Admin Getting Started:**\n` +
                `1. Use /activate in this private chat\n` +
                `2. Run /setup in your group chat\n` +
                `3. Configure templates with /templates\n\n` +
                `Use /help to view all admin tools and troubleshooting steps.`;

            await ctx.reply(adminWelcomeMessage, { parse_mode: 'Markdown' });
            return;
        }

        const companyName = getCompanyName() || 'Support';
        const welcomeMessage = `🤖 **Welcome to ${companyName} Support Bot!**\n\n` +
            `I'm here to help you create support tickets and get assistance.\n\n` +
            `**Quick Start:**\n` +
            `• Use /support to create a new ticket\n` +
            `• Use /help to see all available commands\n` +
            `• Use /version to check bot version\n\n` +
            `Let's get started! 🚀`;

        await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    }
}

export class HelpCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'help',
        description: 'Display available commands and usage instructions',
        usage: '/help'
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const userId = ctx.from?.id;
        if (!userId) {
            await ctx.reply("❌ Unable to determine user identity.");
            return;
        }

        const isAdmin = isAdminUser(userId);
        const helpMessage = isAdmin ? this.generateAdminHelp() : this.generateRegularHelp();
        
        await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    }

    private generateRegularHelp(): string {
        return `📋 **Available Commands:**\n\n` +
            `🏠 /start - Welcome message and introduction\n` +
            `❓ /help - Show this help message\n` +
            `🎫 /support - Create a new support ticket\n` +
            `📊 /version - Show bot version information\n` +
            `❌ /cancel - Cancel current operation\n` +
            `🔄 /reset - Reset conversation state\n\n` +
            `**Need Help?**\n` +
            `Use /support to create a ticket and our team will assist you! 🚀`;
    }

    private generateAdminHelp(): string {
        return `📋 **Admin Help & Commands:**\n\n` +
            `**Regular Commands:**\n` +
            `🏠 /start - Welcome message and introduction\n` +
            `❓ /help - Show this help message\n` +
            `🎫 /support - Create a new support ticket\n` +
            `📊 /version - Show bot version information\n` +
            `ℹ️ /about - View admin bot details and troubleshooting info\n` +
            `❌ /cancel - Cancel current operation\n` +
            `🔄 /reset - Reset conversation state\n\n` +
            `**Admin Commands:**\n` +
            `🔧 /setup - Configure group chat for support\n` +
            `📝 /templates - Manage message templates\n` +
            `🔑 /activate - Activate admin privileges\n\n` +
            `**Admin Features:**\n` +
            `• Group chat configuration\n` +
            `• Message template management\n` +
            `• Advanced bot settings\n\n` +
            `**Troubleshooting:**\n` +
            `If setup fails or you find a bug, report it here:\n` +
            `🌐 [github.com/wgtechlabs](https://github.com/wgtechlabs/unthread-telegram-bot/issues)`;
    }
}

export class VersionCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'version',
        description: 'Show bot version information',
        usage: '/version'
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const versionInfo = `📊 **Bot Version Information**\n\n` +
            `**Version:** ${packageJSON.version}\n\n` +
            `📋 [Changelog](https://github.com/wgtechlabs/unthread-telegram-bot/releases)`;

        await ctx.reply(versionInfo, { parse_mode: 'Markdown' });
    }
}

export class AboutCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'about',
        description: 'Display admin bot information and troubleshooting details',
        usage: '/about',
        adminOnly: true
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const companyName = getCompanyName() || 'Support';
        const aboutMessage = `ℹ️ **${companyName} Bot Admin Overview**\n\n` +
            `This command is for bot operators and administrators.\n\n` +
            `**Admin Responsibilities:**\n` +
            `• Configure groups with /setup\n` +
            `• Manage templates with /templates\n` +
            `• Monitor activation and support workflows\n\n` +
            `**System Details:**\n` +
            `• Version: ${packageJSON.version}\n` +
            `• Stack: TypeScript + Telegraf\n` +
            `• Integration: Unthread API\n\n` +
            `**Troubleshooting & Bug Reports:**\n` +
            `🌐 [github.com/wgtechlabs](https://github.com/wgtechlabs/unthread-telegram-bot/issues)`;

        await ctx.reply(aboutMessage, { parse_mode: 'Markdown' });
    }
}
