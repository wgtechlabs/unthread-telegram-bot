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
 * Cleanup expired setup sessions
 * This function should be called periodically (e.g., every minute)
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
 * Start periodic session cleanup
 * Cleans up expired sessions every minute
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
 * Stop session cleanup task
 */
export function stopSessionCleanupTask(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  LogEngine.info('Session cleanup task stopped', {
    timestamp: new Date().toISOString()
  });
}
