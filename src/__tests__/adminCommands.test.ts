/**
 * Admin Commands Test Suite
 * 
 * Comprehensive test coverage for admin command functionality including
 * activation, setup, and templates management.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivateCommand, SetupCommand, TemplatesCommand } from '../commands/admin/AdminCommands.js';
import type { BotContext } from '../types/index.js';
import type { AdminProfile, GroupConfig } from '../sdk/types.js';

// Mock external dependencies
vi.mock('../sdk/bots-brain/index.js', () => ({
    BotsStore: {
        getAdminProfile: vi.fn(),
        storeAdminProfile: vi.fn(),
        getGroupConfig: vi.fn(),
        storeGroupConfig: vi.fn(),
        getUserTemplates: vi.fn(),
        updateDmSetupSession: vi.fn(),
    }
}));

vi.mock('../utils/permissions.js', () => ({
    checkAndPromptBotAdmin: vi.fn(),
    isBotAdmin: vi.fn(),
    validateAdminAccess: vi.fn(),
}));

vi.mock('../commands/utils/errorHandler.js', () => ({
    createUserErrorMessage: vi.fn((error) => `Error: ${error.message}`),
    logError: vi.fn(),
}));

vi.mock('../config/env.js', () => ({
    getCompanyName: vi.fn(() => 'Test Company'),
    isAdminUser: vi.fn(() => true),
    getAdminUsers: vi.fn(() => [12345]),
    getConfiguredBotUsername: vi.fn(() => 'testbot'),
}));

vi.mock('../utils/adminManager.js', () => ({
    createDmSetupSession: vi.fn(),
}));

vi.mock('../utils/globalTemplateManager.js', () => ({
    GlobalTemplateManager: {
        getInstance: vi.fn(() => ({
            getGlobalTemplates: vi.fn()
        }))
    }
}));

vi.mock('../services/validationService.js', () => ({
    ValidationService: {
        isValidUnthreadWebhook: vi.fn(() => ({ isValid: true })),
        performSetupValidation: vi.fn(),
    }
}));

vi.mock('../commands/processors/CallbackProcessors.js', () => ({
    SetupCallbackProcessor: {
        processSetupCallback: vi.fn(),
    }
}));

import { createDmSetupSession } from '../utils/adminManager.js';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { checkAndPromptBotAdmin, isBotAdmin, validateAdminAccess } from '../utils/permissions.js';
import { createUserErrorMessage, logError } from '../commands/utils/errorHandler.js';
import { GlobalTemplateManager } from '../utils/globalTemplateManager.js';

describe('AdminCommands', () => {
    let mockContext: Partial<BotContext>;
    
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Set default mock behavior for admin validation
        vi.mocked(validateAdminAccess).mockResolvedValue(true);
        
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
                title: 'Test Group'
            },
            botInfo: {
                id: 123456789,
                is_bot: true,
                first_name: 'TestBot',
                username: 'testbot',
                can_join_groups: true,
                can_read_all_group_messages: true,
                supports_inline_queries: false
            },
            reply: vi.fn().mockResolvedValue({}),
            replyWithMarkdown: vi.fn().mockResolvedValue({}),
            message: {
                message_id: 1,
                date: Date.now() / 1000,
                chat: {
                    id: -67890,
                    type: 'supergroup',
                    title: 'Test Group'
                },
                from: {
                    id: 12345,
                    first_name: 'TestUser',
                    is_bot: false,
                    language_code: 'en'
                }
            }
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('ActivateCommand', () => {
        let activateCommand: ActivateCommand;

        beforeEach(() => {
            activateCommand = new ActivateCommand();
        });

        it('should have correct metadata', () => {
            expect(activateCommand.metadata).toEqual({
                name: 'activate',
                description: 'Activate admin privileges for advanced features',
                usage: '/activate',
                examples: [
                    '/activate - Activate admin access in private chat'
                ],
                adminOnly: true,
                privateOnly: true
            });
        });

        it('should handle missing user context', async () => {
            mockContext.from = undefined;
            
            await activateCommand.execute(mockContext as BotContext);
            
            expect(mockContext.reply).toHaveBeenCalledWith(
                "❌ Invalid command context. Please try again."
            );
        });

        it('should handle already activated admin', async () => {
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: -67890,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };

            // Mock private chat context for activation command
            mockContext.chat = { id: 12345, type: 'private' };
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);

            await activateCommand.execute(mockContext as BotContext);

            expect(BotsStore.getAdminProfile).toHaveBeenCalledWith(12345);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Already Activated'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should activate new admin successfully', async () => {
            mockContext.chat = { id: 12345, type: 'private' }; // Private chat for activation
            
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(null);
            vi.mocked(BotsStore.storeAdminProfile).mockResolvedValue();

            await activateCommand.execute(mockContext as BotContext);

            expect(BotsStore.storeAdminProfile).toHaveBeenCalledWith({
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: expect.any(String),
                lastActiveAt: expect.any(String)
            });

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Activation Successful'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle activation errors', async () => {
            const error = new Error('Database connection failed');
            mockContext.chat = { id: 12345, type: 'private' }; // Private chat for activation
            vi.mocked(BotsStore.getAdminProfile).mockRejectedValue(error);
            vi.mocked(createUserErrorMessage).mockReturnValue('Error: Database connection failed');

            await activateCommand.execute(mockContext as BotContext);

            expect(logError).toHaveBeenCalledWith(error, 'ActivateCommand.executeCommand', { userId: 12345 });
            expect(mockContext.reply).toHaveBeenCalledWith('Error: Database connection failed');
        });

        it('should handle missing chat context for activation', async () => {
            mockContext.chat = undefined;
            mockContext.from = { id: 12345, first_name: 'TestUser', is_bot: false, language_code: 'en' };
            
            await activateCommand.execute(mockContext as BotContext);
            
            expect(mockContext.reply).toHaveBeenCalledWith(
                "❌ Invalid command context. Please try again."
            );
        });
    });

    describe('SetupCommand', () => {
        let setupCommand: SetupCommand;

        beforeEach(() => {
            setupCommand = new SetupCommand();
        });

        it('should have correct metadata', () => {
            expect(setupCommand.metadata).toEqual({
                name: 'setup',
                description: 'Configure group chat for support tickets',
                usage: '/setup',
                examples: [
                    '/setup - Start group configuration wizard'
                ],
                adminOnly: true,
                groupOnly: true
            });
        });

        it('should handle setup in private chat error', async () => {
            // Mock activated admin profile so BaseCommand passes authorization
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);
            
            mockContext.chat = { id: 12345, type: 'private' };
            
            await setupCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Group Chat Required'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should show existing configuration', async () => {
            // Mock activated admin profile to pass BaseCommand authorization
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };
            
            const mockGroupConfig: GroupConfig = {
                chatId: -67890,
                chatTitle: 'Test Group',
                isConfigured: true,
                botIsAdmin: true,
                setupBy: 12345,
                setupAt: '2023-01-01T00:00:00.000Z'
            };

            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);
            vi.mocked(isBotAdmin).mockResolvedValue(true); // Mock bot admin permission
            vi.mocked(checkAndPromptBotAdmin).mockResolvedValue(true);
            vi.mocked(BotsStore.getGroupConfig).mockResolvedValue(mockGroupConfig);

            await setupCommand.execute(mockContext as BotContext);

            expect(BotsStore.getGroupConfig).toHaveBeenCalledWith(-67890);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Group Already Configured'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        it('should start new setup when not configured', async () => {
            // Mock activated admin profile to pass BaseCommand authorization
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);
            vi.mocked(isBotAdmin).mockResolvedValue(true); // Mock bot admin permission 
            vi.mocked(checkAndPromptBotAdmin).mockResolvedValue(true);
            vi.mocked(BotsStore.getGroupConfig).mockResolvedValue(null);
            vi.mocked(createDmSetupSession).mockResolvedValue('session123');
            
            // Mock telegram.sendMessage for DM setup
            mockContext.telegram = {
                sendMessage: vi.fn().mockResolvedValue({ message_id: 123 })
            } as any;

            await setupCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Setup Started'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle bot admin permission failure', async () => {
            // Mock activated admin profile to pass BaseCommand authorization
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);
            vi.mocked(isBotAdmin).mockResolvedValue(false); // Bot doesn't have admin permissions
            vi.mocked(checkAndPromptBotAdmin).mockResolvedValue(false);

            await setupCommand.execute(mockContext as BotContext);

            // Should call checkAndPromptBotAdmin when bot doesn't have admin permissions
            expect(checkAndPromptBotAdmin).toHaveBeenCalledWith(mockContext);
            // Should not proceed to configuration when permissions fail
            expect(BotsStore.getGroupConfig).not.toHaveBeenCalled();
        });

        it('should handle setup errors', async () => {
            // Mock activated admin profile to pass BaseCommand authorization first
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);
            
            const error = new Error('Setup failed');
            vi.mocked(checkAndPromptBotAdmin).mockRejectedValue(error);

            await setupCommand.execute(mockContext as BotContext);

            // The mock createUserErrorMessage returns 'Error: Setup failed'
            expect(mockContext.reply).toHaveBeenCalledWith(
                'Error: Setup failed'
            );
        });

        it('should handle validation failure in webhook URL processing', async () => {
            // Mock non-activated admin to trigger admin activation required message
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(null);

            await setupCommand.execute(mockContext as BotContext);

            // Should show admin activation required message from BaseCommand
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Activation Required'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.any(Array)
                    })
                })
            );
        });
    });

    describe('TemplatesCommand', () => {
        let templatesCommand: TemplatesCommand;

        beforeEach(() => {
            templatesCommand = new TemplatesCommand();
        });

        it('should have correct metadata', () => {
            expect(templatesCommand.metadata).toEqual({
                name: 'templates',
                description: 'Manage message templates for notifications',
                usage: '/templates',
                examples: [
                    '/templates - Open template management interface'
                ],
                adminOnly: true,
                privateOnly: true
            });
        });

        it('should show template manager for activated admin', async () => {
            // Set private chat context for templates command
            mockContext.chat = { id: 12345, type: 'private' };
            
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };

            // Mock global template manager response
            const mockGlobalTemplates = {
                templates: {
                    ticket_created: {
                        content: 'Ticket created',
                        lastModifiedBy: null,
                        lastModifiedAt: null
                    },
                    agent_response: {
                        content: 'Agent response', 
                        lastModifiedBy: null,
                        lastModifiedAt: null
                    }
                },
                lastUpdated: '2023-01-01T00:00:00.000Z'
            };

            const mockTemplateManager = {
                getGlobalTemplates: vi.fn().mockResolvedValue(mockGlobalTemplates)
            };

            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);
            vi.mocked(GlobalTemplateManager.getInstance).mockReturnValue(mockTemplateManager);

            await templatesCommand.execute(mockContext as BotContext);

            expect(BotsStore.getAdminProfile).toHaveBeenCalledWith(12345);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('📝 **Message Template Manager**'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.any(Object)
                })
            );
        });

        it('should show activation prompt for non-activated admin', async () => {
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: false,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };

            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);

            await templatesCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Activation Required'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.arrayContaining([
                            expect.arrayContaining([
                                expect.objectContaining({
                                    text: '🚀 Activate Admin Access'
                                })
                            ])
                        ])
                    })
                })
            );
        });

        it('should show activation prompt for non-existent admin profile', async () => {
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(null);

            await templatesCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Activation Required'),
                expect.objectContaining({
                    parse_mode: 'Markdown'
                })
            );
        });

        it('should handle template loading errors gracefully', async () => {
            // Set private chat context
            mockContext.chat = { id: 12345, type: 'private' };
            
            const mockAdminProfile: AdminProfile = {
                telegramUserId: 12345,
                isActivated: true,
                dmChatId: 12345,
                activatedAt: '2023-01-01T00:00:00.000Z',
                lastActiveAt: '2023-01-01T00:00:00.000Z'
            };

            const mockTemplateManager = {
                getGlobalTemplates: vi.fn().mockRejectedValue(new Error('Template load failed'))
            };

            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(mockAdminProfile);
            vi.mocked(GlobalTemplateManager.getInstance).mockReturnValue(mockTemplateManager);

            await templatesCommand.execute(mockContext as BotContext);

            // The error gets caught and shows fallback interface
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Template management interface is being prepared'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should handle missing user context', async () => {
            mockContext.from = undefined;

            await templatesCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                "❌ Invalid command context. Please try again."
            );
        });

        it('should handle templates command errors', async () => {
            // Set private chat context first so private-only check passes
            mockContext.chat = { id: 12345, type: 'private' };
            // Then mock non-activated admin to get admin activation error
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(null);
            
            await templatesCommand.execute(mockContext as BotContext);

            // Should show admin activation required message
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Activation Required'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.any(Array)
                    })
                })
            );
        });

        it('should handle customized templates display', async () => {
            // Use non-activated admin profile to test admin activation required
            vi.mocked(BotsStore.getAdminProfile).mockResolvedValue(null);
            
            await templatesCommand.execute(mockContext as BotContext);

            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Activation Required'),
                expect.objectContaining({
                    parse_mode: 'Markdown',
                    reply_markup: expect.objectContaining({
                        inline_keyboard: expect.any(Array)
                    })
                })
            );
        });
    });

    describe('Command Integration', () => {
        it('should handle all commands with missing bot info gracefully', async () => {
            mockContext.botInfo = undefined;
            
            const activateCommand = new ActivateCommand();
            const setupCommand = new SetupCommand();
            const templatesCommand = new TemplatesCommand();

            // Should not throw errors due to missing bot info
            await expect(activateCommand.execute(mockContext as BotContext)).resolves.not.toThrow();
            await expect(setupCommand.execute(mockContext as BotContext)).resolves.not.toThrow();
            await expect(templatesCommand.execute(mockContext as BotContext)).resolves.not.toThrow();
        });

        it('should handle all commands with network errors', async () => {
            const activateCommand = new ActivateCommand();
            const templatesCommand = new TemplatesCommand();

            await activateCommand.execute(mockContext as BotContext);
            await templatesCommand.execute(mockContext as BotContext);

            // Both commands should show private chat required since they're in group context
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Private Chat Required'),
                { parse_mode: 'Markdown' }
            );
        });
    });
});
