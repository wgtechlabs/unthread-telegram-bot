/**
 * Unit tests for commands/index.ts
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BotContext } from '../types/index.js';
import { 
  initializeCommands,
  processConversation,
  processCallback,
  executeCommand,
  generateHelp,
  commandRegistry,
  startCommand,
  helpCommand,
  versionCommand,
  aboutCommand,
  activateCommand,
  supportCommand,
  cancelCommand,
  resetCommand,
  setupCommand,
  templatesCommand,
  processSupportConversation,
  handleCallbackQuery,
  processSetupTextInput,
  processTemplateEditInput,
  handleTemplateEditCallback,
  handleTemplateCancelCallback,
  handleTemplateCancelEditCallback,
  handleTemplateBackMenuCallback
} from '../commands/index.js';

// Mock dependencies
vi.mock('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../utils/logConfig.js', () => ({
  StartupLogger: {
    showCommandRegistrationSummary: vi.fn(),
    logArchitectureSuccess: vi.fn(),
    logCommandRegistration: vi.fn()
  }
}));

vi.mock('../commands/base/CommandRegistry.js', () => {
  const mockRegistry = {
    register: vi.fn(),
    registerConversationProcessor: vi.fn(),
    registerCallbackProcessor: vi.fn(),
    getStats: vi.fn(() => ({
      totalCommands: 8,
      adminCommands: 3,
      conversationProcessors: 2,
      callbackProcessors: 4,
      setupRequiredCommands: 1
    })),
    processConversation: vi.fn(),
    processCallback: vi.fn(),
    execute: vi.fn(),
    generateHelpText: vi.fn()
  };
  
  return {
    commandRegistry: mockRegistry
  };
});

// Mock all command classes
vi.mock('../commands/basic/InfoCommands.js', () => ({
  AboutCommand: class { constructor() {} },
  HelpCommand: class { constructor() {} },
  StartCommand: class { constructor() {} },
  VersionCommand: class { constructor() {} }
}));

vi.mock('../commands/basic/StateCommands.js', () => ({
  CancelCommand: class { constructor() {} },
  ResetCommand: class { constructor() {} }
}));

vi.mock('../commands/basic/SetEmailCommand.js', () => ({
  SetEmailCommand: class { constructor() {} }
}));

vi.mock('../commands/basic/ViewEmailCommand.js', () => ({
  ViewEmailCommand: class { constructor() {} }
}));

vi.mock('../commands/support/SupportCommandClean.js', () => ({
  SupportCommand: class { constructor() {} }
}));

vi.mock('../commands/admin/AdminCommands.js', () => ({
  ActivateCommand: class { constructor() {} },
  SetupCommand: class { constructor() {} },
  TemplatesCommand: class { constructor() {} }
}));

vi.mock('../commands/processors/ConversationProcessors.js', () => ({
  DmSetupInputProcessor: class { constructor() {} },
  SupportConversationProcessor: class { constructor() {} }
}));

vi.mock('../commands/processors/CallbackProcessors.js', () => ({
  AdminCallbackProcessor: class { constructor() {} },
  SetupCallbackProcessor: class { constructor() {} },
  SupportCallbackProcessor: class { constructor() {} },
  TemplateCallbackProcessor: class { constructor() {} }
}));

vi.mock('../commands/utils/commandExecutor.js', () => ({
  createCommandExecutor: vi.fn(() => vi.fn()),
  createProcessorExecutor: vi.fn(() => vi.fn())
}));

describe('commands/index.ts', () => {
  let mockCtx: BotContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = {
      message: { text: 'test' },
      callbackQuery: { data: 'test_data' }
    } as BotContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initializeCommands', () => {
    it('should initialize all commands and processors', () => {
      initializeCommands();

      // Verify that register was called for each command (12 total: 8 basic + 1 support + 3 admin)
      expect(commandRegistry.register).toHaveBeenCalledTimes(12);
      
      // Verify conversation processors were registered
      expect(commandRegistry.registerConversationProcessor).toHaveBeenCalledTimes(2);
      
      // Verify callback processors were registered
      expect(commandRegistry.registerCallbackProcessor).toHaveBeenCalledTimes(4);
      
      // Verify stats were retrieved
      expect(commandRegistry.getStats).toHaveBeenCalled();
    });
  });

  describe('processConversation', () => {
    it('should delegate to commandRegistry.processConversation', async () => {
      const mockResult = true;
      vi.mocked(commandRegistry.processConversation).mockResolvedValue(mockResult);

      const result = await processConversation(mockCtx);

      expect(commandRegistry.processConversation).toHaveBeenCalledWith(mockCtx);
      expect(result).toBe(mockResult);
    });
  });

  describe('processCallback', () => {
    it('should process callback with data and return result', async () => {
      const mockResult = true;
      vi.mocked(commandRegistry.processCallback).mockResolvedValue(mockResult);

      const result = await processCallback(mockCtx);

      expect(commandRegistry.processCallback).toHaveBeenCalledWith(mockCtx, 'test_data');
      expect(result).toBe(mockResult);
    });

    it('should return false when no callback query', async () => {
      const ctxWithoutCallback = { message: { text: 'test' } } as BotContext;

      const result = await processCallback(ctxWithoutCallback);

      expect(result).toBe(false);
      expect(commandRegistry.processCallback).not.toHaveBeenCalled();
    });

    it('should return false when callback query has no data', async () => {
      const ctxWithoutData = { 
        callbackQuery: { id: 'test' } // no data property
      } as BotContext;

      const result = await processCallback(ctxWithoutData);

      expect(result).toBe(false);
      expect(commandRegistry.processCallback).not.toHaveBeenCalled();
    });
  });

  describe('executeCommand', () => {
    it('should delegate to commandRegistry.execute', async () => {
      const mockResult = true;
      const commandName = 'test_command';
      vi.mocked(commandRegistry.execute).mockResolvedValue(mockResult);

      const result = await executeCommand(commandName, mockCtx);

      expect(commandRegistry.execute).toHaveBeenCalledWith(commandName, mockCtx);
      expect(result).toBe(mockResult);
    });
  });

  describe('generateHelp', () => {
    it('should delegate to commandRegistry.generateHelpText', () => {
      const mockHelpText = 'Test help text';
      vi.mocked(commandRegistry.generateHelpText).mockReturnValue(mockHelpText);

      const result = generateHelp(mockCtx);

      expect(commandRegistry.generateHelpText).toHaveBeenCalledWith(mockCtx);
      expect(result).toBe(mockHelpText);
    });
  });

  describe('legacy compatibility functions', () => {
    it('should export all command functions', () => {
      expect(startCommand).toBeDefined();
      expect(helpCommand).toBeDefined();
      expect(versionCommand).toBeDefined();
      expect(aboutCommand).toBeDefined();
      expect(activateCommand).toBeDefined();
      expect(supportCommand).toBeDefined();
      expect(cancelCommand).toBeDefined();
      expect(resetCommand).toBeDefined();
      expect(setupCommand).toBeDefined();
      expect(templatesCommand).toBeDefined();
    });

    it('should export all processor functions', () => {
      expect(processSupportConversation).toBeDefined();
      expect(handleCallbackQuery).toBeDefined();
      expect(processSetupTextInput).toBeDefined();
      expect(processTemplateEditInput).toBeDefined();
      expect(handleTemplateEditCallback).toBeDefined();
      expect(handleTemplateCancelCallback).toBeDefined();
      expect(handleTemplateCancelEditCallback).toBeDefined();
      expect(handleTemplateBackMenuCallback).toBeDefined();
    });
  });

  describe('commandRegistry export', () => {
    it('should export commandRegistry', () => {
      expect(commandRegistry).toBeDefined();
    });
  });
});