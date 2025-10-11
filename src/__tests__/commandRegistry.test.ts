/**
 * Unit tests for commands/base/CommandRegistry.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../types';
import { 
  CommandRegistry
} from '../commands/base/CommandRegistry.js';
import type { 
  CommandMetadata,
  ICallbackProcessor,
  ICommand, 
  IConversationProcessor
} from '../commands/base/BaseCommand.js';

// Mock dependencies
vi.mock('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../utils/logConfig.js', () => ({
  StartupLogger: {
    logCommandRegistration: vi.fn(),
    logProcessorRegistration: vi.fn()
  }
}));

vi.mock('../../config/env.js', () => ({
  isAdminUser: vi.fn(() => false)
}));

import { LogEngine } from '@wgtechlabs/log-engine';
import { StartupLogger } from '../../utils/logConfig.js';
import { isAdminUser } from '../../config/env.js';

// Mock command implementations
class MockCommand implements ICommand {
  constructor(
    public metadata: CommandMetadata,
    public executeImpl: (ctx: BotContext) => Promise<void> = vi.fn()
  ) {}

  async execute(ctx: BotContext): Promise<void> {
    return this.executeImpl(ctx);
  }

  generateHelp(): string {
    return `Help for ${this.metadata.name}`;
  }
}

class MockConversationProcessor implements IConversationProcessor {
  constructor(
    public canHandleImpl: (ctx: BotContext) => Promise<boolean> = vi.fn(() => Promise.resolve(true)),
    public processImpl: (ctx: BotContext) => Promise<boolean> = vi.fn(() => Promise.resolve(true))
  ) {}

  async canHandle(ctx: BotContext): Promise<boolean> {
    return this.canHandleImpl(ctx);
  }

  async process(ctx: BotContext): Promise<boolean> {
    return this.processImpl(ctx);
  }
}

class MockCallbackProcessor implements ICallbackProcessor {
  constructor(
    public canHandleImpl: (data: string) => boolean = vi.fn(() => true),
    public processImpl: (ctx: BotContext, data: string) => Promise<boolean> = vi.fn(() => Promise.resolve(true))
  ) {}

  canHandle(callbackData: string): boolean {
    return this.canHandleImpl(callbackData);
  }

  async process(ctx: BotContext, callbackData: string): Promise<boolean> {
    return this.processImpl(ctx, callbackData);
  }
}

describe('CommandRegistry', () => {
  let registry: CommandRegistry;
  let mockCtx: BotContext;
  let basicCommand: MockCommand;
  let adminCommand: MockCommand;
  let privateCommand: MockCommand;
  let groupCommand: MockCommand;
  let setupCommand: MockCommand;

  beforeEach(() => {
    vi.clearAllMocks();
    
    registry = new CommandRegistry();
    
    mockCtx = {
      from: { id: 123, first_name: 'Test', is_bot: false },
      chat: { id: 456, type: 'private' },
      message: { text: '/test', message_id: 789 },
      reply: vi.fn()
    } as BotContext;

    basicCommand = new MockCommand({
      name: 'basic',
      description: 'Basic command',
      usage: '/basic'
    });

    adminCommand = new MockCommand({
      name: 'admin',
      description: 'Admin command',
      usage: '/admin',
      adminOnly: true
    });

    privateCommand = new MockCommand({
      name: 'private',
      description: 'Private only command',
      usage: '/private',
      privateOnly: true
    });

    groupCommand = new MockCommand({
      name: 'group',
      description: 'Group only command',
      usage: '/group',
      groupOnly: true
    });

    setupCommand = new MockCommand({
      name: 'setup',
      description: 'Setup required command',
      usage: '/setup',
      requiresSetup: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should register a command successfully', () => {
      registry.register(basicCommand);

      expect(registry.has('basic')).toBe(true);
      expect(registry.get('basic')).toBe(basicCommand);
      expect(StartupLogger.logCommandRegistration).toHaveBeenCalledWith('basic', {
        adminOnly: undefined,
        privateOnly: undefined,
        groupOnly: undefined,
        requiresSetup: undefined
      });
    });

    it('should throw error when registering duplicate command', () => {
      registry.register(basicCommand);

      expect(() => registry.register(basicCommand)).toThrow('Command \'basic\' is already registered');
      expect(LogEngine.error).toHaveBeenCalled();
    });

    it('should register admin command with correct metadata', () => {
      registry.register(adminCommand);

      expect(registry.get('admin')).toBe(adminCommand);
      expect(StartupLogger.logCommandRegistration).toHaveBeenCalledWith('admin', {
        adminOnly: true,
        privateOnly: undefined,
        groupOnly: undefined,
        requiresSetup: undefined
      });
    });
  });

  describe('registerWithOverwrite', () => {
    it('should register new command without warning', () => {
      registry.registerWithOverwrite(basicCommand);

      expect(registry.get('basic')).toBe(basicCommand);
      expect(LogEngine.warn).not.toHaveBeenCalled();
      expect(LogEngine.info).toHaveBeenCalledWith('Registered command: basic', expect.any(Object));
    });

    it('should overwrite existing command with warning', () => {
      registry.register(basicCommand);
      
      const newCommand = new MockCommand({
        name: 'basic',
        description: 'New basic command',
        usage: '/basic'
      });

      registry.registerWithOverwrite(newCommand);

      expect(registry.get('basic')).toBe(newCommand);
      expect(LogEngine.warn).toHaveBeenCalledWith('Explicitly overwriting command: basic', {
        intentionalOverwrite: true
      });
      expect(LogEngine.info).toHaveBeenCalledWith('Overwritten command: basic', expect.any(Object));
    });
  });

  describe('conversation processors', () => {
    it('should register conversation processor', () => {
      const processor = new MockConversationProcessor();
      
      registry.registerConversationProcessor(processor);

      expect(StartupLogger.logProcessorRegistration).toHaveBeenCalledWith('conversation');
    });

    it('should process conversation with registered processor', async () => {
      const processor = new MockConversationProcessor();
      registry.registerConversationProcessor(processor);

      const result = await registry.processConversation(mockCtx);

      expect(processor.canHandleImpl).toHaveBeenCalledWith(mockCtx);
      expect(processor.processImpl).toHaveBeenCalledWith(mockCtx);
      expect(result).toBe(true);
      expect(LogEngine.info).toHaveBeenCalledWith('Conversation processed by processor', expect.any(Object));
    });

    it('should return false when no processor can handle conversation', async () => {
      const processor = new MockConversationProcessor(
        vi.fn(() => Promise.resolve(false))
      );
      registry.registerConversationProcessor(processor);

      const result = await registry.processConversation(mockCtx);

      expect(result).toBe(false);
    });

    it('should handle processor errors gracefully', async () => {
      const processor = new MockConversationProcessor(
        vi.fn(() => Promise.reject(new Error('Processor error')))
      );
      registry.registerConversationProcessor(processor);

      const result = await registry.processConversation(mockCtx);

      expect(result).toBe(false);
      expect(LogEngine.error).toHaveBeenCalledWith('Error in conversation processor', expect.any(Object));
    });
  });

  describe('callback processors', () => {
    it('should register callback processor', () => {
      const processor = new MockCallbackProcessor();
      
      registry.registerCallbackProcessor(processor);

      expect(StartupLogger.logProcessorRegistration).toHaveBeenCalledWith('callback');
    });

    it('should process callback with registered processor', async () => {
      const processor = new MockCallbackProcessor();
      const callbackData = 'test_callback_data';
      registry.registerCallbackProcessor(processor);

      const result = await registry.processCallback(mockCtx, callbackData);

      expect(processor.canHandleImpl).toHaveBeenCalledWith(callbackData);
      expect(processor.processImpl).toHaveBeenCalledWith(mockCtx, callbackData);
      expect(result).toBe(true);
      expect(LogEngine.info).toHaveBeenCalledWith('Callback processed by processor', expect.any(Object));
    });

    it('should return false when no processor can handle callback', async () => {
      const processor = new MockCallbackProcessor(
        vi.fn(() => false)
      );
      registry.registerCallbackProcessor(processor);

      const result = await registry.processCallback(mockCtx, 'test_data');

      expect(result).toBe(false);
    });

    it('should handle callback processor errors gracefully', async () => {
      const processor = new MockCallbackProcessor(
        vi.fn(() => true),
        vi.fn(() => Promise.reject(new Error('Callback error')))
      );
      registry.registerCallbackProcessor(processor);

      const result = await registry.processCallback(mockCtx, 'test_data');

      expect(result).toBe(false);
      expect(LogEngine.error).toHaveBeenCalledWith('Error in callback processor', expect.any(Object));
    });
  });

  describe('command execution', () => {
    it('should execute existing command successfully', async () => {
      registry.register(basicCommand);

      const result = await registry.execute('basic', mockCtx);

      expect(basicCommand.executeImpl).toHaveBeenCalledWith(mockCtx);
      expect(result).toBe(true);
    });

    it('should return false for non-existing command', async () => {
      const result = await registry.execute('nonexistent', mockCtx);

      expect(result).toBe(false);
      expect(LogEngine.warn).toHaveBeenCalledWith('Unknown command: nonexistent', expect.any(Object));
    });

    it('should handle command execution errors', async () => {
      const errorCommand = new MockCommand(
        { name: 'error', description: 'Error command', usage: '/error' },
        vi.fn(() => Promise.reject(new Error('Command failed')))
      );
      registry.register(errorCommand);

      const result = await registry.execute('error', mockCtx);

      expect(result).toBe(false);
      expect(LogEngine.error).toHaveBeenCalledWith('Command execution failed: error', expect.any(Object));
    });
  });

  describe('getAvailableCommands', () => {
    beforeEach(() => {
      registry.register(basicCommand);
      registry.register(adminCommand);
      registry.register(privateCommand);
      registry.register(groupCommand);
    });

    it('should return available commands for private chat', () => {
      mockCtx.chat = { id: 456, type: 'private' } as any;

      const available = registry.getAvailableCommands(mockCtx);

      expect(available).toContain(basicCommand);
      expect(available).toContain(privateCommand);
      expect(available).not.toContain(groupCommand);
      expect(available).not.toContain(adminCommand); // User is not admin
    });

    it('should return available commands for group chat', () => {
      mockCtx.chat = { id: 456, type: 'group' } as any;

      const available = registry.getAvailableCommands(mockCtx);

      expect(available).toContain(basicCommand);
      expect(available).toContain(groupCommand);
      expect(available).not.toContain(privateCommand);
      expect(available).not.toContain(adminCommand);
    });

    it('should include admin commands for admin users', () => {
      vi.mocked(isAdminUser).mockReturnValue(true);

      const available = registry.getAvailableCommands(mockCtx);

      expect(available).toContain(basicCommand);
      expect(available).toContain(adminCommand);
    });
  });

  describe('help generation', () => {
    beforeEach(() => {
      registry.register(basicCommand);
      registry.register(adminCommand);
      registry.register(setupCommand);
    });

    it('should generate help text for available commands', () => {
      const help = registry.generateHelpText(mockCtx);

      expect(help).toContain('basic');
      expect(help).toContain('Basic command');
      expect(help).not.toContain('admin'); // User is not admin
    });

    it('should generate command-specific help', () => {
      const help = registry.generateCommandHelp('basic', mockCtx);

      expect(help).toBe('Help for basic');
    });

    it('should return null for non-existing command help', () => {
      const help = registry.generateCommandHelp('nonexistent', mockCtx);

      expect(help).toBeNull();
    });

    it('should return error message for unauthorized command help', () => {
      const help = registry.generateCommandHelp('admin', mockCtx);

      expect(help).toBe("❌ You don't have access to this command.");
    });
  });

  describe('utility methods', () => {
    it('should return correct size', () => {
      expect(registry.size()).toBe(0);
      
      registry.register(basicCommand);
      expect(registry.size()).toBe(1);
      
      registry.register(adminCommand);
      expect(registry.size()).toBe(2);
    });

    it('should return all commands', () => {
      registry.register(basicCommand);
      registry.register(adminCommand);

      const all = registry.getAll();

      expect(all.size).toBe(2);
      expect(all.get('basic')).toBe(basicCommand);
      expect(all.get('admin')).toBe(adminCommand);
    });

    it('should return command statistics', () => {
      registry.register(basicCommand);
      registry.register(adminCommand);
      registry.register(privateCommand);
      registry.register(groupCommand);
      registry.register(setupCommand);

      const stats = registry.getStats();

      expect(stats.totalCommands).toBe(5);
      expect(stats.adminCommands).toBe(1);
      expect(stats.privateOnlyCommands).toBe(1);
      expect(stats.groupOnlyCommands).toBe(1);
      expect(stats.setupRequiredCommands).toBe(1);
      expect(stats.conversationProcessors).toBe(0);
      expect(stats.callbackProcessors).toBe(0);
    });

    it('should include processor stats', () => {
      registry.registerConversationProcessor(new MockConversationProcessor());
      registry.registerCallbackProcessor(new MockCallbackProcessor());

      const stats = registry.getStats();

      expect(stats.conversationProcessors).toBe(1);
      expect(stats.callbackProcessors).toBe(1);
    });
  });
});