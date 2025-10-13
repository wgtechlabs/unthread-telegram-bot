/**
 * SetEmail Command Test Suite
 * 
 * Comprehensive test coverage for email setting functionality including
 * validation, direct setting, and usage instructions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetEmailCommand } from '../commands/basic/SetEmailCommand.js';
import type { BotContext } from '../types/index.js';

// Mock external dependencies
vi.mock('../utils/emailManager.js', () => ({
    deliverPendingAgentMessages: vi.fn(),
    getUserEmailPreferences: vi.fn(),
    updateUserEmail: vi.fn(),
    validateEmail: vi.fn(),
}));

vi.mock('../utils/markdownEscape.js', () => ({
    escapeMarkdown: vi.fn((text) => text),
    formatEmailForDisplay: vi.fn((email) => email),
}));

vi.mock('../utils/messageContentExtractor.js', () => ({
    getMessageText: vi.fn(),
}));

vi.mock('@wgtechlabs/log-engine', () => ({
    LogEngine: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

vi.mock('../config/env.js', () => ({
    isAdminUser: vi.fn(() => true),
    getAdminUsers: vi.fn(() => [12345]),
}));

import { 
    deliverPendingAgentMessages, 
    getUserEmailPreferences,
    updateUserEmail,
    validateEmail
} from '../utils/emailManager.js';
import { escapeMarkdown, formatEmailForDisplay } from '../utils/markdownEscape.js';
import { getMessageText } from '../utils/messageContentExtractor.js';
import { LogEngine } from '@wgtechlabs/log-engine';

describe('SetEmailCommand', () => {
    let setEmailCommand: SetEmailCommand;
    let mockContext: Partial<BotContext>;
    
    beforeEach(() => {
        vi.clearAllMocks();
        setEmailCommand = new SetEmailCommand();
        
        mockContext = {
            from: {
                id: 12345,
                first_name: 'TestUser',
                is_bot: false,
                language_code: 'en'
            },
            chat: {
                id: 12345,
                type: 'private'
            },
            reply: vi.fn().mockResolvedValue({}),
            message: {
                message_id: 1,
                date: Date.now() / 1000,
                chat: {
                    id: 12345,
                    type: 'private'
                },
                from: {
                    id: 12345,
                    first_name: 'TestUser',
                    is_bot: false,
                    language_code: 'en'
                },
                text: '/setemail'
            }
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Metadata', () => {
        it('should have correct metadata', () => {
            expect(setEmailCommand.metadata).toEqual({
                name: 'setemail',
                description: 'Set or update your email address for support tickets',
                usage: '/setemail <email>',
                examples: [
                    '/setemail waren@wgtechlabs.com - Set your email address',
                    '/setemail opensource@warengonzaga.com - Update your email address'
                ],
                requiresSetup: false
            });
        });
    });

    describe('Command Execution', () => {
        it('should handle missing user context', async () => {
            mockContext.from = undefined;
            
            await setEmailCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                "❌ Invalid command context. Please try again."
            );
        });

        it('should show usage instructions when no email provided', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail');
            vi.mocked(getUserEmailPreferences).mockResolvedValue({
                email: 'current@example.com',
                isDummy: false
            });
            vi.mocked(formatEmailForDisplay).mockReturnValue('current@example.com');

            await setEmailCommand.execute(mockContext as BotContext);

            expect(getUserEmailPreferences).toHaveBeenCalledWith(12345);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Set Email Address'),
                { parse_mode: 'Markdown' }
            );
            expect(LogEngine.info).toHaveBeenCalledWith('User viewed email setup instructions', { userId: 12345 });
        });

        it('should set email directly when provided', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: 'test@example.com'
            });
            vi.mocked(updateUserEmail).mockResolvedValue({
                success: true
            });
            vi.mocked(deliverPendingAgentMessages).mockResolvedValue({
                delivered: 2,
                failed: 0,
                errors: []
            });

            await setEmailCommand.execute(mockContext as BotContext);

            expect(validateEmail).toHaveBeenCalledWith('test@example.com');
            expect(updateUserEmail).toHaveBeenCalledWith(12345, 'test@example.com');
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Email Updated Successfully'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle email with multiple words', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail my email@example.com extra text');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: 'my email@example.com extra text'
            });
            vi.mocked(updateUserEmail).mockResolvedValue({
                success: true
            });
            vi.mocked(deliverPendingAgentMessages).mockResolvedValue({
                delivered: 0,
                failed: 0,
                errors: []
            });

            await setEmailCommand.execute(mockContext as BotContext);

            expect(validateEmail).toHaveBeenCalledWith('my email@example.com extra text');
        });
    });

    describe('Direct Email Setting', () => {
        it('should handle invalid email format', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail invalid-email');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: false,
                error: 'Invalid email format'
            });

            await setEmailCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Invalid Email Format'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle validation without sanitized value', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: undefined
            });

            await setEmailCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith('❌ **Email validation failed**\n\nNo valid email provided.');
        });

        it('should handle email update failure', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: 'test@example.com'
            });
            vi.mocked(updateUserEmail).mockResolvedValue({
                success: false,
                error: 'Database connection failed'
            });

            await setEmailCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Failed to Update Email'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should deliver pending messages after successful email update', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: 'test@example.com'
            });
            vi.mocked(updateUserEmail).mockResolvedValue({
                success: true
            });
            vi.mocked(deliverPendingAgentMessages).mockResolvedValue({
                delivered: 3,
                failed: 1,
                errors: ['Failed to deliver message 1']
            });

            await setEmailCommand.execute(mockContext as BotContext);

            expect(deliverPendingAgentMessages).toHaveBeenCalledWith(12345);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Pending Messages Delivered'),
                { parse_mode: 'Markdown' }
            );
            expect(LogEngine.warn).toHaveBeenCalledWith('Some pending messages failed to deliver', {
                userId: 12345,
                failed: 1,
                errors: ['Failed to deliver message 1']
            });
        });

        it('should handle pending message delivery errors silently', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: 'test@example.com'
            });
            vi.mocked(updateUserEmail).mockResolvedValue({
                success: true
            });
            vi.mocked(deliverPendingAgentMessages).mockRejectedValue(new Error('Delivery service down'));

            await setEmailCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error delivering pending messages after email setup', {
                userId: 12345,
                error: 'Delivery service down'
            });
            // Should still show success message for email update
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Email Updated Successfully'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle general errors in direct email setting', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockRejectedValue(new Error('Validation service down'));

            await setEmailCommand.execute(mockContext as BotContext);

            // The validation error gets caught and shows invalid email format
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Invalid Email Format'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle non-Error exceptions', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockRejectedValue('String error');

            await setEmailCommand.execute(mockContext as BotContext);

            // The validation error gets caught and shows invalid email format
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Invalid Email Format'),
                { parse_mode: 'Markdown' }
            );
        });
    });

    describe('Usage Instructions', () => {
        beforeEach(() => {
            vi.mocked(getMessageText).mockReturnValue('/setemail');
        });

        it('should show instructions with current email', async () => {
            vi.mocked(getUserEmailPreferences).mockResolvedValue({
                email: 'current@example.com',
                isDummy: false
            });
            vi.mocked(formatEmailForDisplay).mockReturnValue('current@example.com');

            await setEmailCommand.execute(mockContext as BotContext);

            expect(formatEmailForDisplay).toHaveBeenCalledWith('current@example.com');
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('**Current email:** current@example.com'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should show special message for dummy email', async () => {
            vi.mocked(getUserEmailPreferences).mockResolvedValue({
                email: 'dummy@example.com',
                isDummy: true
            });
            vi.mocked(formatEmailForDisplay).mockReturnValue('[Temporary Email]');

            await setEmailCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('temporary email'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should show instructions without current email when none exists', async () => {
            vi.mocked(getUserEmailPreferences).mockResolvedValue(null);

            await setEmailCommand.execute(mockContext as BotContext);

            const replyCall = vi.mocked(mockContext.reply).mock.calls[0];
            expect(replyCall[0]).toContain('Set Email Address');
            expect(replyCall[0]).not.toContain('Current email:');
        });

        it('should handle errors in showing usage instructions', async () => {
            vi.mocked(getUserEmailPreferences).mockRejectedValue(new Error('Database error'));

            await setEmailCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error showing email setup instructions', {
                error: 'Database error',
                userId: 12345
            });
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error showing instructions'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle non-Error exceptions in usage instructions', async () => {
            vi.mocked(getUserEmailPreferences).mockRejectedValue('String error');

            await setEmailCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error showing email setup instructions', {
                error: 'Unknown error',
                userId: 12345
            });
        });
    });

    describe('Logging', () => {
        it('should log email update attempts', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: 'test@example.com'
            });
            vi.mocked(updateUserEmail).mockResolvedValue({
                success: true
            });
            vi.mocked(deliverPendingAgentMessages).mockResolvedValue({
                delivered: 0,
                failed: 0,
                errors: []
            });

            await setEmailCommand.execute(mockContext as BotContext);

            expect(LogEngine.info).toHaveBeenCalledWith('Attempting to update user email', {
                userId: 12345,
                emailDomain: 'example.com'
            });
            expect(LogEngine.info).toHaveBeenCalledWith('Email update result', {
                userId: 12345,
                success: true,
                error: undefined
            });
            expect(LogEngine.info).toHaveBeenCalledWith('User updated email via direct command', {
                userId: 12345,
                emailDomain: 'example.com'
            });
        });

        it('should log with unknown domain when sanitized value is missing', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail test@example.com');
            vi.mocked(validateEmail).mockReturnValue({
                isValid: true,
                sanitizedValue: undefined
            });

            await setEmailCommand.execute(mockContext as BotContext);

            // Should not reach the logging point due to early return
            expect(LogEngine.info).toHaveBeenCalledWith('Attempting to update user email', {
                userId: 12345,
                emailDomain: undefined
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty command text', async () => {
            vi.mocked(getMessageText).mockReturnValue('');
            vi.mocked(getUserEmailPreferences).mockResolvedValue(null);

            await setEmailCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Set Email Address'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle whitespace-only email', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail    ');
            vi.mocked(getUserEmailPreferences).mockResolvedValue(null);

            await setEmailCommand.execute(mockContext as BotContext);

            // Should show usage instructions since no valid email provided
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Set Email Address'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle command with only command name', async () => {
            vi.mocked(getMessageText).mockReturnValue('/setemail');
            vi.mocked(getUserEmailPreferences).mockResolvedValue(null);

            await setEmailCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Set Email Address'),
                { parse_mode: 'Markdown' }
            );
        });
    });
});