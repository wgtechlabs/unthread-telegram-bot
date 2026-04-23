/**
 * SupportCommand Test Suite
 * 
 * Comprehensive test coverage for support ticket creation functionality.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { clearAllMocks, createMock, restoreAllMocks } from './_helpers/mockLifecycle';
import { SupportCommand } from '../commands/support/SupportCommandClean.js';
import type { BotContext } from '../types/index.js';
import type { UserState } from '../sdk/types.js';

// Mock external dependencies
mock.module('../sdk/bots-brain/index.js', () => ({
    BotsStore: {
        getUserState: createMock(),
        storeUserState: createMock(),
        clearUserState: createMock(),
        setUserState: createMock(),
        getGroupConfig: createMock(),
        getUserByTelegramId: createMock(),
    }
}));

mock.module('@wgtechlabs/log-engine', () => ({
    LogEngine: {
        info: createMock(),
        warn: createMock(),
        error: createMock(),
    }
}));

mock.module('../config/env.js', () => ({
    isAdminUser: createMock(() => true),
    getAdminUsers: createMock(() => [12345]),
}));

mock.module('../utils/emailManager.js', () => ({
    getUserEmailPreferences: createMock(() => Promise.resolve({
        email: 'test@example.com',
        isDummy: false,
        setAt: new Date().toISOString(),
        canModify: true
    })),
}));

import { BotsStore } from '../sdk/bots-brain/index.js';
import { LogEngine } from '@wgtechlabs/log-engine';

describe('SupportCommand', () => {
    let supportCommand: SupportCommand;
    let mockContext: Partial<BotContext>;
    
    beforeEach(() => {
        clearAllMocks();
        supportCommand = new SupportCommand();
        
        // Mock default group config for setup validation
        (BotsStore.getGroupConfig as any).mockResolvedValue({
            isConfigured: true,
            chatId: -67890,
            customerId: 'customer-123'
        });
        
        // Mock default user state (no active session)
        (BotsStore.getUserState as any).mockResolvedValue(null);
        
        mockContext = {
            from: {
                id: 12345,
                first_name: 'TestUser',
                is_bot: false,
                language_code: 'en'
            },
            chat: {
                id: -67890,
                type: 'supergroup',
                title: 'Test Support Group'
            },
            reply: mock().mockResolvedValue({}),
            message: {
                message_id: 1,
                date: Date.now() / 1000,
                chat: {
                    id: -67890,
                    type: 'supergroup',
                    title: 'Test Support Group'
                },
                from: {
                    id: 12345,
                    first_name: 'TestUser',
                    is_bot: false,
                    language_code: 'en'
                },
                text: '/support'
            }
        };
    });

    afterEach(() => {
        restoreAllMocks();
    });

    describe('Metadata', () => {
        it('should have correct metadata', () => {
            expect(supportCommand.metadata).toEqual({
                name: 'support',
                description: 'Create a new support ticket',
                usage: '/support',
                examples: [
                    '/support - Start the support ticket creation wizard'
                ],
                requiresSetup: true
            });
        });
    });

    describe('Command Validation', () => {
        it('should reject support command in private chat', async () => {
            mockContext.chat = { id: 12345, type: 'private' };
            
            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support tickets can only be created in group chats'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should reject support command without user ID', async () => {
            mockContext.from = undefined;
            
            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                '❌ Invalid command context. Please try again.'
            );
        });

        it('should reject support command without chat ID', async () => {
            mockContext.chat = undefined;
            
            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                '❌ Invalid command context. Please try again.'
            );
        });

        it('should reject support command in positive chat ID (private)', async () => {
            mockContext.chat = { id: 12345, type: 'group' };
            
            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support tickets can only be created in group chats'),
                { parse_mode: 'Markdown' }
            );
        });
    });

    describe('Existing Session Handling', () => {
        it('should handle existing active session', async () => {
            const existingState: UserState = {
                field: 'summary',
                summary: 'Test issue description'
            };

            (BotsStore.getUserState as any).mockResolvedValue(existingState);

            await supportCommand.execute(mockContext as BotContext);

            expect(BotsStore.getUserState).toHaveBeenCalledWith(12345);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support Ticket in Progress'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.any(Array)
                    })
                })
            );
        });

        it('should handle existing session with different state types', async () => {
            const existingState: UserState = {
                field: 'email',
                summary: 'Test technical issue'
            };

            (BotsStore.getUserState as any).mockResolvedValue(existingState);

            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support Ticket in Progress'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });
    });

    describe('New Ticket Creation', () => {
        it('should start new ticket creation when no existing session', async () => {
            (BotsStore.getUserState as any).mockResolvedValue(null);

            await supportCommand.execute(mockContext as BotContext);

            expect(BotsStore.getUserState).toHaveBeenCalledWith(12345);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Create Support Ticket'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        force_reply: true,
                        input_field_placeholder: 'Describe your issue in detail...'
                    })
                })
            );
        });

        it('should set user state for new ticket creation', async () => {
            (BotsStore.getUserState as any).mockResolvedValue(null);

            await supportCommand.execute(mockContext as BotContext);

            expect(BotsStore.setUserState).toHaveBeenCalledWith(12345, expect.objectContaining({
                processor: 'support',
                field: 'summary',
                step: 1
            }));
        });
    });

    describe('Error Handling', () => {
        it('should handle errors in getting user state', async () => {
            const error = new Error('Database connection failed');
            (BotsStore.getUserState as any).mockRejectedValue(error);

            await supportCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error in support command', {
                error: 'Database connection failed',
                userId: 12345,
                chatId: -67890
            });
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error starting support ticket'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle non-Error exceptions', async () => {
            (BotsStore.getUserState as any).mockRejectedValue('String error');

            await supportCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error in support command', {
                error: undefined,
                userId: 12345,
                chatId: -67890
            });
        });

        it('should handle error when starting new ticket creation', async () => {
            (BotsStore.getUserState as any).mockResolvedValue(null);
            // Mock reply to throw error to simulate ticket creation start failure
            (mockContext.reply as any).mockRejectedValueOnce(new Error('Reply failed'));

            await supportCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error in support command', {
                error: 'Reply failed',
                userId: 12345,
                chatId: -67890
            });
        });
    });

    describe('State Management', () => {
        it('should handle expired session state', async () => {
            const expiredState: UserState = {
                field: 'summary',
                summary: 'Old ticket data'
            };

            (BotsStore.getUserState as any).mockResolvedValue(expiredState);

            await supportCommand.execute(mockContext as BotContext);

            // Should still handle state and show session options
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support Ticket in Progress'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        it('should handle empty state data', async () => {
            const stateWithoutData: UserState = {
                field: 'email'
            };

            (BotsStore.getUserState as any).mockResolvedValue(stateWithoutData);

            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support Ticket in Progress'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });
    });

    describe('Integration', () => {
        it('should work correctly in supergroup chat', async () => {
            mockContext.chat = { id: -67890, type: 'supergroup', title: 'Support Group' };
            (BotsStore.getUserState as any).mockResolvedValue(null);

            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Create Support Ticket'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        it('should work correctly in regular group chat', async () => {
            mockContext.chat = { id: -67890, type: 'group', title: 'Support Group' };
            (BotsStore.getUserState as any).mockResolvedValue(null);

            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Create Support Ticket'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        it('should handle missing chat title gracefully', async () => {
            mockContext.chat = { id: -67890, type: 'supergroup' };
            (BotsStore.getUserState as any).mockResolvedValue(null);

            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Create Support Ticket'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero user ID', async () => {
            mockContext.from = { ...mockContext.from!, id: 0 };
            
            await supportCommand.execute(mockContext as BotContext);

            // Zero user ID still gets through to support command logic
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support tickets can only be created in group chats'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle negative user ID', async () => {
            mockContext.from = { ...mockContext.from!, id: -12345 };
            
            await supportCommand.execute(mockContext as BotContext);

            // Should work since user ID is truthy and chat ID is negative (group)
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Create Support Ticket'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        force_reply: true
                    })
                })
            );
        });

        it('should handle exactly zero chat ID', async () => {
            mockContext.chat = { id: 0, type: 'group' };
            // Mock that chat ID 0 has no group configuration
            (BotsStore.getGroupConfig as any).mockResolvedValue(null);
            
            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Group Setup Required'),
                { parse_mode: 'Markdown' }
            );
        });
    });
});
