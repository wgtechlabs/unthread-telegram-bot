/**
 * Set Email Command
 * 
 * Allows users to set or update their email address for support tickets.
 * Demonstrates proper user data management and validation patterns.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js';
import type { BotContext } from '../../types/index.js';
import { 
    deliverPendingAgentMessages, 
    formatEmailForDisplay, 
    getUserEmailPreferences,
    updateUserEmail,
    validateEmail
} from '../../utils/emailManager.js';
import { escapeMarkdown } from '../../utils/markdownEscape.js';
import { getMessageText } from '../../utils/messageContentExtractor.js';
import { LogEngine } from '@wgtechlabs/log-engine';

export class SetEmailCommand extends BaseCommand {
    readonly metadata: CommandMetadata = {
        name: 'setemail',
        description: 'Set or update your email address for support tickets',
        usage: '/setemail [email]',
        examples: [
            '/setemail - Start interactive email setup',
            '/setemail user@example.com - Set email directly'
        ],
        requiresSetup: false
    };

    protected async executeCommand(ctx: BotContext): Promise<void> {
        if (!ctx.from) {
            await ctx.reply("❌ Unable to process request. Please try again.");
            return;
        }

        const userId = ctx.from.id;
        
        // Extract email from command if provided
        const commandText = getMessageText(ctx);
        const emailMatch = commandText.match(/\/setemail(?:\s+(.+))?/);
        const providedEmail = emailMatch?.[1]?.trim();

        if (providedEmail) {
            // Direct email setting
            await this.setEmailDirectly(ctx, userId, providedEmail);
        } else {
            // Interactive email setup
            await this.startInteractiveSetup(ctx, userId);
        }
    }

    private async setEmailDirectly(ctx: BotContext, userId: number, email: string): Promise<void> {
        try {
            // Validate email
            const validation = validateEmail(email);
            
            if (!validation.isValid) {
                await ctx.reply(
                    `❌ **Invalid Email Format**\n\n${escapeMarkdown(validation.error || 'Please provide a valid email address.')}\n\n**Usage:** \`/setemail user@example.com\``,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // Update email
            LogEngine.info('Attempting to update user email', {
                userId,
                emailDomain: validation.sanitizedValue!.split('@')[1]
            });
            
            const updateResult = await updateUserEmail(userId, validation.sanitizedValue!);
            
            LogEngine.info('Email update result', {
                userId,
                success: updateResult.success,
                error: updateResult.error
            });
            
            if (!updateResult.success) {
                await ctx.reply(
                    `❌ **Failed to Update Email**\n\n${escapeMarkdown(updateResult.error || 'An unexpected error occurred.')}\n\nPlease try again later.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // Success message
            await ctx.reply(
                `✅ **Email Updated Successfully!**\n\n📧 **Email configured for support tickets**\n\nThis email will be used for all future support tickets. You can view your settings with \`/viewemail\` or change it anytime using \`/setemail\`.`,
                { parse_mode: 'Markdown' }
            );

            LogEngine.info('User updated email via direct command', {
                userId,
                emailDomain: validation.sanitizedValue!.split('@')[1]
            });

            // Phase 2: Deliver any pending agent messages now that user has valid email
            try {
                const deliveryResult = await deliverPendingAgentMessages(userId);
                
                if (deliveryResult.delivered > 0) {
                    await ctx.reply(
                        `🎯 **Pending Messages Delivered!**\n\n✅ ${deliveryResult.delivered} agent response(s) delivered\n\n_You can now continue your support conversations\\._`,
                        { parse_mode: 'Markdown' }
                    );
                    
                    LogEngine.info('Delivered pending agent messages after email setup', {
                        userId,
                        delivered: deliveryResult.delivered,
                        failed: deliveryResult.failed
                    });
                }
                
                if (deliveryResult.failed > 0) {
                    LogEngine.warn('Some pending messages failed to deliver', {
                        userId,
                        failed: deliveryResult.failed,
                        errors: deliveryResult.errors
                    });
                }
                
            } catch (error) {
                const err = error as Error;
                LogEngine.error('Error delivering pending messages after email setup', {
                    userId,
                    error: err.message
                });
                // Don't show error to user - the email was still set successfully
            }

        } catch (error) {
            LogEngine.error('Error in direct email setting', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            
            await ctx.reply(
                "❌ **Error updating email**\n\nAn unexpected error occurred. Please try again later.",
                { parse_mode: 'Markdown' }
            );
        }
    }

    private async startInteractiveSetup(ctx: BotContext, userId: number): Promise<void> {
        try {
            // Get current email preferences
            const currentPrefs = await getUserEmailPreferences(userId);
            
            let message = "📧 **Email Address Setup**\n\n";
            
            if (currentPrefs) {
                const displayEmail = formatEmailForDisplay(currentPrefs.email, currentPrefs.isDummy);
                message += `**Current email:** ${escapeMarkdown(displayEmail)}\n\n`;
                
                if (currentPrefs.isDummy) {
                    message += "💡 You're currently using a temporary email. Setting a real email will help our support team contact you directly.\n\n";
                }
                
                message += "**To update your email:**\n";
            } else {
                message += "**To set your email address:**\n";
            }
            
            message += "• Reply with your email address\n";
            message += "• Use `/setemail user@example.com` for quick setup\n";
            message += "• Use `/viewemail` to see current settings\n\n";
            message += "*Please enter your email address:*";

            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: "your@email.com"
                }
            });

            LogEngine.info('User started interactive email setup', { userId });

        } catch (error) {
            LogEngine.error('Error in interactive email setup', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            
            await ctx.reply(
                "❌ **Error starting email setup**\n\nPlease try again later or contact an administrator.",
                { parse_mode: 'Markdown' }
            );
        }
    }
}
