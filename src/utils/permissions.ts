/**
 * Unthread Telegram Bot - Permission Management Utilities
 * 
 * Provides comprehensive permission validation and access control for bot administration.
 * This module handles user authorization, admin access validation, and permission-based
 * command execution control.
 * 
 * Core Features:
 * - Environment-based admin user validation
 * - Context-aware permission checking
 * - Detailed error messaging for unauthorized access
 * - Integration with Telegram bot context
 * 
 * Security:
 * - Admin user IDs are stored in environment variables (not database)
 * - Comprehensive logging for security audit trails
 * - Clear separation between admin and regular user capabilities
 * - Graceful handling of permission-related errors
 * 
 * Usage:
 * - Call validateAdminAccess() before executing admin commands
 * - Use requireAdminAccess() decorator for admin-only functions
 * - Check hasAdminAccess() for conditional UI elements
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { isAdminUser } from '../config/env.js';
import { safeReply } from '../bot.js';
import type { BotContext } from '../types/index.js';

/**
 * Validates that the current user has admin access and provides appropriate feedback if not.
 *
 * Checks if the user making the request is listed in the ADMIN_USERS environment variable.
 * If not authorized, sends an informative error message to the user explaining admin access requirements.
 *
 * @param ctx - The Telegram bot context containing user information
 * @returns True if the user is authorized as an admin, false otherwise
 */
export async function validateAdminAccess(ctx: BotContext): Promise<boolean> {
    if (!ctx.from) {
        LogEngine.warn('Permission check failed: No user information in context', {
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
        
        await safeReply(ctx, 
            "❌ **Error: Unable to verify user identity**\n\n" +
            "Please try again. If this error persists, contact support."
        );
        return false;
    }
    
    const telegramUserId = ctx.from.id;
    const isAuthorized = isAdminUser(telegramUserId);
    
    if (!isAuthorized) {
        LogEngine.warn('Unauthorized admin access attempt', {
            telegramUserId,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            chatId: ctx.chat?.id,
            chatType: ctx.chat?.type
        });
        
        await safeReply(ctx,
            "🔒 **Admin Access Required**\n\n" +
            "Only authorized bot administrators can run this command.\n\n" +
            "**If you should have access:**\n" +
            "• Contact your system administrator\n" +
            "• Verify your user ID is in the ADMIN_USERS configuration\n\n" +
            "**Your User ID:** `" + telegramUserId + "`\n" +
            "_(Share this with your admin for access setup)_"
        );
        return false;
    }
    
    LogEngine.info('Admin access granted', {
        telegramUserId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        chatId: ctx.chat?.id,
        chatType: ctx.chat?.type
    });
    
    return true;
}

/**
 * Checks if the current user has admin access without sending any messages.
 *
 * Useful for conditional UI elements or feature availability checks where you don't want
 * to notify the user about permission restrictions.
 *
 * @param ctx - The Telegram bot context containing user information
 * @returns True if the user is authorized as an admin, false otherwise
 */
export function hasAdminAccess(ctx: BotContext): boolean {
    if (!ctx.from) {
        return false;
    }
    
    return isAdminUser(ctx.from.id);
}

/**
 * Decorator function to require admin access for command functions.
 *
 * Wraps command handler functions to automatically validate admin access before execution.
 * If the user is not authorized, the wrapped function is not called and an error message is sent.
 *
 * @param commandHandler - The command handler function to protect with admin access
 * @returns A wrapped function that validates admin access before execution
 */
export function requireAdminAccess(commandHandler: (ctx: BotContext) => Promise<void>) {
    return async (ctx: BotContext): Promise<void> => {
        const hasAccess = await validateAdminAccess(ctx);
        
        if (!hasAccess) {
            // Error message already sent by validateAdminAccess
            return;
        }
        
        // User is authorized, proceed with the original command
        await commandHandler(ctx);
    };
}

/**
 * Gets the current user's admin status and user information for logging and display purposes.
 *
 * @param ctx - The Telegram bot context containing user information
 * @returns Object containing admin status and user details, or null if no user context
 */
export function getUserPermissionInfo(ctx: BotContext): {
    isAdmin: boolean;
    telegramUserId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
} | null {
    if (!ctx.from) {
        return null;
    }
    
    const result: {
        isAdmin: boolean;
        telegramUserId: number;
        username?: string;
        firstName?: string;
        lastName?: string;
    } = {
        isAdmin: isAdminUser(ctx.from.id),
        telegramUserId: ctx.from.id
    };
    
    if (ctx.from.username) result.username = ctx.from.username;
    if (ctx.from.first_name) result.firstName = ctx.from.first_name;
    if (ctx.from.last_name) result.lastName = ctx.from.last_name;
    
    return result;
}

/**
 * Logs permission-related events for security audit purposes.
 *
 * @param event - The type of permission event (e.g., 'admin_access_granted', 'unauthorized_attempt')
 * @param ctx - The Telegram bot context
 * @param command - The command or action that triggered the permission check (e.g., '/setup', 'bot_admin_check')
 * @param additionalData - Any additional data to include in the log
 */
export function logPermissionEvent(
    event: string,
    ctx: BotContext,
    command: string,
    additionalData: Record<string, any> = {}
): void {
    const userInfo = getUserPermissionInfo(ctx);
    
    LogEngine.info(`Permission event: ${event}`, {
        event,
        command,
        userInfo,
        chatId: ctx.chat?.id,
        chatType: ctx.chat?.type,
        timestamp: new Date().toISOString(),
        ...additionalData
    });
}
