/**
 * Support Command - Complete Clean Implementation
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js';
import type { BotContext } from '../../types/index.js';

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
        const welcomeMessage = 
            "🎫 **Create Support Ticket**\n\n" +
            "Welcome to the support system! This feature will be fully implemented " +
            "in the next phase of the clean architecture migration.\n\n" +
            "**Coming Soon:**\n" +
            "• Multi-step form wizard\n" +
            "• Email collection and validation\n" +
            "• Unthread API integration\n" +
            "• Ticket tracking and updates\n\n" +
            "*This demonstrates the clean command structure!*";

        await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    }
}
