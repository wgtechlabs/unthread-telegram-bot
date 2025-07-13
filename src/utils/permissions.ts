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

import { LogEngine } from '@wgtechlabs/log-engine'
import { isAdminUser } from '../config/env.js'
import { safeReply } from '../bot.js'
import type { BotContext } from '../types/index.js'

/**
 * Checks if the current user has admin access and sends feedback if access is denied.
 *
 * If the user is not authorized or user information is missing, sends an appropriate error message to the user and returns false. Returns true if the user is an authorized admin.
 *
 * @param ctx - Telegram bot context containing user information
 * @returns True if the user is an authorized admin, false otherwise
 */
export async function validateAdminAccess(ctx: BotContext): Promise<boolean> {
  if (!ctx.from) {
    LogEngine.warn('Permission check failed: No user information in context', {
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type,
    })

    await safeReply(
      ctx,
      '❌ **Error: Unable to verify user identity**\n\n' +
        'Please try again. If this error persists, contact support.'
    )
    return false
  }

  const telegramUserId = ctx.from.id
  const isAuthorized = isAdminUser(telegramUserId)

  if (!isAuthorized) {
    LogEngine.warn('Unauthorized admin access attempt', {
      telegramUserId,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type,
    })

    await safeReply(
      ctx,
      '🔒 **Admin Access Required**\n\n' +
        'Only authorized bot administrators can run this command.\n\n' +
        '**If you should have access:**\n' +
        '• Contact your system administrator\n' +
        '• Verify your user ID is in the ADMIN_USERS configuration\n\n' +
        '**Your User ID:** `' +
        telegramUserId +
        '`\n' +
        '_(Share this with your admin for access setup)_'
    )
    return false
  }

  LogEngine.info('Admin access granted', {
    telegramUserId,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    chatId: ctx.chat?.id,
    chatType: ctx.chat?.type,
  })

  return true
}

/**
 * Determines whether the user in the given Telegram bot context is an admin.
 *
 * Returns true if the user's Telegram ID is listed as an admin; otherwise, returns false. Does not send any messages or notifications.
 *
 * @returns True if the user has admin privileges, false otherwise.
 */
export function hasAdminAccess(ctx: BotContext): boolean {
  if (!ctx.from) {
    return false
  }

  return isAdminUser(ctx.from.id)
}

/**
 * Wraps a command handler to enforce admin access validation before execution.
 *
 * Prevents execution of the command handler if the user is not an authorized admin, sending an error message automatically.
 *
 * @returns A function that checks admin access and executes the command handler only if access is granted.
 */
export function requireAdminAccess(
  commandHandler: (ctx: BotContext) => Promise<void>
) {
  return async (ctx: BotContext): Promise<void> => {
    const hasAccess = await validateAdminAccess(ctx)

    if (!hasAccess) {
      // Error message already sent by validateAdminAccess
      return
    }

    // User is authorized, proceed with the original command
    await commandHandler(ctx)
  }
}

/**
 * Returns the user's admin status and identifying information from the Telegram bot context.
 *
 * If user information is unavailable in the context, returns null. Otherwise, provides an object with admin status, Telegram user ID, and available username, first name, and last name.
 *
 * @returns An object with admin status and user details, or null if user information is missing
 */
export function getUserPermissionInfo(ctx: BotContext): {
  isAdmin: boolean
  telegramUserId: number
  username?: string
  firstName?: string
  lastName?: string
} | null {
  if (!ctx.from) {
    return null
  }

  const result: {
    isAdmin: boolean
    telegramUserId: number
    username?: string
    firstName?: string
    lastName?: string
  } = {
    isAdmin: isAdminUser(ctx.from.id),
    telegramUserId: ctx.from.id,
  }

  if (ctx.from.username) result.username = ctx.from.username
  if (ctx.from.first_name) result.firstName = ctx.from.first_name
  if (ctx.from.last_name) result.lastName = ctx.from.last_name

  return result
}

/**
 * Logs a permission-related event with user and chat context for auditing purposes.
 *
 * @param event - The type of permission event (e.g., 'admin_access_granted', 'unauthorized_attempt')
 * @param command - The command or action that triggered the permission check
 * @param additionalData - Optional extra data to include in the log entry
 */
export function logPermissionEvent(
  event: string,
  ctx: BotContext,
  command: string,
  additionalData: Record<string, any> = {}
): void {
  const userInfo = getUserPermissionInfo(ctx)

  LogEngine.info(`Permission event: ${event}`, {
    event,
    command,
    userInfo,
    chatId: ctx.chat?.id,
    chatType: ctx.chat?.type,
    timestamp: new Date().toISOString(),
    ...additionalData,
  })
}
