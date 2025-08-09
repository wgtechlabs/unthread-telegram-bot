/**
 * Error Context Builder - Standardized Error Handling Utility
 * 
 * Provides consistent error context creation across the entire codebase,
 * eliminating the repeated pattern of error message normalization and
 * context building that appears 249+ times throughout the application.
 * 
 * Benefits:
 * - Standardized error message format
 * - Consistent context building
 * - Type-safe error handling
 * - Reduced code duplication in error logging
 * - Enhanced debugging capabilities
 * 
 * @author WG Code Builder

 * @since 2025
 */

import type { BotContext } from '../types/index.js';
import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * Standard error context interface for consistent logging
 */
export interface ErrorContext {
    /** Normalized error message */
    error: string;
    /** Telegram user ID if available */
    userId?: number | undefined;
    /** Telegram chat ID if available */
    chatId?: number | undefined;
    /** Timestamp of the error */
    timestamp?: string;
    /** Additional context properties */
    [key: string]: unknown;
}

/**
 * Builder class for creating standardized error contexts
 * 
 * This eliminates the repeated pattern of:
 * ```
 * error: error instanceof Error ? error.message : String(error),
 * userId: ctx.from?.id,
 * chatId: ctx.chat?.id
 * ```
 * 
 * Which appears 249+ times across the codebase.
 */
export class ErrorContextBuilder {
    private context: ErrorContext;

    /**
     * Creates a new error context builder with normalized error message
     * 
     * @param error - The error to normalize (Error object, string, or unknown)
     */
    constructor(error: unknown) {
        this.context = {
            error: this.normalizeError(error),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Normalizes various error types into a consistent string format
     * 
     * @param error - The error to normalize
     * @returns Normalized error message string
     */
    private normalizeError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        
        if (typeof error === 'string') {
            return error;
        }
        
        if (error && typeof error === 'object') {
            // Handle error-like objects
            const errorObj = error as Record<string, unknown>;
            if (typeof errorObj.message === 'string') {
                return errorObj.message;
            }
            if (typeof errorObj.error === 'string') {
                return errorObj.error;
            }
        }
        
        return String(error);
    }

    /**
     * Adds bot context information (user ID and chat ID) to the error context
     * 
     * @param ctx - The bot context containing user and chat information
     * @returns This builder instance for method chaining
     */
    withBotContext(ctx: BotContext): this {
        this.context.userId = ctx.from?.id;
        this.context.chatId = ctx.chat?.id;
        return this;
    }

    /**
     * Adds command-specific context information
     * 
     * @param commandName - The name of the command that failed
     * @returns This builder instance for method chaining
     */
    withCommand(commandName: string): this {
        this.context.commandName = commandName;
        return this;
    }

    /**
     * Adds attachment-related context information
     * 
     * @param attachmentCount - Number of attachments being processed
     * @returns This builder instance for method chaining
     */
    withAttachment(attachmentCount: number): this {
        this.context.attachmentCount = attachmentCount;
        return this;
    }

    /**
     * Adds file processing context information
     * 
     * @param fileName - Name of the file being processed
     * @param fileSize - Size of the file in bytes
     * @returns This builder instance for method chaining
     */
    withFile(fileName: string, fileSize?: number): this {
        this.context.fileName = fileName;
        if (fileSize !== undefined) {
            this.context.fileSize = fileSize;
        }
        return this;
    }

    /**
     * Adds webhook-related context information
     * 
     * @param webhookType - Type of webhook event
     * @param eventId - Unique identifier for the webhook event
     * @returns This builder instance for method chaining
     */
    withWebhook(webhookType: string, eventId?: string): this {
        this.context.webhookType = webhookType;
        if (eventId) {
            this.context.eventId = eventId;
        }
        return this;
    }

    /**
     * Validates a key to prevent prototype pollution
     * 
     * @param key - The key to validate
     * @returns True if the key is safe to use, false otherwise
     */
    private isSafeKey(key: string): boolean {
        // List of dangerous prototype-related keys
        const dangerousKeys = [
            '__proto__',
            'constructor',
            'prototype',
            'toString',
            'valueOf',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable'
        ];
        
        // Check if key is a string and not a dangerous prototype property
        return typeof key === 'string' && 
               key.length > 0 && 
               !dangerousKeys.includes(key) &&
               !key.startsWith('__') && 
               !key.endsWith('__');
    }

    /**
     * Adds custom context properties
     * 
     * @param key - Property key
     * @param value - Property value
     * @returns This builder instance for method chaining
     */
    withCustom(key: string, value: unknown): this {
        // Validate key to prevent prototype pollution
        if (!this.isSafeKey(key)) {
            LogEngine.warn('Attempted to set unsafe key in error context', {
                attemptedKey: key,
                keyType: typeof key,
                reason: 'prototype_pollution_prevention'
            });
            return this;
        }
        
        // Safe to assign after validation
        // eslint-disable-next-line security/detect-object-injection
        this.context[key] = value;
        return this;
    }

    /**
     * Adds multiple custom properties at once
     * 
     * @param properties - Object containing multiple properties to add
     * @returns This builder instance for method chaining
     */
    withProperties(properties: Record<string, unknown>): this {
        // Validate each key to prevent prototype pollution
        for (const [key, value] of Object.entries(properties)) {
            if (this.isSafeKey(key)) {
                // eslint-disable-next-line security/detect-object-injection
                this.context[key] = value;
            } else {
                LogEngine.warn('Skipped unsafe key in error context properties', {
                    skippedKey: key,
                    keyType: typeof key,
                    reason: 'prototype_pollution_prevention'
                });
            }
        }
        return this;
    }

    /**
     * Builds and returns the final error context object
     * 
     * @returns The complete error context ready for logging
     */
    build(): ErrorContext {
        return { ...this.context };
    }

    // Static convenience methods for common patterns

    /**
     * Creates error context for command failures (most common pattern)
     * 
     * @param error - The error that occurred
     * @param ctx - Bot context
     * @param commandName - Name of the failed command
     * @returns Complete error context
     */
    static forCommand(error: unknown, ctx: BotContext, commandName: string): ErrorContext {
        return new ErrorContextBuilder(error)
            .withBotContext(ctx)
            .withCommand(commandName)
            .build();
    }

    /**
     * Creates error context for attachment processing failures
     * 
     * @param error - The error that occurred
     * @param ctx - Bot context
     * @param attachmentCount - Number of attachments being processed
     * @returns Complete error context
     */
    static forAttachment(error: unknown, ctx: BotContext, attachmentCount: number): ErrorContext {
        return new ErrorContextBuilder(error)
            .withBotContext(ctx)
            .withAttachment(attachmentCount)
            .build();
    }

    /**
     * Creates error context for file processing failures
     * 
     * @param error - The error that occurred
     * @param ctx - Bot context
     * @param fileName - Name of the file being processed
     * @param fileSize - Size of the file
     * @returns Complete error context
     */
    static forFile(error: unknown, ctx: BotContext, fileName: string, fileSize?: number): ErrorContext {
        return new ErrorContextBuilder(error)
            .withBotContext(ctx)
            .withFile(fileName, fileSize)
            .build();
    }

    /**
     * Creates error context for webhook processing failures
     * 
     * @param error - The error that occurred
     * @param webhookType - Type of webhook event
     * @param eventId - Event identifier
     * @returns Complete error context
     */
    static forWebhook(error: unknown, webhookType: string, eventId?: string): ErrorContext {
        return new ErrorContextBuilder(error)
            .withWebhook(webhookType, eventId)
            .build();
    }

    /**
     * Creates basic error context with just the normalized error message
     * 
     * @param error - The error that occurred
     * @returns Basic error context
     */
    static basic(error: unknown): ErrorContext {
        return new ErrorContextBuilder(error).build();
    }
}
