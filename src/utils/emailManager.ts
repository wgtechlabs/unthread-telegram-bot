/**
 * Email Management Utilities
 * 
 * Provides comprehensive email handling for the support ticket system,
 * including validation, dummy email generation, and user preference management.
 * This demonstrates proper user data management patterns and graceful defaults.
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
    // Use the same pattern as unthread service auto-generation
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
 * Retrieves user's email preferences - SIMPLIFIED to use only unthreadEmail
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
        // For dummy emails, skip validation since they have special format
        if (!isDummy) {
            const validation = validateEmail(email);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: validation.error || 'Invalid email format'
                };
            }
            email = validation.sanitizedValue || email;
        }

        // Update user email in storage - SIMPLIFIED to use only unthreadEmail
        const userData = await BotsStore.getUserByTelegramId(userId);
        if (userData) {
            userData.unthreadEmail = email;
            userData.updatedAt = new Date().toISOString();
            await BotsStore.storeUser(userData);
        } else {
            // Create new user if doesn't exist
            await BotsStore.storeUser({
                telegramUserId: userId,
                unthreadEmail: email,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            } as any);
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: 'Failed to update email address. Please try again.'
        };
    }
}

/**
 * Determines the appropriate email setup step for a user
 * This is the core logic for progressive onboarding
 * 
 * @param userId - Telegram user ID
 * @returns Email setup status and recommended action
 */
export async function getUserEmailStatus(userId: number): Promise<{
    hasEmail: boolean;
    isDummy: boolean;
    needsSetup: boolean;
    email?: string;
    recommendedAction: 'first_time_setup' | 'continue_with_existing' | 'suggest_real_email';
}> {
    const preferences = await getUserEmailPreferences(userId);
    
    if (!preferences) {
        // First-time user - needs complete setup
        return {
            hasEmail: false,
            isDummy: false,
            needsSetup: true,
            recommendedAction: 'first_time_setup'
        };
    }
    
    if (preferences.isDummy) {
        // User has dummy email - suggest upgrading to real email
        return {
            hasEmail: true,
            isDummy: true,
            needsSetup: false,
            email: preferences.email,
            recommendedAction: 'suggest_real_email'
        };
    }
    
    // User has real email - good to go
    return {
        hasEmail: true,
        isDummy: false,
        needsSetup: false,
        email: preferences.email,
        recommendedAction: 'continue_with_existing'
    };
}

/**
 * Creates a user-friendly email display string
 * Masks email for privacy while keeping it recognizable
 * 
 * @param email - Email address to display
 * @param isDummy - Whether this is a dummy email
 * @returns Formatted display string
 */
export function formatEmailForDisplay(email: string, isDummy: boolean): string {
    if (isDummy) {
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