/**
 * Email Management Utilities
 * 
 * Provides comprehensive email handling for the support ticket system,
 * including validation, dummy email generation, and user preference management.
 * This demonstrates proper user data management patterns and graceful defaults.
 * 
 * UNIFIED APPROACH: Uses only unthreadEmail field for all email operations
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BotsStore } from '../sdk/bots-brain/index.js';

/**
 * Email validation result interface
 */
export interface EmailValidationResult {
    isValid: boolean;
    sanitizedValue?: string;
    error?: string;
}

/**
 * User email preferences interface
 */
export interface UserEmailPreferences {
    email: string;
    isDummy: boolean;
    setAt: string;
    canModify: boolean;
}

/**
 * Validates email format using comprehensive regex pattern
 * 
 * @param email - The email address to validate
 * @returns Validation result with sanitized email if valid
 */
export function validateEmail(email: string): EmailValidationResult {
    if (!email || typeof email !== 'string') {
        return {
            isValid: false,
            error: 'Email address is required'
        };
    }

    const trimmedEmail = email.trim().toLowerCase();
    
    // Comprehensive email regex pattern
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(trimmedEmail)) {
        return {
            isValid: false,
            error: 'Please enter a valid email address (e.g., user@example.com)'
        };
    }

    // Additional checks for common issues
    if (trimmedEmail.length > 254) {
        return {
            isValid: false,
            error: 'Email address is too long (maximum 254 characters)'
        };
    }

    // Check for suspicious patterns
    if (trimmedEmail.includes('..') || trimmedEmail.startsWith('.') || trimmedEmail.endsWith('.')) {
        return {
            isValid: false,
            error: 'Email address format is invalid'
        };
    }

    return {
        isValid: true,
        sanitizedValue: trimmedEmail
    };
}

/**
 * Generates a temporary email for users who skip email setup
 * SIMPLIFIED to match the pattern used by unthread service
 * 
 * @param userId - Telegram user ID
 * @param username - Telegram username (optional)
 * @returns Generated temporary email address in same format as auto-generated ones
 */
export function generateDummyEmail(userId: number, username?: string): string {
    // Use the same pattern as existing service auto-generation
    const identifier = username || `user${userId}`;
    
    // Clean username to be email-safe
    const cleanIdentifier = identifier
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20); // Limit length
    
    // Generate email in same format as auto-generated ones
    return `${cleanIdentifier}_${userId}@telegram.user`;
}

/**
 * Retrieves user's email preferences - UNIFIED to use only unthreadEmail
 * 
 * @param userId - Telegram user ID
 * @returns User email preferences or null if not set
 */
export async function getUserEmailPreferences(userId: number): Promise<UserEmailPreferences | null> {
    try {
        const userData = await BotsStore.getUserByTelegramId(userId);
        
        if (!userData?.unthreadEmail) {
            return null;
        }

        return {
            email: userData.unthreadEmail,
            isDummy: userData.unthreadEmail.includes('@telegram.user'), // Auto-generated emails
            setAt: userData.updatedAt || userData.createdAt || new Date().toISOString(),
            canModify: true
        };
    } catch (error) {
        return null;
    }
}

/**
 * Updates user's email address with proper validation and logging
 * UNIFIED: Only updates unthreadEmail field
 * 
 * @param userId - Telegram user ID
 * @param email - New email address
 * @param isDummy - Whether this is a dummy email
 * @returns Success status and any error message
 */
export async function updateUserEmail(
    userId: number, 
    email: string, 
    isDummy: boolean = false
): Promise<{ success: boolean; error?: string }> {
    try {
        // Validate email format (even for dummy emails)
        const validation = validateEmail(email);
        
        if (!validation.isValid) {
            return {
                success: false,
                error: validation.error || 'Invalid email format'
            };
        }

        // Ensure we have a valid sanitized email
        const sanitizedEmail = validation.sanitizedValue;
        if (!sanitizedEmail) {
            return {
                success: false,
                error: 'Email validation failed'
            };
        }

        // Update user email in storage - UNIFIED to use only unthreadEmail
        await BotsStore.updateUser(userId, {
            unthreadEmail: sanitizedEmail,
            updatedAt: new Date().toISOString()
        });

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: 'Failed to update email address. Please try again.'
        };
    }
}

/**
 * Migration function: Copies legacy email field to unthreadEmail if missing
 * This ensures smooth transition for existing users
 * 
 * @param userId - Telegram user ID
 * @returns Migration result
 */
export async function migrateUserEmailIfNeeded(userId: number): Promise<{ migrated: boolean; email?: string }> {
    try {
        const userData = await BotsStore.getUserByTelegramId(userId);
        
        if (!userData) {
            return { migrated: false };
        }

        // If unthreadEmail exists, no migration needed
        if (userData.unthreadEmail) {
            return { migrated: false, email: userData.unthreadEmail };
        }

        // If generic email exists but unthreadEmail doesn't, migrate it
        if (userData.email) {
            await BotsStore.updateUser(userId, {
                unthreadEmail: userData.email,
                updatedAt: new Date().toISOString()
            });
            
            return { migrated: true, email: userData.email };
        }

        return { migrated: false };
    } catch (error) {
        return { migrated: false };
    }
}

/**
 * Gets user email with automatic migration fallback
 * This is the main function to retrieve user email consistently
 * 
 * @param userId - Telegram user ID
 * @param username - Telegram username for dummy email generation
 * @returns User email (real, migrated, or generated dummy)
 */
export async function getUserEmailWithMigration(userId: number, username?: string): Promise<string> {
    try {
        // First, try to get existing email preferences
        const preferences = await getUserEmailPreferences(userId);
        if (preferences) {
            return preferences.email;
        }

        // Try migration from legacy email field
        const migration = await migrateUserEmailIfNeeded(userId);
        if (migration.migrated && migration.email) {
            return migration.email;
        }

        // Generate dummy email as fallback
        const dummyEmail = generateDummyEmail(userId, username);
        
        // Store the dummy email for consistency
        await updateUserEmail(userId, dummyEmail, true);
        
        return dummyEmail;
    } catch (error) {
        // Final fallback - generate dummy email without storing
        return generateDummyEmail(userId, username);
    }
}

/**
 * Creates a user-friendly email display string
 * Masks email for privacy while keeping it recognizable
 * 
 * @param email - Email address to display
 * @param isDummy - Whether this is a dummy email
 * @returns Formatted display string
 */
export function formatEmailForDisplay(email: string, isDummy?: boolean): string {
    if (isDummy || email.includes('@telegram.user')) {
        return `${email} (temporary)`;
    }
    
    // Mask email for privacy: user***@example.com
    const atIndex = email.indexOf('@');
    if (atIndex === -1) {
        return email; // Invalid email format, return as-is
    }
    
    const localPart = email.substring(0, atIndex);
    const domain = email.substring(atIndex + 1);
    
    if (localPart.length <= 3) {
        return `${localPart}***@${domain}`;
    }
    
    return `${localPart.substring(0, 3)}***@${domain}`;
}