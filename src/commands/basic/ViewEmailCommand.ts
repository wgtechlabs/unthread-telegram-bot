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
import { type UserEmailPreferences, getUserEmailPreferences } from '../../utils/emailManager.js';
import { formatEmailForDisplay } from '../../utils/markdownEscape.js';
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
            LogEngine.info('ViewEmailCommand executed', { userId });
            
            const emailPrefs = await getUserEmailPreferences(userId);
            
            LogEngine.info('Email preferences retrieved', {
                userId,
                hasPrefs: !!emailPrefs,
                email: emailPrefs?.email,
                isDummy: emailPrefs?.isDummy
            });
            
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
            "You haven't set an email address yet. When you create support tickets, a temporary email will be generated automatically.\n\n" +
            "**Available actions:**\n" +
            "• `/setemail` - Start interactive email setup\n" +
            "• `/setemail waren@wgtechlabs.com` - Set email directly\n" +
            "• `/support` - Create a ticket (will prompt for email if needed)\n\n" +
            "💡 *Setting a real email helps our support team contact you directly and improves your support experience.*";

        await ctx.reply(message, {
            parse_mode: 'Markdown'
        });
        
        LogEngine.info('Showed no email message to user', { userId: ctx.from?.id });
    }

    private async showEmailSettings(ctx: BotContext, emailPrefs: UserEmailPreferences): Promise<void> {
        const setDate = new Date(emailPrefs.setAt).toLocaleDateString();
        
        let message = "📧 **Email Settings**\n\n";
        message += `✅ **Email address:** ${formatEmailForDisplay(emailPrefs.email)}\n`;
        message += `📅 **Set on:** ${setDate}\n`;
        
        if (emailPrefs.isDummy) {
            message += `🏷️ **Type:** Temporary email\n\n`;
            message += "💡 **About temporary emails:**\n";
            message += "• Used when you skip email setup\n";
            message += "• Allows ticket creation without personal email\n";
            message += "• Our support team can still help you\n";
            message += "• You can upgrade to a real email anytime\n\n";
            message += "**Recommended actions:**\n";
            message += "• `/setemail opensource@warengonzaga.com` - Set real email\n";
            message += "• Keep temporary email if you prefer privacy\n";
        } else {
            message += `🏷️ **Type:** Personal email\n\n`;
            message += "✅ **Benefits of having a real email:**\n";
            message += "• Direct communication with support team\n";
            message += "• Ticket updates and notifications\n";
            message += "• Better support experience\n\n";
            message += "**Available actions:**\n";
            message += "• `/setemail waren@wgtechlabs.com` - Update email\n";
            message += "• Email is automatically used in new tickets\n";
        }

        await ctx.reply(message, {
            parse_mode: 'Markdown'
        });

        LogEngine.info('User viewed email settings', {
            userId: ctx.from?.id,
            hasRealEmail: !emailPrefs.isDummy,
            emailDomain: emailPrefs.email.split('@')[1]
        });
    }
}
