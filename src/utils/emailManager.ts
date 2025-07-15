/**
 * Email Management Utilities - Single Source of Truth for Email Operations
 * 
 * CRITICAL ARCHITECTURAL REQUIREMENT:
 * This module enforces the use of ONLY the `unthreadEmail` field for all email operations.
 * 
 * EMAIL FIELD POLICY:
 * - ONLY use `UserData.unthreadEmail` for email storage and retrieval
 * - NEVER create or use additional email fields in UserData interface
 * - ALL email operations (validation, storage, retrieval) use unthreadEmail
 * - Ticket creation uses unthreadEmail for onBehalfOf.email parameter
 * - Email preferences and status checks use unthreadEmail exclusively
 * 
 * This prevents data fragmentation, ensures consistency, and maintains
 * a clear contract for future development.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BotsStore } from '../sdk/bots-brain/index.js';
import { LogEngine } from '@wgtechlabs/log-engine';
import type { UserData } from '../sdk/types.js';

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
    return `@${cleanIdentifier}_${userId}@telegram.user`;
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
        
        // Log for debugging
        LogEngine.info('Getting user email preferences', {
            userId,
            userExists: !!userData,
            hasUnthreadEmail: !!userData?.unthreadEmail,
            unthreadEmail: userData?.unthreadEmail
        });
        
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
        LogEngine.error('Error retrieving user email preferences', {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId
        });
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

        // Ensure user exists before updating email
        let userData = await BotsStore.getUserByTelegramId(userId);
        
        if (!userData) {
            // Create user if they don't exist
            LogEngine.info('Creating new user for email update', { userId });
            
            const newUserData: UserData = {
                id: `user_${userId}`,
                telegramUserId: userId,
                unthreadEmail: sanitizedEmail,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            const storeSuccess = await BotsStore.storeUser(newUserData);
            
            if (!storeSuccess) {
                return {
                    success: false,
                    error: 'Failed to create user profile'
                };
            }
            
            LogEngine.info('User created successfully with email', {
                userId,
                emailDomain: sanitizedEmail.split('@')[1],
                isDummy
            });
            
            return { success: true };
        }

        // Update existing user email in storage - SIMPLIFIED to use only unthreadEmail
        const updateSuccess = await BotsStore.updateUser(userId, {
            unthreadEmail: sanitizedEmail,
            updatedAt: new Date().toISOString()
        });
        
        LogEngine.info('User email update attempt', {
            userId,
            updateSuccess,
            emailDomain: sanitizedEmail.split('@')[1],
            isDummy
        });
        
        if (!updateSuccess) {
            return {
                success: false,
                error: 'Failed to store email in database'
            };
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
