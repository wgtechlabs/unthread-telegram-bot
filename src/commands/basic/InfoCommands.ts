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
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Read package.json in a compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJSONPath = join(__dirname, '../../../package.json');
const packageJSON = JSON.parse(readFileSync(packageJSONPath, 'utf-8'));

export class StartCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'start',
        description: 'Welcome message and bot introduction',
        usage: '/start',
        privateOnly: true
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const companyName = getCompanyName() || 'Support';
        const welcomeMessage = `🤖 **Welcome to ${companyName} Support Bot!**\n\n` +
            `I'm here to help you create support tickets and get assistance.\n\n` +
            `**Quick Start:**\n` +
            `• Use /support to create a new ticket\n` +
            `• Use /help to see all available commands\n` +
            `• Use /about for more information\n\n` +
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
            `ℹ️ /about - Learn more about this bot\n` +
            `❌ /cancel - Cancel current operation\n` +
            `🔄 /reset - Reset conversation state\n\n` +
            `**Need Help?**\n` +
            `Use /support to create a ticket and our team will assist you! 🚀`;
    }

    private generateAdminHelp(): string {
        return `📋 **Available Commands (Admin):**\n\n` +
            `**Regular Commands:**\n` +
            `🏠 /start - Welcome message and introduction\n` +
            `❓ /help - Show this help message\n` +
            `🎫 /support - Create a new support ticket\n` +
            `📊 /version - Show bot version information\n` +
            `ℹ️ /about - Learn more about this bot\n` +
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
            `Need help? Contact the development team! 🛠️`;
    }
}

export class VersionCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'version',
        description: 'Show bot version and build information',
        usage: '/version'
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const isProduction = process.env.NODE_ENV === 'production';
        
        let versionInfo = `📊 **Bot Version Information**\n\n` +
            `**Version:** ${packageJSON.version}\n` +
            `**Name:** ${packageJSON.name}\n` +
            `**Description:** ${packageJSON.description}\n` +
            `**Author:** ${packageJSON.author}\n` +
            `**License:** ${packageJSON.license}\n\n`;
        
        // Only show detailed system information in non-production environments
        if (!isProduction) {
            versionInfo += `**Build Info:**\n` +
                `• Node.js: ${process.version}\n` +
                `• Platform: ${process.platform}\n` +
                `• Architecture: ${process.arch}\n` +
                `• Environment: ${process.env.NODE_ENV || 'development'}\n\n`;
        } else {
            versionInfo += `**Build Info:**\n` +
                `• Environment: Production\n\n`;
        }
        
        versionInfo += `**Repository:**\n` +
            `Check our GitHub for updates and documentation\n\n` +
            `Built with ❤️ by ${packageJSON.author}`;

        await ctx.reply(versionInfo, { parse_mode: 'Markdown' });
    }
}

export class AboutCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'about',
        description: 'Display detailed bot information and capabilities',
        usage: '/about'
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        const companyName = getCompanyName() || 'Support';
        const aboutMessage = `ℹ️ **About ${companyName} Support Bot**\n\n` +
            `This bot helps you create and manage support tickets efficiently. ` +
            `It integrates with our Unthread platform to provide seamless customer support.\n\n` +
            `**Key Features:**\n` +
            `• 🎫 Easy ticket creation with guided forms\n` +
            `• 📧 Email integration for updates\n` +
            `• 👥 Group chat support configuration\n` +
            `• 🔄 Real-time status updates\n` +
            `• 🛡️ Secure data handling\n` +
            `• 📱 Mobile-friendly interface\n\n` +
            `**How It Works:**\n` +
            `1. Start a conversation with /support\n` +
            `2. Fill out the guided form\n` +
            `3. Get instant ticket confirmation\n` +
            `4. Receive updates via Telegram and email\n\n` +
            `**Technology:**\n` +
            `• Built with TypeScript and Telegraf\n` +
            `• Powered by Unthread API\n` +
            `• Secure cloud infrastructure\n\n` +
            `**Need Help?**\n` +
            `Use /support to create a ticket or contact our team directly.\n\n` +
            `Version ${packageJSON.version} | Made with ❤️ by ${packageJSON.author}`;

        await ctx.reply(aboutMessage, { parse_mode: 'Markdown' });
    }
}
