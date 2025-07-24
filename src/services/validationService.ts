/**
 * Validation Service
 * 
 * Handles setup validation logic following Clean Code principles.
 * Extracted from AdminCommands for better Single Responsibility Principle compliance.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import type { BotContext } from '../types/index.js';

export interface ValidationCheck {
    name: string;
    passed: boolean;
    details: string;
    warning?: boolean;
}

export interface ValidationResult {
    checks: ValidationCheck[];
    allPassed: boolean;
    message: string;
}

/**
 * Service class for performing setup validation
 * Clean Code: Single Responsibility - only handles validation logic
 */
export class ValidationService {
    /**
     * Perform comprehensive setup validation
     * Clean Code: Small function that orchestrates other focused methods
     */
    static async performSetupValidation(
        ctx: BotContext, 
        groupChatId: number, 
        groupTitle: string
    ): Promise<ValidationResult> {
        const checks: ValidationCheck[] = [];
        let allPassed = true;

        // Run essential validation checks
        await this.checkBotAdminStatus(ctx, groupChatId, checks);
        await this.checkMessageSendingCapability(ctx, groupChatId, checks);

        // Determine if all checks passed
        allPassed = checks.every(check => check.passed);

        // Build validation message
        const message = this.buildValidationMessage(groupTitle, groupChatId, checks, allPassed);

        return {
            checks,
            allPassed,
            message
        };
    }

    /**
     * Check if bot has admin status in the group
     * Clean Code: Single purpose method with descriptive name
     */
    private static async checkBotAdminStatus(
        ctx: BotContext, 
        groupChatId: number, 
        checks: ValidationCheck[]
    ): Promise<void> {
        try {
            const botUser = await ctx.telegram.getMe();
            const chatMember = await ctx.telegram.getChatMember(groupChatId, botUser.id);
            const isBotAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
            
            checks.push({
                name: "Bot Admin Status",
                passed: isBotAdmin,
                details: isBotAdmin ? "Bot has admin privileges" : "Bot needs admin privileges"
            });
        } catch (_error) {
            checks.push({
                name: "Bot Admin Status",
                passed: false,
                details: "Unable to check bot permissions"
            });
        }
    }

    /**
     * Check if bot can send messages to the group
     * Clean Code: Clear method purpose and error handling  
     */
    private static async checkMessageSendingCapability(
        ctx: BotContext, 
        groupChatId: number, 
        checks: ValidationCheck[]
    ): Promise<void> {
        try {
            await ctx.telegram.sendChatAction(groupChatId, 'typing');
            checks.push({
                name: "Message Sending",
                passed: true,
                details: "Bot can send messages to group"
            });
        } catch (_error) {
            checks.push({
                name: "Message Sending",
                passed: false,
                details: "Bot cannot send messages to group"
            });
        }
    }

    /**
     * Build formatted validation message
     * Clean Code: Pure function with clear output format
     */
    private static buildValidationMessage(
        groupTitle: string,
        groupChatId: number,
        checks: ValidationCheck[],
        allPassed: boolean
    ): string {
        let message = 
            "🔍 **Setup Validation Results**\n\n" +
            `**Group:** ${groupTitle}\n` +
            `**Chat ID:** \`${groupChatId}\`\n\n` +
            "**Validation Checks:**\n\n";

        // Add check results
        for (const check of checks) {
            const icon = check.passed ? "✅" : "❌";
            message += `${icon} **${check.name}**\n`;
            message += `   ${check.details}\n\n`;
        }

        // Add final status
        if (allPassed) {
            message += 
                "🎉 **All Checks Passed!**\n\n" +
                "✅ Bot has administrative privileges\n" +
                "✅ Bot can communicate with the group\n" +
                "✅ Setup requirements are satisfied\n\n" +
                "Ready to proceed with customer configuration.";
        } else {
            const hasFailedChecks = checks.some(check => !check.passed && !check.warning);
            const hasWarnings = checks.some(check => check.warning);
            
            if (hasFailedChecks) {
                message += 
                    "❌ **Setup Requirements Not Met**\n\n" +
                    "Please resolve these critical issues:\n\n" +
                    "**Required Actions:**\n" +
                    "• Make the bot an administrator in the group\n" +
                    "• Ensure the bot hasn't been restricted or blocked\n" +
                    "• Verify the group allows bots to send messages\n\n" +
                    "After making changes, use 🔄 **Retry Validation** to check again.";
            } else if (hasWarnings) {
                message += 
                    "⚠️ **Minor Issues Detected**\n\n" +
                    "Setup can proceed, but some optimizations are recommended.\n" +
                    "These warnings won't prevent functionality but may affect performance.";
            }
        }

        return message;
    }
}
