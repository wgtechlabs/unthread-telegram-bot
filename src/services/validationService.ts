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
    warning?: boolean;
}

export interface ValidationResult {
    checks: ValidationCheck[];
    allPassed: boolean;
    message: string;
}

/**
 * Interface representing the admin-specific properties of a chat member
 * Based on Telegram Bot API ChatMemberAdministrator type
 */
export interface AdminChatMember {
    status: 'administrator';
    can_read_all_group_messages?: boolean;
    can_send_messages?: boolean;
    can_delete_messages?: boolean;
    can_restrict_members?: boolean;
    can_promote_members?: boolean;
    can_change_info?: boolean;
    can_invite_users?: boolean;
    can_pin_messages?: boolean;
    can_manage_topics?: boolean;
    can_manage_chat?: boolean;
    can_manage_video_chats?: boolean;
}

/**
 * Type guard to check if a chat member is an administrator with admin properties
 */
function isAdminChatMember(member: any): member is AdminChatMember {
    return member && member.status === 'administrator';
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
     * Check group privacy settings with comprehensive permission validation
     * Clean Code: Focused method with clear intent and robust permission checking
     */
    private static async checkGroupPrivacySettings(
        ctx: BotContext, 
        groupChatId: number, 
        checks: ValidationCheck[]
    ): Promise<void> {
        try {
            const chat = await ctx.telegram.getChat(groupChatId);
            
            // First check if it's a group chat
            const isGroupChat = chat.type === 'group' || chat.type === 'supergroup';
            
            if (!isGroupChat) {
                checks.push({
                    name: "Group Privacy Settings",
                    passed: false,
                    details: "Chat is not a group or supergroup"
                });
                return;
            }

            // Get bot's membership information to check actual permissions
            try {
                const botInfo = await ctx.telegram.getMe();
                const botMember = await ctx.telegram.getChatMember(groupChatId, botInfo.id);
                
                // Check if bot is properly added to the group
                const isMember = botMember.status === 'member' || 
                               botMember.status === 'administrator' || 
                               botMember.status === 'creator';
                
                if (!isMember) {
                    checks.push({
                        name: "Group Privacy Settings",
                        passed: false,
                        details: "Bot is not a member of the group"
                    });
                    return;
                }

                // Check specific permissions for administrators
                let hasRequiredPermissions = true;
                let permissionDetails = `Bot is a ${botMember.status}`;
                
                if (isAdminChatMember(botMember)) {
                    // Type-safe access to admin-specific properties
                    const adminPermissions = [
                        { key: 'can_read_all_group_messages' as keyof AdminChatMember, desc: 'read messages', required: true },
                        { key: 'can_send_messages' as keyof AdminChatMember, desc: 'send messages', required: true },
                        { key: 'can_delete_messages' as keyof AdminChatMember, desc: 'delete messages', required: false }
                    ];
                    
                    const missingPermissions: string[] = [];
                    
                    adminPermissions.forEach(perm => {
                        if (perm.required && !botMember[perm.key]) {
                            hasRequiredPermissions = false;
                            missingPermissions.push(perm.desc);
                        }
                    });
                    
                    if (missingPermissions.length > 0) {
                        permissionDetails += ` but missing required permissions: ${missingPermissions.join(', ')}`;
                    } else {
                        permissionDetails += ' with all required permissions';
                    }
                }
                
                // For supergroups, provide additional context about message history
                if (chat.type === 'supergroup') {
                    permissionDetails += '. Message history access depends on group settings';
                }
                
                const checkResult: ValidationCheck = {
                    name: "Group Privacy Settings",
                    passed: hasRequiredPermissions && isMember,
                    details: permissionDetails
                };
                
                if (!hasRequiredPermissions) {
                    checkResult.warning = true;
                }
                
                checks.push(checkResult);
                
            } catch (memberError) {
                // If we can't get member info, the bot likely doesn't have access
                checks.push({
                    name: "Group Privacy Settings",
                    passed: false,
                    warning: true,
                    details: "Cannot verify bot permissions - bot may not have proper access to the group"
                });
            }
            
        } catch (error) {
            checks.push({
                name: "Group Privacy Settings",
                passed: false,
                warning: true,
                details: "Privacy check failed or could not be verified"
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
