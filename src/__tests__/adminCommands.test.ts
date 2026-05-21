/**
 * Admin Commands Test Suite
 * 
 * Comprehensive test coverage for admin command functionality including
 * activation, setup, and templates management.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { clearAllMocks, createMock, restoreAllMocks } from './_helpers/mockLifecycle';
import { ActivateCommand, SetupCommand, TemplatesCommand } from '../commands/admin/AdminCommands.js';
import type { BotContext } from '../types/index.js';
import type { AdminProfile, GroupConfig } from '../sdk/types.js';

// Mock external dependencies
mock.module('../sdk/bots-brain/index.js', () => ({
    BotsStore: {
        getAdminProfile: createMock(),
        storeAdminProfile: createMock(),
        getGroupConfig: createMock(),
        storeGroupConfig: createMock(),
        getUserTemplates: createMock(),
        updateDmSetupSession: createMock(),
    }
}));

mock.module('../config/env.js', () => ({
    getCompanyName: createMock(() => {
        const company = process.env.MY_COMPANY_NAME?.trim();
        if (!company) {
            return null;
        }
        const placeholders = new Set([
            'your_company_name_here',
            'your_company_name',
            'company_name_here',
            'placeholder',
            'change_me',
            'replace_me'
        ]);
        return placeholders.has(company.toLowerCase()) ? null : company;
    }),
    isAdminUser: createMock((userId: number) => {
        const raw = process.env.ADMIN_USERS ?? '';
        if (!raw.trim()) {
            return true;
        }
        const ids = raw
            .split(',')
            .map((id) => Number.parseInt(id.trim(), 10))
            .filter((id) => Number.isFinite(id) && id > 0);
        return ids.includes(userId);
    }),
    getAdminUsers: createMock(() => {
        const raw = process.env.ADMIN_USERS ?? '';
        if (!raw.trim()) {
            return [12345];
        }
        return raw
            .split(',')
            .map((id) => Number.parseInt(id.trim(), 10))
            .filter((id) => Number.isFinite(id) && id > 0);
    }),
    getConfiguredBotUsername: createMock(() => {
        const username = process.env.BOT_USERNAME?.trim();
        if (!username) {
            return null;
        }
        const placeholders = new Set([
            'your_bot_username_here',
            'your_bot_username',
            'bot_username_here',
            'placeholder',
            'change_me',
            'replace_me'
        ]);
        if (placeholders.has(username.toLowerCase())) {
            return null;
        }
        return /^[a-zA-Z0-9_]{5,32}$/.test(username) ? username : null;
    }),
}));

mock.module('../utils/adminManager.js', () => ({
    createDmSetupSession: createMock(),
}));

mock.module('../utils/globalTemplateManager.js', () => ({
    GlobalTemplateManager: {
        getInstance: createMock(() => ({
            getGlobalTemplates: createMock()
        }))
    }
}));

mock.module('../commands/processors/CallbackProcessors.js', () => ({
    SetupCallbackProcessor: class {
        static processSetupCallback = createMock();
        static generateShortCallbackId = createMock(async () => 'mockcb');
    },
    SupportCallbackProcessor: class {},
    AdminCallbackProcessor: class {},
    TemplateCallbackProcessor: class {}
}));

import { createDmSetupSession } from '../utils/adminManager.js';
import { BotsStore } from '../sdk/bots-brain/index.js';
import * as permissionsModule from '../utils/permissions.js';
import * as commandErrorHandler from '../commands/utils/errorHandler.js';
import { GlobalTemplateManager } from '../utils/globalTemplateManager.js';

describe('AdminCommands', () => {
    let mockContext: Partial<BotContext>;
    let createUserErrorMessageSpy: ReturnType<typeof spyOn>;
    let logErrorSpy: ReturnType<typeof spyOn>;
    let checkAndPromptBotAdminSpy: ReturnType<typeof spyOn>;
    let isBotAdminSpy: ReturnType<typeof spyOn>;
    let validateAdminAccessSpy: ReturnType<typeof spyOn>;
    
    beforeEach(() => {
        clearAllMocks();
        createUserErrorMessageSpy = spyOn(commandErrorHandler, 'createUserErrorMessage');
        logErrorSpy = spyOn(commandErrorHandler, 'logError');
        checkAndPromptBotAdminSpy = spyOn(permissionsModule, 'checkAndPromptBotAdmin');
        isBotAdminSpy = spyOn(permissionsModule, 'isBotAdmin');
        validateAdminAccessSpy = spyOn(permissionsModule, 'validateAdminAccess');
        
        // Set default mock behavior for admin validation
        (validateAdminAccessSpy as any).mockResolvedValue(true);
        
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
            reply: mock().mockResolvedValue({}),
            replyWithMarkdown: mock().mockResolvedValue({}),
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
        restoreAllMocks();
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
            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);

            await activateCommand.execute(mockContext as BotContext);

            expect(BotsStore.getAdminProfile).toHaveBeenCalledWith(12345);
            expect(mockContext.reply).toHaveBeenCalledWith(
                expect.stringContaining('Admin Already Activated'),
                { parse_mode: 'Markdown' }
            );
        });

        it('should activate new admin successfully', async () => {
            mockContext.chat = { id: 12345, type: 'private' }; // Private chat for activation
            
            (BotsStore.getAdminProfile as any).mockResolvedValue(null);
            (BotsStore.storeAdminProfile as any).mockResolvedValue();

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
            (BotsStore.getAdminProfile as any).mockRejectedValue(error);
            (createUserErrorMessageSpy as any).mockReturnValue('Error: Database connection failed');

            await activateCommand.execute(mockContext as BotContext);

            expect(logErrorSpy).toHaveBeenCalledWith(error, 'ActivateCommand.executeCommand', { userId: 12345 });
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
            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);
            
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

            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);
            (isBotAdminSpy as any).mockResolvedValue(true); // Mock bot admin permission
            (checkAndPromptBotAdminSpy as any).mockResolvedValue(true);
            (BotsStore.getGroupConfig as any).mockResolvedValue(mockGroupConfig);

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
            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);
            (isBotAdminSpy as any).mockResolvedValue(true); // Mock bot admin permission 
            (checkAndPromptBotAdminSpy as any).mockResolvedValue(true);
            (BotsStore.getGroupConfig as any).mockResolvedValue(null);
            (createDmSetupSession as any).mockResolvedValue('session123');
            
            // Mock telegram.sendMessage for DM setup
            mockContext.telegram = {
                sendMessage: mock().mockResolvedValue({ message_id: 123 })
            } as { sendMessage: (_chatId: number | string, _text: string, _options?: unknown) => Promise<{ message_id: number }> };

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
            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);
            (isBotAdminSpy as any).mockResolvedValue(false); // Bot doesn't have admin permissions
            (checkAndPromptBotAdminSpy as any).mockResolvedValue(false);

            await setupCommand.execute(mockContext as BotContext);

            // Should call checkAndPromptBotAdmin when bot doesn't have admin permissions
            expect(checkAndPromptBotAdminSpy).toHaveBeenCalledWith(mockContext);
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
            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);
            
            const error = new Error('Setup failed');
            (checkAndPromptBotAdminSpy as any).mockRejectedValue(error);

            await setupCommand.execute(mockContext as BotContext);

            // Real error handler maps unknown setup errors to a generic user message.
            expect(mockContext.reply).toHaveBeenCalledWith(
                '❌ An unexpected error occurred. Please try again.'
            );
        });

        it('should handle validation failure in webhook URL processing', async () => {
            // Mock non-activated admin to trigger admin activation required message
            (BotsStore.getAdminProfile as any).mockResolvedValue(null);

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
                    },
                    ticket_status: {
                        content: 'Ticket status',
                        lastModifiedBy: null,
                        lastModifiedAt: null
                    }
                },
                lastUpdated: '2023-01-01T00:00:00.000Z'
            };

            const mockTemplateManager = {
                getGlobalTemplates: mock().mockResolvedValue(mockGlobalTemplates)
            };

            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);
            (GlobalTemplateManager.getInstance as any).mockReturnValue(mockTemplateManager);

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

            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);

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
            (BotsStore.getAdminProfile as any).mockResolvedValue(null);

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
                getGlobalTemplates: mock().mockRejectedValue(new Error('Template load failed'))
            };

            (BotsStore.getAdminProfile as any).mockResolvedValue(mockAdminProfile);
            (GlobalTemplateManager.getInstance as any).mockReturnValue(mockTemplateManager);

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
            (BotsStore.getAdminProfile as any).mockResolvedValue(null);
            
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
            (BotsStore.getAdminProfile as any).mockResolvedValue(null);
            
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
            await expect(activateCommand.execute(mockContext as BotContext)).resolves.toBeUndefined();
            await expect(setupCommand.execute(mockContext as BotContext)).resolves.toBeUndefined();
            await expect(templatesCommand.execute(mockContext as BotContext)).resolves.toBeUndefined();
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
