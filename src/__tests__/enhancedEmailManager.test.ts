/**
 * Enhanced Email Manager Test Suite
 * 
 * Comprehensive test coverage for email management functionality to significantly
 * improve coverage from current 22.7% to near 100%.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserData } from '../sdk/types.js';

// Mock external dependencies
vi.mock('../sdk/bots-brain/index.js', () => ({
    BotsStore: {
        getUserData: vi.fn(),
        storeUserData: vi.fn(),
        getPendingAgentMessages: vi.fn(),
        clearPendingAgentMessages: vi.fn(),
    }
}));

vi.mock('@wgtechlabs/log-engine', () => ({
    LogEngine: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }
}));

import { 
    validateEmail,
    generateDummyEmail,
    formatEmailForDisplay,
    getUserEmailPreferences,
    updateUserEmail,
    deliverPendingAgentMessages,
    type EmailValidationResult,
    type UserEmailPreferences
} from '../utils/emailManager.js';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { LogEngine } from '@wgtechlabs/log-engine';

describe('Email Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset environment variables
        process.env.DUMMY_EMAIL_DOMAIN = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('validateEmail', () => {
        it('should validate correct email formats', () => {
            const validEmails = [
                'test@example.com',
                'user.name+tag@domain.co.uk',
                'x@domain.org',
                'very.long.email.address@very.long.domain.name.com',
                'user123@test-domain.com'
            ];

            validEmails.forEach(email => {
                const result = validateEmail(email);
                expect(result.isValid).toBe(true);
                expect(result.sanitizedValue).toBe(email.toLowerCase().trim());
                expect(result.error).toBeUndefined();
            });
        });

        it('should reject invalid email formats', () => {
            const invalidEmails = [
                'not-an-email',
                '@domain.com',
                'user@',
                'user..name@domain.com',
                '.user@domain.com',
                'user@domain.',
                'user name@domain.com',
                'user@domain',
                ''
            ];

            invalidEmails.forEach(email => {
                const result = validateEmail(email);
                expect(result.isValid).toBe(false);
                expect(result.error).toBeDefined();
                expect(result.sanitizedValue).toBeUndefined();
            });
        });

        it('should handle email length validation', () => {
            // Email too long (over 254 characters)
            const longEmail = 'a'.repeat(250) + '@domain.com';
            const result = validateEmail(longEmail);
            
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('too long');
        });

        it('should handle null and undefined inputs', () => {
            const inputs = [null, undefined, '', '   '];
            
            inputs.forEach(input => {
                const result = validateEmail(input as any);
                expect(result.isValid).toBe(false);
                expect(result.error).toBeDefined();
            });
        });

        it('should normalize email case and whitespace', () => {
            const result = validateEmail('  Test.User@EXAMPLE.COM  ');
            
            expect(result.isValid).toBe(true);
            expect(result.sanitizedValue).toBe('test.user@example.com');
        });

        it('should handle non-string inputs', () => {
            const nonStringInputs = [123, {}, [], true, false];
            
            nonStringInputs.forEach(input => {
                const result = validateEmail(input as any);
                expect(result.isValid).toBe(false);
                expect(result.error).toBe('Email address is required');
            });
        });
    });

    describe('generateDummyEmail', () => {
        it('should generate dummy email with username', () => {
            const email = generateDummyEmail(12345, 'testuser');
            
            expect(email).toBe('testuser@telegram.user');
        });

        it('should generate dummy email without username', () => {
            const email = generateDummyEmail(67890);
            
            expect(email).toBe('user67890@telegram.user');
        });

        it('should use custom domain from environment', () => {
            process.env.DUMMY_EMAIL_DOMAIN = 'custom.domain.com';
            
            // Need to re-import to get updated config
            vi.resetModules();
            const { generateDummyEmail: genEmail } = require('../utils/emailManager.js');
            
            const email = genEmail(12345, 'testuser');
            expect(email).toBe('testuser@custom.domain.com');
        });

        it('should handle empty username', () => {
            const email = generateDummyEmail(12345, '');
            
            expect(email).toBe('user12345@telegram.user');
        });

        it('should handle whitespace-only username', () => {
            const email = generateDummyEmail(12345, '   ');
            
            expect(email).toBe('user12345@telegram.user');
        });

        it('should handle zero user ID', () => {
            const email = generateDummyEmail(0, 'testuser');
            
            expect(email).toBe('testuser@telegram.user');
        });

        it('should handle negative user ID', () => {
            const email = generateDummyEmail(-12345, 'testuser');
            
            expect(email).toBe('testuser@telegram.user');
        });
    });

    describe('formatEmailForDisplay', () => {
        it('should display regular email as-is', () => {
            const result = formatEmailForDisplay('user@example.com', false);
            
            expect(result).toBe('user@example.com');
        });

        it('should format dummy email with placeholder', () => {
            const result = formatEmailForDisplay('user123@telegram.user', true);
            
            expect(result).toBe('[Temporary Email]');
        });

        it('should handle null email', () => {
            const result = formatEmailForDisplay(null as any, false);
            
            expect(result).toBe('[No Email Set]');
        });

        it('should handle undefined email', () => {
            const result = formatEmailForDisplay(undefined as any, true);
            
            expect(result).toBe('[No Email Set]');
        });

        it('should handle empty email', () => {
            const result = formatEmailForDisplay('', false);
            
            expect(result).toBe('[No Email Set]');
        });

        it('should handle whitespace-only email', () => {
            const result = formatEmailForDisplay('   ', true);
            
            expect(result).toBe('[No Email Set]');
        });
    });

    describe('getUserEmailPreferences', () => {
        it('should return preferences for user with real email', async () => {
            const mockUserData: UserData = {
                telegramUserId: 12345,
                unthreadEmail: 'user@example.com',
                isEmailDummy: false,
                emailSetAt: '2023-01-01T00:00:00.000Z',
                lastUpdatedAt: '2023-01-01T00:00:00.000Z'
            };

            vi.mocked(BotsStore.getUserData).mockResolvedValue(mockUserData);

            const result = await getUserEmailPreferences(12345);

            expect(result).toEqual({
                email: 'user@example.com',
                isDummy: false,
                setAt: '2023-01-01T00:00:00.000Z',
                canModify: true
            });
        });

        it('should return preferences for user with dummy email', async () => {
            const mockUserData: UserData = {
                telegramUserId: 12345,
                unthreadEmail: 'user12345@telegram.user',
                isEmailDummy: true,
                emailSetAt: '2023-01-01T00:00:00.000Z',
                lastUpdatedAt: '2023-01-01T00:00:00.000Z'
            };

            vi.mocked(BotsStore.getUserData).mockResolvedValue(mockUserData);

            const result = await getUserEmailPreferences(12345);

            expect(result).toEqual({
                email: 'user12345@telegram.user',
                isDummy: true,
                setAt: '2023-01-01T00:00:00.000Z',
                canModify: true
            });
        });

        it('should return null for user without data', async () => {
            vi.mocked(BotsStore.getUserData).mockResolvedValue(null);

            const result = await getUserEmailPreferences(12345);

            expect(result).toBe(null);
        });

        it('should handle database errors', async () => {
            vi.mocked(BotsStore.getUserData).mockRejectedValue(new Error('Database error'));

            const result = await getUserEmailPreferences(12345);

            expect(result).toBe(null);
            expect(LogEngine.error).toHaveBeenCalledWith(
                'Error getting user email preferences',
                expect.objectContaining({
                    userId: 12345,
                    error: 'Database error'
                })
            );
        });

        it('should handle missing email in user data', async () => {
            const mockUserData: UserData = {
                telegramUserId: 12345,
                lastUpdatedAt: '2023-01-01T00:00:00.000Z'
                // No unthreadEmail field
            } as any;

            vi.mocked(BotsStore.getUserData).mockResolvedValue(mockUserData);

            const result = await getUserEmailPreferences(12345);

            expect(result).toBe(null);
        });
    });

    describe('updateUserEmail', () => {
        it('should successfully update user email', async () => {
            const existingUserData: UserData = {
                telegramUserId: 12345,
                unthreadEmail: 'old@example.com',
                isEmailDummy: false,
                emailSetAt: '2023-01-01T00:00:00.000Z',
                lastUpdatedAt: '2023-01-01T00:00:00.000Z'
            };

            vi.mocked(BotsStore.getUserData).mockResolvedValue(existingUserData);
            vi.mocked(BotsStore.storeUserData).mockResolvedValue();

            const result = await updateUserEmail(12345, 'new@example.com');

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(BotsStore.storeUserData).toHaveBeenCalledWith(
                expect.objectContaining({
                    telegramUserId: 12345,
                    unthreadEmail: 'new@example.com',
                    isEmailDummy: false,
                    emailSetAt: expect.any(String),
                    lastUpdatedAt: expect.any(String)
                })
            );
        });

        it('should create new user data for first-time email setting', async () => {
            vi.mocked(BotsStore.getUserData).mockResolvedValue(null);
            vi.mocked(BotsStore.storeUserData).mockResolvedValue();

            const result = await updateUserEmail(12345, 'new@example.com');

            expect(result.success).toBe(true);
            expect(BotsStore.storeUserData).toHaveBeenCalledWith(
                expect.objectContaining({
                    telegramUserId: 12345,
                    unthreadEmail: 'new@example.com',
                    isEmailDummy: false
                })
            );
        });

        it('should handle database storage errors', async () => {
            vi.mocked(BotsStore.getUserData).mockResolvedValue(null);
            vi.mocked(BotsStore.storeUserData).mockRejectedValue(new Error('Storage failed'));

            const result = await updateUserEmail(12345, 'new@example.com');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Storage failed');
            expect(LogEngine.error).toHaveBeenCalledWith(
                'Error updating user email',
                expect.objectContaining({
                    userId: 12345,
                    error: 'Storage failed'
                })
            );
        });

        it('should handle database retrieval errors', async () => {
            vi.mocked(BotsStore.getUserData).mockRejectedValue(new Error('Retrieval failed'));

            const result = await updateUserEmail(12345, 'new@example.com');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Retrieval failed');
        });

        it('should validate email before updating', async () => {
            const result = await updateUserEmail(12345, 'invalid-email');

            expect(result.success).toBe(false);
            expect(result.error).toContain('valid email address');
            expect(BotsStore.storeUserData).not.toHaveBeenCalled();
        });

        it('should handle empty email input', async () => {
            const result = await updateUserEmail(12345, '');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(BotsStore.storeUserData).not.toHaveBeenCalled();
        });
    });

    describe('deliverPendingAgentMessages', () => {
        it('should deliver pending messages successfully', async () => {
            const mockPendingMessages = [
                { id: '1', content: 'Message 1', timestamp: '2023-01-01T00:00:00.000Z' },
                { id: '2', content: 'Message 2', timestamp: '2023-01-01T00:01:00.000Z' }
            ];

            vi.mocked(BotsStore.getPendingAgentMessages).mockResolvedValue(mockPendingMessages);
            vi.mocked(BotsStore.clearPendingAgentMessages).mockResolvedValue();

            const result = await deliverPendingAgentMessages(12345);

            expect(result.delivered).toBe(2);
            expect(result.failed).toBe(0);
            expect(result.errors).toEqual([]);
            expect(BotsStore.clearPendingAgentMessages).toHaveBeenCalledWith(12345);
        });

        it('should handle no pending messages', async () => {
            vi.mocked(BotsStore.getPendingAgentMessages).mockResolvedValue([]);

            const result = await deliverPendingAgentMessages(12345);

            expect(result.delivered).toBe(0);
            expect(result.failed).toBe(0);
            expect(result.errors).toEqual([]);
            expect(BotsStore.clearPendingAgentMessages).not.toHaveBeenCalled();
        });

        it('should handle delivery errors', async () => {
            vi.mocked(BotsStore.getPendingAgentMessages).mockRejectedValue(new Error('Delivery failed'));

            const result = await deliverPendingAgentMessages(12345);

            expect(result.delivered).toBe(0);
            expect(result.failed).toBe(0);
            expect(result.errors).toEqual(['Failed to retrieve pending messages: Delivery failed']);
            expect(LogEngine.error).toHaveBeenCalledWith(
                'Error delivering pending agent messages',
                expect.objectContaining({
                    userId: 12345,
                    error: 'Delivery failed'
                })
            );
        });

        it('should handle partial delivery failures', async () => {
            const mockPendingMessages = [
                { id: '1', content: 'Message 1', timestamp: '2023-01-01T00:00:00.000Z' },
                { id: '2', content: 'Message 2', timestamp: '2023-01-01T00:01:00.000Z' }
            ];

            vi.mocked(BotsStore.getPendingAgentMessages).mockResolvedValue(mockPendingMessages);
            vi.mocked(BotsStore.clearPendingAgentMessages).mockRejectedValue(new Error('Clear failed'));

            const result = await deliverPendingAgentMessages(12345);

            expect(result.delivered).toBe(2);
            expect(result.failed).toBe(0);
            expect(result.errors).toEqual([]);
            expect(LogEngine.warn).toHaveBeenCalledWith(
                'Failed to clear pending messages after delivery',
                expect.objectContaining({
                    userId: 12345,
                    error: 'Clear failed'
                })
            );
        });
    });

    describe('Edge Cases and Integration', () => {
        it('should handle very long valid emails', () => {
            const longLocalPart = 'a'.repeat(64);
            const longDomain = 'b'.repeat(60) + '.com';
            const longEmail = `${longLocalPart}@${longDomain}`;
            
            const result = validateEmail(longEmail);
            
            expect(result.isValid).toBe(true);
            expect(result.sanitizedValue).toBe(longEmail);
        });

        it('should handle international domain names', () => {
            const result = validateEmail('user@résumé.com');
            
            // Note: This may fail with our simple regex - that's expected behavior
            expect(result.isValid).toBe(false);
        });

        it('should handle email update with same email', async () => {
            const existingUserData: UserData = {
                telegramUserId: 12345,
                unthreadEmail: 'same@example.com',
                isEmailDummy: false,
                emailSetAt: '2023-01-01T00:00:00.000Z',
                lastUpdatedAt: '2023-01-01T00:00:00.000Z'
            };

            vi.mocked(BotsStore.getUserData).mockResolvedValue(existingUserData);
            vi.mocked(BotsStore.storeUserData).mockResolvedValue();

            const result = await updateUserEmail(12345, 'same@example.com');

            expect(result.success).toBe(true);
            // Should still update timestamps even for same email
            expect(BotsStore.storeUserData).toHaveBeenCalled();
        });

        it('should handle concurrent email updates', async () => {
            vi.mocked(BotsStore.getUserData).mockResolvedValue(null);
            vi.mocked(BotsStore.storeUserData).mockResolvedValue();

            // Simulate concurrent updates
            const promises = [
                updateUserEmail(12345, 'email1@example.com'),
                updateUserEmail(12345, 'email2@example.com')
            ];

            const results = await Promise.all(promises);

            // Both should succeed (no locking mechanism tested)
            results.forEach(result => {
                expect(result.success).toBe(true);
            });
        });

        it('should handle user ID validation', async () => {
            const invalidUserIds = [0, -1, NaN, null, undefined];

            for (const userId of invalidUserIds) {
                const result = await updateUserEmail(userId as any, 'test@example.com');
                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
            }
        });
    });
});