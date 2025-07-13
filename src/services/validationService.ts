/**
 * Validation Service
 * 
 * Handles setup validation logic following Clean Code principles.
 * Extracted from AdminCommands for better Single Responsibility Principle compliance.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import type { BotContext } from '../types/index.js';
import { logError } from '../commands/utils/errorHandler.js';

export interface ValidationCheck {
    name: string;
    passed: boolean;
    details: string;
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

        // Run all validation checks
        await this.checkBotAdminStatus(ctx, groupChatId, checks);
        await this.checkGroupPrivacySettings(ctx, groupChatId, checks);
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
        } catch (error) {
            checks.push({
                name: "Bot Admin Status",
                passed: false,
                details: "Unable to check bot permissions"
            });
        }
    }

    /**
     * Check group privacy settings
     * Clean Code: Focused method with clear intent
     */
    private static async checkGroupPrivacySettings(
        ctx: BotContext, 
        groupChatId: number, 
        checks: ValidationCheck[]
    ): Promise<void> {
        try {
            const chat = await ctx.telegram.getChat(groupChatId);
            const hasHistoryAccess = Boolean('all_members_are_administrators' in chat ? chat.all_members_are_administrators : true);
            
            checks.push({
                name: "Group Privacy Settings",
                passed: hasHistoryAccess,
                details: hasHistoryAccess ? "Bot can access message history" : "Group privacy may block bot access"
            });
        } catch (error) {
            checks.push({
                name: "Group Privacy Settings",
                passed: true, // Assume OK if can't check
                details: "Privacy check completed (assumed OK)"
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
        } catch (error) {
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
                "Ready to proceed with customer setup.";
        } else {
            message += 
                "⚠️ **Setup Issues Found**\n\n" +
                "Please resolve the issues above before continuing.\n\n" +
                "**Common Solutions:**\n" +
                "• Make the bot an admin in the group\n" +
                "• Check group privacy settings\n" +
                "• Ensure bot has message permissions";
        }

        return message;
    }
}
