/**
 * Unit tests for commands/index.ts
 */
import { afterAll, afterEach, beforeEach, describe, expect, it , mock} from 'bun:test';
import { clearAllMocks, createMock, restoreAllMocks } from './_helpers/mockLifecycle';
import type { BotContext } from '../types/index.js';
import { 
  aboutCommand,
  activateCommand,
  cancelCommand,
  commandRegistry,
  executeCommand,
  generateHelp,
  handleCallbackQuery,
  handleTemplateBackMenuCallback,
  handleTemplateCancelCallback,
  handleTemplateCancelEditCallback,
  handleTemplateEditCallback,
  helpCommand,
  initializeCommands,
  processCallback,
  processConversation,
  processSetupTextInput,
  processSupportConversation,
  processTemplateEditInput,
  resetCommand,
  setupCommand,
  startCommand,
  supportCommand,
  templatesCommand,
  versionCommand
} from '../commands/index.js';

// Mock dependencies
mock.module('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: createMock(),
    error: createMock(),
    warn: createMock(),
    debug: createMock()
  }
}));

mock.module('../utils/logConfig.js', () => ({
  StartupLogger: {
    showCommandRegistrationSummary: createMock(),
    logArchitectureSuccess: createMock(),
    logCommandRegistration: createMock()
  }
}));

mock.module('../commands/base/CommandRegistry.js', () => {
  const mockRegistry = {
    register: createMock(),
    registerConversationProcessor: createMock(),
    registerCallbackProcessor: createMock(),
    getStats: createMock(() => ({
      totalCommands: 8,
      adminCommands: 3,
      conversationProcessors: 2,
      callbackProcessors: 4,
      setupRequiredCommands: 1
    })),
    processConversation: createMock(),
    processCallback: createMock(),
    execute: createMock(),
    generateHelpText: createMock()
  };
  
  return {
    commandRegistry: mockRegistry
  };
});

mock.module('../commands/utils/commandExecutor.js', () => ({
  createCommandExecutor: createMock(() => createMock()),
  createProcessorExecutor: createMock(() => createMock())
}));

describe('commands/index.ts', () => {
  let mockCtx: BotContext;

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    clearAllMocks();
    mockCtx = {
      message: { text: 'test' },
      callbackQuery: { data: 'test_data' }
    } as BotContext;
  });

  afterEach(() => {
    restoreAllMocks();
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
      (commandRegistry.processConversation as any).mockResolvedValue(mockResult);

      const result = await processConversation(mockCtx);

      expect(commandRegistry.processConversation).toHaveBeenCalledWith(mockCtx);
      expect(result).toBe(mockResult);
    });
  });

  describe('processCallback', () => {
    it('should process callback with data and return result', async () => {
      const mockResult = true;
      (commandRegistry.processCallback as any).mockResolvedValue(mockResult);

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
      (commandRegistry.execute as any).mockResolvedValue(mockResult);

      const result = await executeCommand(commandName, mockCtx);

      expect(commandRegistry.execute).toHaveBeenCalledWith(commandName, mockCtx);
      expect(result).toBe(mockResult);
    });
  });

  describe('generateHelp', () => {
    it('should delegate to commandRegistry.generateHelpText', () => {
      const mockHelpText = 'Test help text';
      (commandRegistry.generateHelpText as any).mockReturnValue(mockHelpText);

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
