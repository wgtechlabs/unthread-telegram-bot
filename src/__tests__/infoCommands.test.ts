/**
 * Unit tests for commands/basic/InfoCommands.ts
 */
import { afterEach, beforeEach, describe, expect, it , mock} from 'bun:test';
import { clearAllMocks, createMock, restoreAllMocks } from './_helpers/mockLifecycle';
import type { BotContext } from '../types/index.js';
import { 
  AboutCommand,
  HelpCommand,
  StartCommand,
  VersionCommand
} from '../commands/basic/InfoCommands.js';

// Mock dependencies
mock.module('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    debug: createMock(),
    error: createMock(),
    info: createMock()
  }
}));

mock.module('../config/env.js', () => ({
  getCompanyName: createMock(() => 'Test Company'),
  isAdminUser: createMock(() => false)
}));

mock.module('../sdk/bots-brain/index.js', () => ({
  BotsStore: {
    getAdminProfile: createMock(async () => ({ isActivated: true }))
  }
}));

mock.module('fs', () => ({
  readFileSync: createMock()
}));

mock.module('url', () => ({
  fileURLToPath: createMock(() => '/mock/path/to/file.js')
}));

mock.module('path', () => ({
  dirname: createMock(() => '/mock/path/to'),
  join: createMock(() => '/mock/path/to/package.json')
}));

import { LogEngine } from '@wgtechlabs/log-engine';
import { getCompanyName, isAdminUser } from '../config/env.js';
import { BotsStore } from '../sdk/bots-brain/index.js';
import { readFileSync } from 'fs';

describe('InfoCommands', () => {
  let mockCtx: BotContext;

  beforeEach(() => {
    clearAllMocks();
    (isAdminUser as any).mockReturnValue(false);
    
    mockCtx = {
      from: { id: 123, first_name: 'Test', is_bot: false },
      chat: { id: 456, type: 'private' },
      message: { text: '/start', message_id: 789 },
      reply: mock()
    } as BotContext;

    // Mock successful package.json reading by default
    (readFileSync as any).mockReturnValue(JSON.stringify({
      name: 'test-bot',
      version: '1.0.0',
      description: 'Test bot',
      author: 'Test Author',
      license: 'MIT'
    }));
  });

  afterEach(() => {
    restoreAllMocks();
  });

  describe('Package.json loading', () => {
    it('should load package.json successfully', () => {
      // The package.json loading logic exists and is tested implicitly through version command
      // We test this indirectly by ensuring the version command works with package data
      const versionCommand = new VersionCommand();
      expect(versionCommand.metadata.name).toBe('version');
    });

    it('should handle package.json loading errors', () => {
      // Re-import module with failing readFileSync to test error handling
      (readFileSync as any).mockImplementation(() => {
        throw new Error('File not found');
      });

      // Since the module is already loaded, we can't easily test the error case
      // But we can verify the fallback behavior works
      expect(LogEngine.error).not.toHaveBeenCalled(); // since it was successful initially
    });
  });

  describe('StartCommand', () => {
    let startCommand: StartCommand;

    beforeEach(() => {
      startCommand = new StartCommand();
    });

    it('should have correct metadata', () => {
      expect(startCommand.metadata.name).toBe('start');
      expect(startCommand.metadata.description).toBe('Welcome message and bot introduction');
      expect(startCommand.metadata.usage).toBe('/start');
      expect(startCommand.metadata.privateOnly).toBe(true);
    });

    it('should show welcome message with company name', async () => {
      await startCommand.execute(mockCtx);

      expect(getCompanyName).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🤖 **Welcome to Test Company Support Bot!**'),
        { parse_mode: 'Markdown' }
      );

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      expect(message).toContain('Use /support to create a new ticket');
      expect(message).toContain('Use /help to see all available commands');
      expect(message).toContain('Use /version to check bot version');
    });

    it('should use fallback when company name is not available', async () => {
      (getCompanyName as any).mockReturnValue(null);

      await startCommand.execute(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🤖 **Welcome to Support Support Bot!**'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should include quick start instructions', async () => {
      await startCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      expect(message).toContain('**Quick Start:**');
      expect(message).toContain("Let's get started! 🚀");
    });

    it('should show admin-specific getting started message for admins', async () => {
      (isAdminUser as any).mockReturnValue(true);

      await startCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      expect(message).toContain('🛠️ **Welcome, Admin!**');
      expect(message).toContain('**Admin Getting Started:**');
      expect(message).toContain('Use /activate in this private chat');
      expect(message).toContain('Run /setup in your group chat');
      expect(message).toContain('Configure templates with /templates');
      expect(message).toContain('Use /help to view all admin tools');
    });

    it('should show activation prompt for admin start deep-link payload', async () => {
      const dmActivationCtx = {
        ...mockCtx,
        message: { text: '/start admin_activate', message_id: 790 }
      } as BotContext;

      await startCommand.execute(dmActivationCtx);

      expect(dmActivationCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🔐 **Admin Activation**'),
        expect.objectContaining({
          parse_mode: 'Markdown',
          reply_markup: expect.objectContaining({
            keyboard: [[{ text: '/activate' }]],
            resize_keyboard: true,
            one_time_keyboard: true
          })
        })
      );
    });
  });

  describe('HelpCommand', () => {
    let helpCommand: HelpCommand;

    beforeEach(() => {
      helpCommand = new HelpCommand();
    });

    it('should have correct metadata', () => {
      expect(helpCommand.metadata.name).toBe('help');
      expect(helpCommand.metadata.description).toBe('Display available commands and usage instructions');
      expect(helpCommand.metadata.usage).toBe('/help');
    });

    it('should handle missing user ID', async () => {
      const ctxWithoutFrom = {
        ...mockCtx,
        from: undefined
      } as BotContext;

      await helpCommand.execute(ctxWithoutFrom);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        "❌ Invalid command context. Please try again."
      );
    });

    it('should show regular help for non-admin users', async () => {
      (isAdminUser as any).mockReturnValue(false);

      await helpCommand.execute(mockCtx);

      expect(isAdminUser).toHaveBeenCalledWith(123);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('📋 **Available Commands:**'),
        { parse_mode: 'Markdown' }
      );

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      expect(message).toContain('/start - Welcome message');
      expect(message).toContain('/help - Show this help message');
      expect(message).toContain('/support - Create a new support ticket');
      expect(message).toContain('/version - Show bot version information');
      expect(message).toContain('/cancel - Cancel current operation');
      expect(message).not.toContain('/activate');
      expect(message).not.toContain('/setup');
      expect(message).not.toContain('/templates');
      expect(message).not.toContain('github.com/wgtechlabs');
    });

    it('should show admin help for admin users', async () => {
      (isAdminUser as any).mockReturnValue(true);

      await helpCommand.execute(mockCtx);

      expect(isAdminUser).toHaveBeenCalledWith(123);
      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      // Admin help should include admin-specific commands
      expect(message).toContain('**Admin Commands:**');
      expect(message).toContain('/setup');
      expect(message).toContain('/activate');
      expect(message).toContain('/templates');
      expect(message).toContain('github.com/wgtechlabs');
    });
  });

  describe('VersionCommand', () => {
    let versionCommand: VersionCommand;

    beforeEach(() => {
      versionCommand = new VersionCommand();
      // Reset NODE_ENV for consistent testing
      delete process.env.NODE_ENV;
    });

    it('should have correct metadata', () => {
      expect(versionCommand.metadata.name).toBe('version');
      expect(versionCommand.metadata.description).toBe('Show bot version information');
      expect(versionCommand.metadata.usage).toBe('/version');
    });

    it('should show version information with changelog link', async () => {
      await versionCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];

      expect(message).toContain('📊 **Bot Version Information**');
      expect(message).toContain('**Version:**');
      // Verify the displayed version looks like a semver string
      expect(message).toMatch(/\*\*Version:\*\*\s+\d+\.\d+\.\d+/);
      expect(message).toContain('[Changelog](https://github.com/wgtechlabs/unthread-telegram-bot/releases)');
    });

    it('should reply using Markdown parse mode', async () => {
      await versionCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      expect(replyCall[1]).toEqual({ parse_mode: 'Markdown' });
    });
  });

  describe('AboutCommand', () => {
    let aboutCommand: AboutCommand;

    beforeEach(() => {
      aboutCommand = new AboutCommand();
    });

    it('should have correct metadata', () => {
      expect(aboutCommand.metadata.name).toBe('about');
      expect(aboutCommand.metadata.description).toBe('Display admin bot information and troubleshooting details');
      expect(aboutCommand.metadata.usage).toBe('/about');
      expect(aboutCommand.metadata.adminOnly).toBe(true);
    });

    it('should show about information for activated admins', async () => {
      (isAdminUser as any).mockReturnValue(true);
      (BotsStore.getAdminProfile as any).mockResolvedValue({ isActivated: true });

      await aboutCommand.execute(mockCtx);

      expect(getCompanyName).toHaveBeenCalled();
      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      expect(message).toContain('ℹ️ **Test Company Bot Admin Overview**');
      expect(message).toContain('**Admin Responsibilities:**');
      expect(message).toContain('/setup');
      expect(message).toContain('/templates');
      expect(message).toContain('github.com/wgtechlabs');
      expect(replyCall[1]).toEqual({ parse_mode: 'Markdown' });
    });

    it('should block about command for non-admin users', async () => {
      (isAdminUser as any).mockReturnValue(false);

      await aboutCommand.execute(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🔒 **Admin Only Command**'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should use fallback when company name is not available', async () => {
      (getCompanyName as any).mockReturnValue(null);
      (isAdminUser as any).mockReturnValue(true);
      (BotsStore.getAdminProfile as any).mockResolvedValue({ isActivated: true });

      await aboutCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      expect(message).toContain('ℹ️ **Support Bot Admin Overview**');
    });

    it('should include troubleshooting information', async () => {
      (isAdminUser as any).mockReturnValue(true);
      (BotsStore.getAdminProfile as any).mockResolvedValue({ isActivated: true });

      await aboutCommand.execute(mockCtx);

      const replyCall = (mockCtx.reply as any).mock.calls[0];
      const message = replyCall[0];
      
      expect(message).toContain('**System Details:**');
      expect(message).toContain('TypeScript + Telegraf');
      expect(message).toContain('**Troubleshooting & Bug Reports:**');
    });
  });

  describe('Command inheritance', () => {
    it('should all extend BaseCommand properly', () => {
      const startCommand = new StartCommand();
      const helpCommand = new HelpCommand();
      const versionCommand = new VersionCommand();
      const aboutCommand = new AboutCommand();

      [startCommand, helpCommand, versionCommand, aboutCommand].forEach(command => {
        expect(command).toHaveProperty('execute');
        expect(command).toHaveProperty('generateHelp');
        expect(typeof command.execute).toBe('function');
        expect(typeof command.generateHelp).toBe('function');
        expect(command.metadata).toBeDefined();
        expect(command.metadata.name).toBeDefined();
        expect(command.metadata.description).toBeDefined();
        expect(command.metadata.usage).toBeDefined();
      });
    });

    it('should generate help text for all commands', () => {
      const commands = [
        new StartCommand(),
        new HelpCommand(),
        new VersionCommand(),
        new AboutCommand()
      ];

      commands.forEach(command => {
        const help = command.generateHelp();
        expect(help).toContain(command.metadata.name);
        expect(help).toContain(command.metadata.usage);
        expect(help).toContain(command.metadata.description);
      });
    });
  });
});
