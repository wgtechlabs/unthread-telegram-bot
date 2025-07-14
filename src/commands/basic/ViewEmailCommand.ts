/**
 * View Email Command
 * 
 * Displays user's current email settings and preferences.
 * Demonstrates proper information display and user privacy patterns.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js';
import type { BotContext } from '../../types/index.js';
import { 
    getUserEmailPreferences, 
    formatEmailForDisplay 
} from '../../utils/emailManager.js';
import { escapeMarkdown } from '../../utils/markdownEscape.js';
import { LogEngine } from '@wgtechlabs/log-engine';

export class ViewEmailCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'viewemail',
        description: 'View your current email settings',
        usage: '/viewemail',
        examples: [
            '/viewemail - Show current email settings'
        ],
        requiresSetup: false
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        if (!ctx.from) {
            await ctx.reply("❌ Unable to process request. Please try again.");
            return;
        }

        const userId = ctx.from.id;
        
        try {
            const emailPrefs = await getUserEmailPreferences(userId);
            
            if (!emailPrefs) {
                await this.showNoEmailMessage(ctx);
                return;
            }

            await this.showEmailSettings(ctx, emailPrefs);

        } catch (error) {
            LogEngine.error('Error in view email command', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            
            await ctx.reply(
                "❌ **Error retrieving email settings**\n\nPlease try again later.",
                { parse_mode: 'Markdown' }
            );
        }
    }

    private async showNoEmailMessage(ctx: BotContext): Promise<void> {
        const message = 
            "📧 **Email Settings**\n\n" +
            "❌ **No email address set**\n\n" +
            "You haven't set an email address yet. When you create support tickets, a temporary email will be used.\n\n" +
            "**Available actions:**\n" +
            "• `/setemail` - Set up your email address\n" +
            "• `/setemail user@example.com` - Quick email setup\n" +
            "• `/support` - Create a ticket (will prompt for email)\n\n" +
            "💡 *Setting a real email helps our support team contact you directly.*";

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📧 Set Email Now", callback_data: "email_setup_start" }
                    ]
                ]
            }
        });
    }

    private async showEmailSettings(ctx: BotContext, emailPrefs: any): Promise<void> {
        const displayEmail = formatEmailForDisplay(emailPrefs.email, emailPrefs.isDummy);
        const setDate = new Date(emailPrefs.setAt).toLocaleDateString();
        
        let message = "📧 **Email Settings**\n\n";
        message += `✅ **Email address:** ${escapeMarkdown(displayEmail)}\n`;
        message += `📅 **Set on:** ${setDate}\n`;
        
        if (emailPrefs.isDummy) {
            message += `🏷️ **Type:** Temporary email\n\n`;
            message += "💡 **About temporary emails:**\n";
            message += "• Used when you skip email setup\n";
            message += "• Allows ticket creation without personal email\n";
            message += "• Our support team can still help you\n";
            message += "• You can upgrade to a real email anytime\n\n";
            message += "**Recommended actions:**\n";
            message += "• `/setemail user@example.com` - Set real email\n";
            message += "• Keep temporary email if you prefer privacy\n";
        } else {
            message += `🏷️ **Type:** Personal email\n\n`;
            message += "✅ **Benefits of having a real email:**\n";
            message += "• Direct communication with support team\n";
            message += "• Ticket updates and notifications\n";
            message += "• Better support experience\n\n";
            message += "**Available actions:**\n";
            message += "• `/setemail newuser@example.com` - Update email\n";
            message += "• Email is automatically used in new tickets\n";
        }

        const buttons = emailPrefs.isDummy 
            ? [
                [{ text: "📧 Set Real Email", callback_data: "email_setup_real" }],
                [{ text: "🔄 Generate New Temporary", callback_data: "email_setup_new_temp" }]
              ]
            : [
                [{ text: "📝 Update Email", callback_data: "email_setup_update" }]
              ];

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: buttons
            }
        });

        LogEngine.info('User viewed email settings', {
            userId: ctx.from?.id,
            hasRealEmail: !emailPrefs.isDummy,
            emailDomain: emailPrefs.email.split('@')[1]
        });
    }
}
