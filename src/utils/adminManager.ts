/**
 * Admin Management Utilities
 * 
 * Utility functions for managing admin profiles, validation, and setup sessions
 * for the Unthread Telegram Bot.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { isAdminUser } from '../config/env.js';
import { BotsStore } from '../sdk/bots-brain/index.js';
import type { AdminProfile, SetupSession, DmSetupSession } from '../sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Check if a user is a valid admin (in environment variable)
 */
export function isValidAdmin(telegramUserId: number): boolean {
  return isAdminUser(telegramUserId);
}

/**
 * Check if an admin has activated their profile for DM access
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
 * Check if admin can start a new setup session (no active sessions)
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
 * Create admin profile for DM access
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
 * Update admin last active time
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
 * Create setup session
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
 * Send notification to other admins (excluding the initiator)
 */
export async function notifyOtherAdmins(
  initiatingAdminId: number, 
  message: string,
  sendMessage: (chatId: number, message: string) => Promise<void>
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
 * Check if a session has expired
 */
export function isSessionExpired(session: SetupSession): boolean {
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  return now > expiresAt;
}

/**
 * Cleanup expired sessions and return count
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
 * Get session time remaining in minutes
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
 * Create a DM setup session
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
 * Check if admin can start a new DM setup session
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
 * Check if a DM session has expired
 */
export function isDmSessionExpired(session: DmSetupSession): boolean {
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  return now > expiresAt;
}

/**
 * Get DM session time remaining in minutes
 */
export function getDmSessionTimeRemaining(session: DmSetupSession): number {
  const now = new Date();
  const expiresAt = new Date(session.expiresAt);
  const remainingMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / (1000 * 60)));
}

/**
 * Update DM session step
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
 * Add message ID to DM session for cleanup tracking
 */
export async function addDmSessionMessageId(sessionId: string, messageId: number): Promise<boolean> {
  try {
    const session = await BotsStore.getDmSetupSession(sessionId);
    if (!session) return false;

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
 * Complete DM setup session
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
 * Cancel DM setup session
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

import { GlobalTemplateManager } from './globalTemplateManager.js';

interface NotificationContext {
  groupId: number;
  groupTitle?: string;
  adminName?: string;
  changeType: string;
  changeDetails?: string;
  timestamp: string;
}

/**
 * Get all activated admin profiles for a group
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
 * Send notification to a single admin
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
 * Notify all admins except the initiating admin about a configuration change
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
    const messageText = `🔧 **Configuration Update**

**Group:** ${context.groupTitle || `Group ${groupChatId}`}
**Change:** ${changeType}
**Details:** ${changeDetails}
**Time:** ${context.timestamp}

${context.adminName ? `**By:** ${context.adminName}` : ''}

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
 * Notify all admins about template changes
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
 * Notify all admins about setup completion
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
 * Report notification failures to admins who can receive them
 */
export async function reportNotificationFailures(
  groupChatId: number,
  failedCount: number,
  changeType: string,
  bot: any
): Promise<void> {
  if (failedCount === 0) return;

  try {
    const admins = await getActivatedAdmins(groupChatId);
    const workingAdmins: AdminProfile[] = [];

    // Find admins who can receive notifications
    for (const admin of admins) {
      if (admin.dmChatId) {
        try {
          // Test if we can send to this admin
          await bot.sendMessage(admin.dmChatId, '🔍 Testing notification delivery...', { 
            parse_mode: 'HTML' 
          });
          workingAdmins.push(admin);
        } catch (error) {
          // Admin's DM is not working
          LogEngine.warn('Admin DM not accessible for failure report', {
            adminId: admin.telegramUserId
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
    const messageText = `⚠️ **Admin Notification: Delivery Issues**

**Group:** Group ${groupChatId}
**Issue:** Failed to deliver ${context.failedCount} admin notifications
**Time:** ${context.timestamp}

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
