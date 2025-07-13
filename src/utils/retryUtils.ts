/**
 * Retry Utilities with Exponential Backoff
 *
 * Provides robust retry mechanisms with exponential backoff
 * to handle transient failures gracefully while preventing
 * resource exhaustion and race conditions.
 *
 * @author Waren Gonzaga, WG Technology Labs
 */

import { LogEngine } from '@wgtechlabs/log-engine'

export interface RetryOptions {
  maxAttempts?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
  jitterFactor?: number
}

export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attemptCount: number
  totalTimeMs: number
}

/**
 * Attempts an asynchronous operation multiple times using exponential backoff and jitter to handle transient failures.
 *
 * Retries the provided async operation up to the specified maximum attempts, waiting between attempts with an exponentially increasing delay and random jitter to reduce contention. Returns a result object indicating success or failure, the result or error, the number of attempts made, and the total elapsed time.
 *
 * @param operation - The asynchronous function to execute and retry on failure
 * @param options - Optional retry configuration including maximum attempts, delays, backoff, and jitter
 * @param context - Optional string for identifying the operation in logs
 * @returns An object describing the outcome of the retry process, including success status, result or error, attempt count, and total elapsed time
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
    jitterFactor = 0.1,
  } = options

  const startTime = Date.now()
  let lastError: Error = new Error('Unknown error')
  let attemptCount = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount = attempt

    try {
      LogEngine.debug(`Retry attempt ${attempt}/${maxAttempts}`, {
        context,
        attempt,
        maxAttempts,
      })

      const result = await operation()

      const totalTime = Date.now() - startTime
      LogEngine.debug(`Operation succeeded`, {
        context,
        attemptCount,
        totalTimeMs: totalTime,
        succeededOnAttempt: attempt,
      })

      return {
        success: true,
        result,
        attemptCount,
        totalTimeMs: totalTime,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      LogEngine.warn(`Retry attempt ${attempt} failed`, {
        context,
        attempt,
        maxAttempts,
        error: lastError.message,
      })

      // Don't wait after the last attempt
      if (attempt < maxAttempts) {
        const baseDelay = Math.min(
          initialDelayMs * Math.pow(backoffFactor, attempt - 1),
          maxDelayMs
        )

        // Add jitter to prevent thundering herd
        const jitter = baseDelay * jitterFactor * (Math.random() - 0.5)
        const delay = Math.max(0, baseDelay + jitter)

        LogEngine.debug(`Waiting before retry`, {
          context,
          attempt,
          delayMs: Math.round(delay),
        })

        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  const totalTime = Date.now() - startTime
  LogEngine.error(`Operation failed after all retry attempts`, {
    context,
    attemptCount,
    totalTimeMs: totalTime,
    finalError: lastError.message,
  })

  return {
    success: false,
    error: lastError,
    attemptCount,
    totalTimeMs: totalTime,
  }
}

/**
 * Retries a storage or database operation with exponential backoff and jitter using defaults suitable for storage contexts.
 *
 * @param operation - The asynchronous storage or database operation to execute with retries
 * @param context - Optional context string for logging and diagnostics
 * @returns The result of the retry operation, including success status, result or error, attempt count, and total elapsed time
 */
export async function retryStorageOperation<T>(
  operation: () => Promise<T>,
  context: string = 'storage operation'
): Promise<RetryResult<T>> {
  return retryWithExponentialBackoff(
    operation,
    {
      maxAttempts: 5,
      initialDelayMs: 50,
      maxDelayMs: 2000,
      backoffFactor: 1.5,
      jitterFactor: 0.2,
    },
    context
  )
}

/**
 * Retries an asynchronous API call with exponential backoff and jitter, using parameters optimized for API reliability.
 *
 * @param operation - The asynchronous API call to execute
 * @param context - Optional context string for logging purposes; defaults to "API call"
 * @returns A `RetryResult` containing the outcome of the retry attempts, including success status, result or error, attempt count, and total elapsed time
 */
export async function retryApiCall<T>(
  operation: () => Promise<T>,
  context: string = 'API call'
): Promise<RetryResult<T>> {
  return retryWithExponentialBackoff(
    operation,
    {
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      backoffFactor: 2,
      jitterFactor: 0.15,
    },
    context
  )
}
