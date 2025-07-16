/**
 * Session Management Tasks
 * 
 * Background tasks for managing setup sessions, including cleanup of expired sessions
 * and monitoring of session health.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import { LogEngine } from '@wgtechlabs/log-engine';
import { cleanupExpiredSessions } from './adminManager.js';

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

/**
 * Starts a background task that periodically removes expired setup sessions every minute.
 *
 * @returns The interval ID for the scheduled cleanup task
 */
export function startSessionCleanupTask(): NodeJS.Timeout {
  LogEngine.info('Starting session cleanup task', {
    interval: '60 seconds',
    timestamp: new Date().toISOString()
  });

  return setInterval(async () => {
    await performSessionCleanup();
  }, 60 * 1000); // Run every minute
}

/**
 * Stops the periodic session cleanup task associated with the given interval ID.
 *
 * @param intervalId - The interval identifier returned by `setInterval` for the cleanup task
 */
export function stopSessionCleanupTask(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  LogEngine.info('Session cleanup task stopped', {
    timestamp: new Date().toISOString()
  });
}
