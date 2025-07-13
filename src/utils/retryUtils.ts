/**
 * Retry Utilities with Exponential Backoff
 * 
 * Provides robust retry mechanisms with exponential backoff
 * to handle transient failures gracefully while preventing
 * resource exhaustion and race conditions.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { LogEngine } from '@wgtechlabs/log-engine';

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    jitterFactor?: number;
}

export interface RetryResult<T> {
    success: boolean;
    result?: T;
    error?: Error;
    attemptCount: number;
    totalTimeMs: number;
}

/**
 * Executes an async operation with exponential backoff retry logic
 */
export async function retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
    context: string = 'operation'
): Promise<RetryResult<T>> {
    const {
        maxAttempts = 3,
        initialDelayMs = 100,
        maxDelayMs = 5000,
        backoffFactor = 2,
        jitterFactor = 0.1
    } = options;

    const startTime = Date.now();
    let lastError: Error = new Error('Unknown error');
    let attemptCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attemptCount = attempt;
        
        try {
            LogEngine.debug(`Retry attempt ${attempt}/${maxAttempts}`, {
                context,
                attempt,
                maxAttempts
            });

            const result = await operation();
            
            const totalTime = Date.now() - startTime;
            LogEngine.debug(`Operation succeeded`, {
                context,
                attemptCount,
                totalTimeMs: totalTime,
                succeededOnAttempt: attempt
            });

            return {
                success: true,
                result,
                attemptCount,
                totalTimeMs: totalTime
            };

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            LogEngine.warn(`Retry attempt ${attempt} failed`, {
                context,
                attempt,
                maxAttempts,
                error: lastError.message
            });

            // Don't wait after the last attempt
            if (attempt < maxAttempts) {
                const baseDelay = Math.min(
                    initialDelayMs * Math.pow(backoffFactor, attempt - 1),
                    maxDelayMs
                );
                
                // Add jitter to prevent thundering herd
                const jitter = baseDelay * jitterFactor * (Math.random() - 0.5);
                const delay = Math.max(0, baseDelay + jitter);
                
                LogEngine.debug(`Waiting before retry`, {
                    context,
                    attempt,
                    delayMs: Math.round(delay)
                });

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    const totalTime = Date.now() - startTime;
    LogEngine.error(`Operation failed after all retry attempts`, {
        context,
        attemptCount,
        totalTimeMs: totalTime,
        finalError: lastError.message
    });

    return {
        success: false,
        error: lastError,
        attemptCount,
        totalTimeMs: totalTime
    };
}

/**
 * Specialized retry for database/storage operations
 * with appropriate defaults for that context
 */
export async function retryStorageOperation<T>(
    operation: () => Promise<T>,
    context: string = 'storage operation'
): Promise<RetryResult<T>> {
    return retryWithExponentialBackoff(operation, {
        maxAttempts: 5,
        initialDelayMs: 50,
        maxDelayMs: 2000,
        backoffFactor: 1.5,
        jitterFactor: 0.2
    }, context);
}

/**
 * Specialized retry for API calls with longer delays
 */
export async function retryApiCall<T>(
    operation: () => Promise<T>,
    context: string = 'API call'
): Promise<RetryResult<T>> {
    return retryWithExponentialBackoff(operation, {
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 10000,
        backoffFactor: 2,
        jitterFactor: 0.15
    }, context);
}
