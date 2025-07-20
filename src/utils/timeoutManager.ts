/**
 * Timeout Manager
 * 
 * Provides centralized timeout management to prevent memory leaks
 * by tracking and properly cleaning up timeouts.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { LogEngine } from '@wgtechlabs/log-engine';

interface ManagedTimeout {
    id: NodeJS.Timeout;
    description: string;
    createdAt: Date;
}

/**
 * Centralized timeout management to prevent memory leaks
 */
export class TimeoutManager {
    private static timeouts: Map<string, ManagedTimeout> = new Map();
    private static isShuttingDown = false;
    private static cleanupInterval: NodeJS.Timeout | null = null;
    private static cleanupPerformed = false;

    /**
     * Initialize the timeout manager with periodic cleanup
     */
    static initializeCleanup(): void {
        if (!this.cleanupInterval) {
            this.cleanupInterval = setInterval(() => {
                this.cleanupStaleTimeouts();
            }, 5 * 60 * 1000); // Every 5 minutes
            
            LogEngine.debug('TimeoutManager cleanup interval initialized');
        }
    }

    /**
     * Create a managed timeout that can be properly cleaned up
     */
    static createTimeout(
        callback: () => void | Promise<void>,
        delay: number,
        description: string = 'unnamed timeout'
    ): string {
        // Prevent new timeouts during shutdown to avoid race conditions
        if (this.isShuttingDown) {
            LogEngine.warn('Timeout creation rejected - system is shutting down', {
                description,
                delay
            });
            return ''; // Return empty string to indicate no timeout was created
        }

        const timeoutKey = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        
        const wrappedCallback = async () => {
            try {
                // Remove from tracking before execution
                this.timeouts.delete(timeoutKey);
                
                // Execute the callback
                await callback();
            } catch (error) {
                LogEngine.error('Timeout callback failed', {
                    error: error instanceof Error ? error.message : String(error),
                    description,
                    timeoutKey
                });
            }
        };

        const timeoutId = setTimeout(wrappedCallback, delay);
        
        this.timeouts.set(timeoutKey, {
            id: timeoutId,
            description,
            createdAt: new Date()
        });

        LogEngine.debug('Timeout created', {
            timeoutKey,
            description,
            delay,
            activeTimeouts: this.timeouts.size
        });

        return timeoutKey;
    }

    /**
     * Cancel a specific timeout
     */
    static cancelTimeout(timeoutKey: string): boolean {
        const timeout = this.timeouts.get(timeoutKey);
        if (timeout) {
            clearTimeout(timeout.id);
            this.timeouts.delete(timeoutKey);
            
            LogEngine.debug('Timeout cancelled', {
                timeoutKey,
                description: timeout.description,
                activeTimeouts: this.timeouts.size
            });
            
            return true;
        }
        return false;
    }

    /**
     * Clear all managed timeouts (for cleanup/shutdown)
     */
    static clearAllTimeouts(): void {
        // Prevent multiple cleanup calls
        if (this.cleanupPerformed) {
            return;
        }
        
        this.isShuttingDown = true;
        this.cleanupPerformed = true;
        
        // Clear the cleanup interval first
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        for (const [key, timeout] of this.timeouts.entries()) {
            clearTimeout(timeout.id);
        }
        
        const clearedCount = this.timeouts.size;
        this.timeouts.clear();
        
        LogEngine.info('All timeouts cleared', {
            clearedCount,
            reason: 'shutdown'
        });
    }

    /**
     * Clean up old timeouts that may have been orphaned
     */
    static cleanupStaleTimeouts(maxAgeMs: number = 5 * 60 * 1000): number {
        if (this.isShuttingDown) {return 0;}
        
        const now = new Date();
        let cleanedUp = 0;
        
        for (const [key, timeout] of this.timeouts.entries()) {
            const age = now.getTime() - timeout.createdAt.getTime();
            if (age > maxAgeMs) {
                clearTimeout(timeout.id);
                this.timeouts.delete(key);
                cleanedUp++;
                
                LogEngine.warn('Stale timeout cleaned up', {
                    timeoutKey: key,
                    description: timeout.description,
                    ageMs: age
                });
            }
        }
        
        return cleanedUp;
    }
}

// Initialize cleanup when the module is loaded
TimeoutManager.initializeCleanup();

// Set up cleanup on process exit
process.on('exit', () => {
    TimeoutManager.clearAllTimeouts();
});

process.on('SIGINT', () => {
    TimeoutManager.clearAllTimeouts();
});

process.on('SIGTERM', () => {
    TimeoutManager.clearAllTimeouts();
});
