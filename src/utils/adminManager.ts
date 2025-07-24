/**
 * Admin Management Utilities
 * 
 * Utility functions for managing admin profiles, validation, and setup sessions
 * for the Unthread Telegram Bot.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc1
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { isAdminUser } from '../config/env.js';
import { BotsStore } from '../sdk/bots-brain/index.js';
import type { AdminProfile, DmSetupSession, SetupSession } from '../sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Type alias for a function that sends a message to a specific chat ID
 */
export type SendMessageFunction = (_chatId: number, _message: string) => Promise<void>;

/**
 * Determines whether the specified Telegram user ID is listed as an admin in the environment configuration.
 *
 * @param telegramUserId - The Telegram user ID to check
 * @returns True if the user ID is recognized as an admin; otherwise, false
 */
export function isValidAdmin(telegramUserId: number): boolean {
  return isAdminUser(telegramUserId);
}

/**
 * Determines whether the specified admin has an activated profile for direct message access.
 *
 * @param telegramUserId - The Telegram user ID of the admin to check
 * @returns True if the admin's profile exists and is activated; otherwise, false
 */
export async function isActivatedAdmin(telegramUserId: number): Promise<boolean> {
  try {
    const adminProfile = await BotsStore.getAdminProfile(telegramUserId);
    return adminProfile?.isActivated === true;
  } catch (error) {
    LogEngine.error('Error checking admin activation status', {
      error: (error as Error).message,
      telegramUserId
    });
    return false;
  }
}

/**
 * Determines whether an admin is eligible to start a new setup session by verifying that no active session currently exists for the admin.
 *
 * @param adminId - The Telegram user ID of the admin to check
 * @returns `true` if the admin has no active setup session; otherwise, `false`
 */
export async function canStartSetup(adminId: number): Promise<boolean> {
  try {
    const existingSession = await BotsStore.getActiveSetupSessionByAdmin(adminId);
    return !existingSession;
  } catch (error) {
    LogEngine.error('Error checking setup session availability', {
      error: (error as Error).message,
      adminId
    });
    return false;
  }
}

/**
 * Creates and stores an activated admin profile for DM access.
 *
 * Initializes the admin profile with activation and last active timestamps, and optionally includes the Telegram username.
 *
 * @param telegramUserId - The Telegram user ID of the admin
 * @param dmChatId - The direct message chat ID for the admin
 * @param username - Optional Telegram username of the admin
 * @returns True if the profile was created successfully; otherwise, false
 */
export async function createAdminProfile(telegramUserId: number, dmChatId: number, username?: string): Promise<boolean> {
  try {
    const adminProfile: AdminProfile = {
      telegramUserId,
      dmChatId,
      isActivated: true,
      activatedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };
    
    if (username) {
      adminProfile.telegramUsername = username;
    }

    const success = await BotsStore.storeAdminProfile(adminProfile);
    
    if (success) {
      LogEngine.info('Admin profile created successfully', {
        telegramUserId,
        username,
        dmChatId
      });
    }

    return success;
  } catch (error) {
    LogEngine.error('Error creating admin profile', {
      error: (error as Error).message,
      telegramUserId,
      username
    });
    return false;
  }
}

/**
 * Updates the last active timestamp for the specified admin profile.
 *
 * @param telegramUserId - The Telegram user ID of the admin whose activity timestamp is updated
 */
export async function updateAdminLastActive(telegramUserId: number): Promise<void> {
  try {
    await BotsStore.updateAdminProfile(telegramUserId, {
      lastActiveAt: new Date().toISOString()
    });
  } catch (error) {
    LogEngine.error('Error updating admin last active time', {
      error: (error as Error).message,
      telegramUserId
    });
  }
}

/**
 * Creates a new setup session for a group chat with a 3-minute expiration and initial step set to 'customer_selection'.
 *
 * @param groupChatId - The unique identifier of the group chat where the setup is initiated
 * @param groupChatName - The display name of the group chat
 * @param initiatingAdminId - The Telegram user ID of the admin starting the setup session
 * @returns The session ID if creation succeeds, or null if the session could not be created
 */
export async function createSetupSession(
  groupChatId: number, 
  groupChatName: string, 
  initiatingAdminId: number
): Promise<string | null> {
  try {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes from now

    const session: SetupSession = {
      groupChatId,
      groupChatName,
      initiatingAdminId,
      sessionId,
      status: 'in_progress',
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      currentStep: 'customer_selection'
    };

    const success = await BotsStore.storeSetupSession(session);
    
    if (success) {
      LogEngine.info('Setup session created successfully', {
        sessionId,
        groupChatId,
        groupChatName,
        initiatingAdminId,
        expiresAt: expiresAt.toISOString()
      });
      return sessionId;
    }

    return null;
  } catch (error) {
    LogEngine.error('Error creating setup session', {
      error: (error as Error).message,
      groupChatId,
      initiatingAdminId
    });
    return null;
  }
}

/**
 * Sends a message to all activated admins except the initiating admin using a provided sendMessage function.
 *
 * @param initiatingAdminId - The Telegram user ID of the admin initiating the notification
 * @param message - The message text to send to other admins
 * @param sendMessage - A function to send a message to a specific chat ID
 */
export async function notifyOtherAdmins(
  initiatingAdminId: number, 
  message: string,
  sendMessage: SendMessageFunction
): Promise<void> {
  try {
    const activatedAdmins = await getActivatedAdmins();
    
    for (const admin of activatedAdmins) {
      if (admin.telegramUserId !== initiatingAdminId) {
        try {
          await sendMessage(admin.dmChatId, message);
          LogEngine.info('Notification sent to admin', {
            adminId: admin.telegramUserId,
            initiatingAdminId
          });
        } catch (error) {
          LogEngine.error('Failed to send notification to admin', {
            error: (error as Error).message,
            adminId: admin.telegramUserId,
            initiatingAdminId
          });
        }
      }
    }
  } catch (error) {
    LogEngine.error('Error in notifyOtherAdmins', {
      error: (error as Error).message,
      initiatingAdminId
    });
  }
}

/**
 * Determines whether a setup session has expired based on its expiration timestamp.
 *
 * @returns `true` if the session is expired; otherwise, `false`.
 */
export function isSessionExpired(session: SetupSession): boolean {
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  return now > expiresAt;
}

/**
 * Removes expired setup sessions from storage and returns the number of sessions cleaned up.
 *
 * @returns The count of expired sessions that were removed. Returns 0 if an error occurs.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    return await BotsStore.cleanupExpiredSessions();
  } catch (error) {
    LogEngine.error('Error cleaning up expired sessions', {
      error: (error as Error).message
    });
    return 0;
  }
}

/**
 * Returns the remaining time in minutes before a setup session expires.
 *
 * @param session - The setup session to check
 * @returns The number of minutes remaining until expiration, or 0 if expired
 */
export function getSessionTimeRemaining(session: SetupSession): number {
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  const remainingMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / (1000 * 60)));
}

// ================================
// DM Setup Session Management
// ================================

/**
 * Creates a new direct message (DM) setup session for an admin in a group, with a 20-minute expiration.
 *
 * @param adminId - The Telegram user ID of the admin initiating the session
 * @param groupChatId - The group chat ID associated with the setup session
 * @param groupChatName - The name of the group chat
 * @returns The session ID if creation succeeds, or null if it fails
 */
export async function createDmSetupSession(
  adminId: number, 
  groupChatId: number, 
  groupChatName: string
): Promise<string | null> {
  try {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes for DM sessions (extended for complex flows)

    const dmSession: DmSetupSession = {
      sessionId,
      adminId,
      groupChatId,
      groupChatName,
      status: 'active',
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      currentStep: 'welcome',
      stepData: {},
      messageIds: []
    };

    const success = await BotsStore.storeDmSetupSession(dmSession);
    if (success) {
      LogEngine.info('DM setup session created', {
        sessionId,
        adminId,
        groupChatId,
        groupChatName
      });
      return sessionId;
    } else {
      LogEngine.error('Failed to store DM setup session');
      return null;
    }
  } catch (error) {
    LogEngine.error('Error creating DM setup session', {
      error: (error as Error).message,
      adminId,
      groupChatId
    });
    return null;
  }
}

/**
 * Determines whether an admin is eligible to start a new DM setup session.
 *
 * Returns `true` if the admin does not have an active DM setup session; otherwise, returns `false`.
 */
export async function canStartDmSetup(adminId: number): Promise<boolean> {
  try {
    const existingSession = await BotsStore.getActiveDmSetupSessionByAdmin(adminId);
    return !existingSession;
  } catch (error) {
    LogEngine.error('Error checking DM setup session availability', {
      error: (error as Error).message,
      adminId
    });
    return false;
  }
}

/**
 * Determines whether a DM setup session has expired based on its expiration timestamp.
 *
 * @returns `true` if the session has expired; otherwise, `false`.
 */
export function isDmSessionExpired(session: DmSetupSession): boolean {
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  return now > expiresAt;
}

/**
 * Returns the remaining time in minutes before a DM setup session expires.
 *
 * @param session - The DM setup session to check
 * @returns The number of minutes remaining until expiration, or 0 if expired
 */
export function getDmSessionTimeRemaining(session: DmSetupSession): number {
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  const remainingMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / (1000 * 60)));
}

/**
 * Updates the current step and optional step data of a DM setup session.
 *
 * @param sessionId - The unique identifier of the DM setup session
 * @param step - The new step to set for the session
 * @param stepData - Optional data associated with the new step
 * @returns True if the session was successfully updated; otherwise, false
 */
export async function updateDmSetupSessionStep(
  sessionId: string, 
  step: string, 
  stepData?: Record<string, any>
): Promise<boolean> {
  try {
    const updates: Partial<DmSetupSession> = {
      currentStep: step
    };

    if (stepData) {
      updates.stepData = stepData;
    }

    const success = await BotsStore.updateDmSetupSession(sessionId, updates);
    if (success) {
      LogEngine.info('DM setup session step updated', {
        sessionId,
        step,
        stepData
      });
    }
    return success;
  } catch (error) {
    LogEngine.error('Error updating DM setup session step', {
      error: (error as Error).message,
      sessionId,
      step
    });
    return false;
  }
}

/**
 * Appends a message ID to the list of message IDs tracked in a DM setup session.
 *
 * @param sessionId - The identifier of the DM setup session
 * @param messageId - The message ID to add for tracking
 * @returns True if the message ID was successfully added; otherwise, false
 */
export async function addDmSessionMessageId(sessionId: string, messageId: number): Promise<boolean> {
  try {
    const session = await BotsStore.getDmSetupSession(sessionId);
    if (!session) {
      LogEngine.warn('DM setup session not found when adding message ID', {
        sessionId,
        messageId,
        operation: 'addDmSessionMessageId',
        reason: 'session_not_found'
      });
      return false;
    }

    const messageIds = session.messageIds || [];
    messageIds.push(messageId);

    return await BotsStore.updateDmSetupSession(sessionId, { messageIds });
  } catch (error) {
    LogEngine.error('Error adding message ID to DM session', {
      error: (error as Error).message,
      sessionId,
      messageId
    });
    return false;
  }
}

/**
 * Marks a DM setup session as completed by updating its status and current step.
 *
 * @param sessionId - The unique identifier of the DM setup session to complete
 * @returns True if the session was successfully marked as completed; otherwise, false
 */
export async function completeDmSetupSession(sessionId: string): Promise<boolean> {
  try {
    const success = await BotsStore.updateDmSetupSession(sessionId, {
      status: 'completed',
      currentStep: 'completed'
    });

    if (success) {
      LogEngine.info('DM setup session completed', { sessionId });
    }
    return success;
  } catch (error) {
    LogEngine.error('Error completing DM setup session', {
      error: (error as Error).message,
      sessionId
    });
    return false;
  }
}

/**
 * Cancels a DM setup session by updating its status and current step to 'cancelled'.
 *
 * @param sessionId - The identifier of the DM setup session to cancel
 * @returns True if the session was successfully cancelled; otherwise, false
 */
export async function cancelDmSetupSession(sessionId: string): Promise<boolean> {
  try {
    const success = await BotsStore.updateDmSetupSession(sessionId, {
      status: 'cancelled',
      currentStep: 'cancelled'
    });

    if (success) {
      LogEngine.info('DM setup session cancelled', { sessionId });
    }
    return success;
  } catch (error) {
    LogEngine.error('Error cancelling DM setup session', {
      error: (error as Error).message,
      sessionId
    });
    return false;
  }
}

/**
 * Admin Notification System
 * 
 * Functions to notify all activated admins of configuration changes,
 * template updates, and other important events.
 */


interface NotificationContext {
  groupId: number;
  groupTitle?: string;
  adminName?: string;
  changeType: string;
  changeDetails?: string;
  timestamp: string;
}

/**
 * Retrieves all activated admin profiles.
 *
 * @param groupChatId - Optional group chat ID for logging context
 * @returns An array of admin profiles that are marked as activated
 */
export async function getActivatedAdmins(groupChatId?: number): Promise<AdminProfile[]> {
  try {
    const allAdmins = await BotsStore.getAllAdminProfiles();
    return allAdmins.filter(admin => admin.isActivated);
  } catch (error) {
    LogEngine.error('Error fetching activated admins', {
      error: (error as Error).message,
      groupChatId
    });
    return [];
  }
}

/**
 * Sends a formatted notification message to an admin's direct message chat.
 *
 * Skips sending if the admin does not have a DM chat ID. Returns true if the message was sent successfully, or false if skipped or an error occurred.
 *
 * @param adminProfile - The admin's profile containing DM chat information
 * @param messageText - The message to send, formatted as HTML
 * @returns True if the notification was sent, false otherwise
 */
async function sendNotificationToAdmin(
  adminProfile: AdminProfile, 
  messageText: string,
  bot: any
): Promise<boolean> {
  try {
    if (!adminProfile.dmChatId) {
      LogEngine.warn('Admin has no DM chat ID, skipping notification', {
        adminId: adminProfile.telegramUserId
      });
      return false;
    }

    await bot.sendMessage(adminProfile.dmChatId, messageText, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    });
    
    LogEngine.info('Notification sent to admin', {
      adminId: adminProfile.telegramUserId,
      dmChatId: adminProfile.dmChatId
    });
    return true;
  } catch (error) {
    LogEngine.error('Failed to send notification to admin', {
      error: (error as Error).message,
      adminId: adminProfile.telegramUserId,
      dmChatId: adminProfile.dmChatId
    });
    return false;
  }
}

/**
 * Notifies all activated admins, except the initiating admin, about a configuration change in a group.
 *
 * Sends a formatted message describing the change to each eligible admin's direct message chat. Returns counts of successful, failed, and skipped notifications.
 *
 * @param groupChatId - The ID of the group where the configuration change occurred
 * @param initiatingAdminId - The Telegram user ID of the admin who initiated the change
 * @param changeType - A brief description of the type of configuration change
 * @param changeDetails - Additional details about the configuration change
 * @param bot - The Telegram bot instance used to send notifications
 * @param groupTitle - Optional group title for message context
 * @returns An object containing the counts of successful, failed, and skipped notifications
 */
export async function notifyAdminsOfConfigChange(
  groupChatId: number,
  initiatingAdminId: number,
  changeType: string,
  changeDetails: string,
  bot: any,
  groupTitle?: string
): Promise<{ success: number; failed: number; skipped: number }> {
  try {
    const admins = await getActivatedAdmins(groupChatId);
    const filteredAdmins = admins.filter(admin => admin.telegramUserId !== initiatingAdminId);
    
    if (filteredAdmins.length === 0) {
      LogEngine.info('No admins to notify (excluding initiator)', {
        groupChatId,
        initiatingAdminId,
        totalAdmins: admins.length
      });
      return { success: 0, failed: 0, skipped: admins.length };
    }

    const context: NotificationContext = {
      groupId: groupChatId,
      groupTitle: groupTitle || `Group ${groupChatId}`,
      changeType,
      changeDetails,
      timestamp: new Date().toISOString()
    };

    // Simple admin notification message (could be enhanced with global templates later)
    const messageText = `🔧 <b>Configuration Update</b>

<b>Group:</b> ${context.groupTitle || `Group ${groupChatId}`}
<b>Change:</b> ${changeType}
<b>Details:</b> ${changeDetails}
<b>Time:</b> ${context.timestamp}

Group configuration has been updated.`;

    let successCount = 0;
    let failedCount = 0;

    // Send notifications to all filtered admins
    for (const admin of filteredAdmins) {
      const success = await sendNotificationToAdmin(admin, messageText, bot);
      if (success) {
        successCount++;
      } else {
        failedCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    LogEngine.info('Admin notification batch completed', {
      groupChatId,
      changeType,
      success: successCount,
      failed: failedCount,
      skipped: admins.length - filteredAdmins.length
    });

    return { 
      success: successCount, 
      failed: failedCount, 
      skipped: admins.length - filteredAdmins.length 
    };
  } catch (error) {
    LogEngine.error('Error in admin notification system', {
      error: (error as Error).message,
      groupChatId,
      changeType
    });
    return { success: 0, failed: 0, skipped: 0 };
  }
}

/**
 * Notifies all activated admins, except the initiator, about a template change in a group.
 *
 * Constructs and sends a notification describing the template action (created, updated, deleted, or activated) to relevant admins via direct message.
 *
 * @param groupChatId - The group chat where the template change occurred
 * @param initiatingAdminId - The admin who performed the template action
 * @param templateType - The type of template affected
 * @param action - The action performed on the template ('created', 'updated', 'deleted', or 'activated')
 * @param templateName - The name of the template involved
 * @param bot - The Telegram bot instance used to send notifications
 * @param groupTitle - Optional group title for context in the notification
 * @returns An object with counts of successful, failed, and skipped notifications
 */
export async function notifyAdminsOfTemplateChange(
  groupChatId: number,
  initiatingAdminId: number,
  templateType: string,
  action: 'created' | 'updated' | 'deleted' | 'activated',
  templateName: string,
  bot: any,
  groupTitle?: string
): Promise<{ success: number; failed: number; skipped: number }> {
  const changeDetails = `Template "${templateName}" (${templateType}) was ${action}`;
  
  return await notifyAdminsOfConfigChange(
    groupChatId,
    initiatingAdminId,
    'Template Change',
    changeDetails,
    bot,
    groupTitle
  );
}

/**
 * Notifies all activated admins, except the completing admin, that group setup and configuration have been completed.
 *
 * @param groupChatId - The ID of the group chat where setup was completed
 * @param completingAdminId - The admin ID of the user who completed the setup
 * @param bot - The Telegram bot instance used to send notifications
 * @param groupTitle - Optional name of the group chat
 * @returns An object containing counts of successful, failed, and skipped notifications
 */
export async function notifyAdminsOfSetupCompletion(
  groupChatId: number,
  completingAdminId: number,
  bot: any,
  groupTitle?: string
): Promise<{ success: number; failed: number; skipped: number }> {
  const changeDetails = 'Group setup and configuration completed';
  
  return await notifyAdminsOfConfigChange(
    groupChatId,
    completingAdminId,
    'Setup Completed',
    changeDetails,
    bot,
    groupTitle
  );
}

/**
 * Reports notification delivery failures to activated admins who can still receive messages.
 *
 * Attempts to identify admins with accessible DM chats and notifies them about failed admin notifications for a group. If no admins are reachable, logs an error. The notification includes group information, failure count, change type, and a timestamp.
 */
export async function reportNotificationFailures(
  groupChatId: number,
  failedCount: number,
  changeType: string,
  bot: any
): Promise<void> {
  if (failedCount === 0) {return;}

  try {
    const admins = await getActivatedAdmins(groupChatId);
    const workingAdmins: AdminProfile[] = [];

    // Find admins who can receive notifications using non-intrusive check
    for (const admin of admins) {
      if (admin.dmChatId) {
        try {
          // Non-intrusive check: verify chat accessibility without sending visible messages
          await bot.api.getChat(admin.dmChatId);
          
          // Additional check: verify bot can send messages by checking chat permissions
          // This doesn't send a message but checks if the chat allows messaging
          const chatMember = await bot.api.getChatMember(admin.dmChatId, bot.botInfo.id);
          const canSendMessages = chatMember.status !== 'kicked' && chatMember.status !== 'left';
          
          if (canSendMessages) {
            workingAdmins.push(admin);
          }
        } catch (error) {
          // Admin's DM is not accessible - chat doesn't exist, bot is blocked, etc.
          LogEngine.warn('Admin DM not accessible for failure report', {
            adminId: admin.telegramUserId,
            dmChatId: admin.dmChatId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    if (workingAdmins.length === 0) {
      LogEngine.error('No admins available to report notification failures', {
        groupChatId,
        failedCount,
        changeType
      });
      return;
    }

    const context = {
      groupId: groupChatId,
      failedCount,
      changeType,
      timestamp: new Date().toISOString()
    };

    // Simple notification failure message (could be enhanced with global templates later)
    const messageText = `⚠️ <b>Admin Notification: Delivery Issues</b>

<b>Group:</b> Group ${groupChatId}
<b>Issue:</b> Failed to deliver ${context.failedCount} admin notifications
<b>Time:</b> ${context.timestamp}

Some administrators may not have received configuration change notifications. This may be due to:
• Blocked bot access
• Deleted private chats
• Network connectivity issues

Please check your private chat with the bot.`;

    // Send failure report to working admins
    for (const admin of workingAdmins) {
      await sendNotificationToAdmin(admin, messageText, bot);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

  } catch (error) {
    LogEngine.error('Error reporting notification failures', {
      error: (error as Error).message,
      groupChatId,
      failedCount,
      changeType
    });
  }
}

/**
 * Session Management Tasks
 * 
 * Background tasks for managing setup sessions, including cleanup of expired sessions
 * and monitoring of session health.
 */

/**
 * Removes expired setup sessions and returns the number of sessions cleaned up.
 *
 * This function should be called periodically to maintain session hygiene. If an error occurs during cleanup, zero is returned.
 *
 * @returns The number of expired sessions that were removed
 */
export async function performSessionCleanup(): Promise<number> {
  try {
    const cleanedCount = await cleanupExpiredSessions();
    
    if (cleanedCount > 0) {
      LogEngine.info('Session cleanup completed', {
        cleanedSessions: cleanedCount,
        timestamp: new Date().toISOString()
      });
    }
    
    return cleanedCount;
  } catch (error) {
    LogEngine.error('Session cleanup failed', {
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
    return 0;
  }
}

// Module-level variable to track the active session cleanup interval
let activeCleanupInterval: NodeJS.Timeout | undefined = undefined;

/**
 * Starts a background task that periodically removes expired setup sessions every minute.
 * 
 * Prevents multiple intervals by checking for existing cleanup tasks before creating new ones.
 * If an interval is already running, it will be cleared before starting a new one.
 *
 * @returns The interval ID for the scheduled cleanup task
 */
export function startSessionCleanupTask(): NodeJS.Timeout {
  // Check if cleanup interval is already running
  if (activeCleanupInterval) {
    LogEngine.warn('Session cleanup task already running, clearing existing interval before starting new one', {
      existingInterval: 'cleared',
      timestamp: new Date().toISOString()
    });
    clearInterval(activeCleanupInterval);
    activeCleanupInterval = undefined;
  }

  LogEngine.info('Starting session cleanup task', {
    interval: '60 seconds',
    timestamp: new Date().toISOString()
  });

  activeCleanupInterval = setInterval(async () => {
    await performSessionCleanup();
  }, 60 * 1000); // Run every minute

  return activeCleanupInterval;
}

/**
 * Stops the periodic session cleanup task associated with the given interval ID.
 * 
 * Also resets the module-level interval tracking to prevent resource leaks.
 *
 * @param intervalId - The interval identifier returned by `setInterval` for the cleanup task
 */
export function stopSessionCleanupTask(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  
  // Reset the module-level interval tracking if this matches the active interval
  if (activeCleanupInterval === intervalId) {
    activeCleanupInterval = undefined;
  }
  
  LogEngine.info('Session cleanup task stopped', {
    timestamp: new Date().toISOString(),
    intervalCleared: true
  });
}

/**
 * Force stops any active session cleanup interval and resets the module state.
 * 
 * Useful for cleanup scenarios where the interval ID might not be available.
 * This is a safety function to prevent resource leaks.
 */
export function forceStopSessionCleanupTask(): void {
  if (activeCleanupInterval) {
    clearInterval(activeCleanupInterval);
    activeCleanupInterval = undefined;
    
    LogEngine.info('Active session cleanup task force stopped', {
      timestamp: new Date().toISOString(),
      reason: 'force cleanup'
    });
  } else {
    LogEngine.debug('No active session cleanup task to stop', {
      timestamp: new Date().toISOString()
    });
  }
}
