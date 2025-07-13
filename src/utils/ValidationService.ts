import { BotContext } from '../types';

interface ValidationCheck {
    name: string;
    passed: boolean;
    details: string;
    warning?: boolean;
}

interface ValidationResult {
    allPassed: boolean;
    checks: ValidationCheck[];
    message: string;
}

/**
 * ValidationService - Clean Code Service for Setup Validation
 * 
 * Extracted from AdminCommands to follow Single Responsibility Principle.
 * Handles all bot setup validation logic with clear separation of concerns.
 */
export class ValidationService {
    /**
     * Performs comprehensive setup validation for bot configuration
     * @param ctx Bot context
     * @param groupChatId Target group chat ID
     * @param groupTitle Target group title
     * @returns Validation result with detailed checks
     */
    public static async performSetupValidation(
        ctx: BotContext, 
        groupChatId: number, 
        groupTitle: string
    ): Promise<ValidationResult> {
        const checks: ValidationCheck[] = [];
        let allPassed = true;

        // Perform all validation checks
        const adminCheck = await this.checkBotAdminStatus(ctx, groupChatId);
        const privacyCheck = await this.checkGroupPrivacySettings(ctx, groupChatId);
        const messagingCheck = await this.checkMessageCapabilities(ctx, groupChatId);

        checks.push(adminCheck, privacyCheck, messagingCheck);
        allPassed = checks.every(check => check.passed);

        // Build comprehensive validation message
        const message = this.buildValidationMessage(groupTitle, groupChatId, checks, allPassed);

        return {
            allPassed,
            checks,
            message
        };
    }

    /**
     * Checks if bot has admin privileges in the target group
     */
    private static async checkBotAdminStatus(ctx: BotContext, groupChatId: number): Promise<ValidationCheck> {
        try {
            const botUser = await ctx.telegram.getMe();
            const chatMember = await ctx.telegram.getChatMember(groupChatId, botUser.id);
            const isBotAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
            
            return {
                name: "Bot Admin Status",
                passed: isBotAdmin,
                details: isBotAdmin ? "Bot has admin privileges" : "Bot needs admin privileges"
            };
        } catch (error) {
            return {
                name: "Bot Admin Status",
                passed: false,
                details: "Unable to check bot permissions"
            };
        }
    }

    /**
     * Validates group privacy settings for bot access
     */
    private static async checkGroupPrivacySettings(ctx: BotContext, groupChatId: number): Promise<ValidationCheck> {
        try {
            const chat = await ctx.telegram.getChat(groupChatId);
            
            // Check bot permissions in the group instead of using deprecated property
            const botUser = await ctx.telegram.getMe();
            const botMember = await ctx.telegram.getChatMember(groupChatId, botUser.id);
            
            // Check if bot has necessary permissions for message history access
            const hasMessagePermissions = botMember.status === 'administrator' || 
                                        botMember.status === 'creator' ||
                                        (botMember.status === 'member' && 
                                         'can_read_all_group_messages' in botMember && 
                                         Boolean((botMember as any).can_read_all_group_messages));
            
            return {
                name: "Group Privacy Settings",
                passed: hasMessagePermissions,
                details: hasMessagePermissions ? "Bot can access message history" : "Bot may need admin rights for full access"
            };
        } catch (error) {
            return {
                name: "Group Privacy Settings",
                passed: false,
                warning: true,
                details: "Privacy check could not be verified - manual verification recommended"
            };
        }
    }

    /**
     * Tests bot's ability to send messages to the group
     */
    private static async checkMessageCapabilities(ctx: BotContext, groupChatId: number): Promise<ValidationCheck> {
        try {
            await ctx.telegram.sendChatAction(groupChatId, 'typing');
            return {
                name: "Message Sending",
                passed: true,
                details: "Bot can send messages to group"
            };
        } catch (error) {
            return {
                name: "Message Sending",
                passed: false,
                details: "Bot cannot send messages to group"
            };
        }
    }

    /**
     * Builds comprehensive validation result message
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

        // Add conclusion
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
