/**
 * SupportCommand Test Suite
 * 
 * Comprehensive test coverage for support ticket creation functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupportCommand } from '../commands/support/SupportCommandClean.js';
import type { BotContext } from '../types/index.js';
import type { UserState } from '../sdk/types.js';

// Mock external dependencies
vi.mock('../sdk/bots-brain/index.js', () => ({
    BotsStore: {
        getUserState: vi.fn(),
        storeUserState: vi.fn(),
        clearUserState: vi.fn(),
        setUserState: vi.fn(),
        getGroupConfig: vi.fn(),
        getUserByTelegramId: vi.fn(),
    }
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

vi.mock('../utils/emailManager.js', () => ({
    getUserEmailPreferences: vi.fn(),
}));

import { BotsStore } from '../sdk/bots-brain/index.js';
import { LogEngine } from '@wgtechlabs/log-engine';

describe('SupportCommand', () => {
    let supportCommand: SupportCommand;
    let mockContext: Partial<BotContext>;
    
    beforeEach(() => {
        vi.clearAllMocks();
        supportCommand = new SupportCommand();
        
        // Mock default group config for setup validation
        vi.mocked(BotsStore.getGroupConfig).mockResolvedValue({
            isConfigured: true,
            chatId: -67890,
            customerId: 'customer-123'
        });
        
        // Mock default user state (no active session)
        vi.mocked(BotsStore.getUserState).mockResolvedValue(null);
        
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
            reply: vi.fn().mockResolvedValue({}),
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
        vi.restoreAllMocks();
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

            vi.mocked(BotsStore.getUserState).mockResolvedValue(existingState);

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

            vi.mocked(BotsStore.getUserState).mockResolvedValue(existingState);

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
            vi.mocked(BotsStore.getUserState).mockResolvedValue(null);

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
            vi.mocked(BotsStore.getUserState).mockResolvedValue(null);

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
            vi.mocked(BotsStore.getUserState).mockRejectedValue(error);

            await supportCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error in support command', {
                error: 'Database connection failed',
                userId: 12345,
                chatId: -67890
            });
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Unable to process support request'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle non-Error exceptions', async () => {
            vi.mocked(BotsStore.getUserState).mockRejectedValue('String error');

            await supportCommand.execute(mockContext as BotContext);

            expect(LogEngine.error).toHaveBeenCalledWith('Error in support command', {
                error: 'Unknown error',
                userId: 12345,
                chatId: -67890
            });
        });

        it('should handle error when starting new ticket creation', async () => {
            vi.mocked(BotsStore.getUserState).mockResolvedValue(null);
            // Mock reply to throw error to simulate ticket creation start failure
            vi.mocked(mockContext.reply).mockRejectedValueOnce(new Error('Reply failed'));

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
                userId: 12345,
                currentState: 'awaiting_ticket_subject',
                stateData: {
                    ticketType: 'general',
                    createdAt: '2023-01-01T00:00:00.000Z'
                },
                lastUpdated: '2023-01-01T00:00:00.000Z',
                expiresAt: '2022-12-31T23:59:59.000Z' // Expired
            };

            vi.mocked(BotsStore.getUserState).mockResolvedValue(expiredState);

            await supportCommand.execute(mockContext as BotContext);

            // Should still handle expired state and show options
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Active Session Found'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        it('should handle empty state data', async () => {
            const stateWithoutData: UserState = {
                userId: 12345,
                currentState: 'awaiting_ticket_subject',
                stateData: {},
                lastUpdated: '2023-01-01T00:00:00.000Z',
                expiresAt: '2023-01-01T01:00:00.000Z'
            };

            vi.mocked(BotsStore.getUserState).mockResolvedValue(stateWithoutData);

            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Active Session Found'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });
    });

    describe('Integration', () => {
        it('should work correctly in supergroup chat', async () => {
            mockContext.chat = { id: -67890, type: 'supergroup', title: 'Support Group' };
            vi.mocked(BotsStore.getUserState).mockResolvedValue(null);

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
            vi.mocked(BotsStore.getUserState).mockResolvedValue(null);

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
            vi.mocked(BotsStore.getUserState).mockResolvedValue(null);

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

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support tickets can only be created in group chats'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle negative user ID', async () => {
            mockContext.from = { ...mockContext.from!, id: -12345 };
            
            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support tickets can only be created in group chats'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle exactly zero chat ID', async () => {
            mockContext.chat = { id: 0, type: 'group' };
            
            await supportCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Support tickets can only be created in group chats'),
                { parse_mode: 'Markdown' }
            );
        });
    });
});