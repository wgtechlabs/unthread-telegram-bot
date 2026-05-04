/**
 * Unit tests for commands/utils/commandExecutor.ts
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { clearAllMocks, createMock } from './_helpers/mockLifecycle';
import type { BotContext } from '../types/index.js';
import { 
  type CommandExecutorOptions,
  createCommandExecutor, 
  createProcessorExecutor
} from '../commands/utils/commandExecutor.js';

// Mock dependencies
mock.module('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    info: createMock(),
    warn: createMock(),
    error: createMock()
  }
}));

mock.module('../commands/base/CommandRegistry.js', () => ({
  commandRegistry: {
    execute: createMock()
  }
}));

mock.module('../utils/errorContextBuilder.js', () => ({
  ErrorContextBuilder: {
    forCommand: createMock()
  }
}));

// Import mocked modules 
import { LogEngine } from '@wgtechlabs/log-engine';
import { commandRegistry } from '../commands/base/CommandRegistry.js';
import { ErrorContextBuilder } from '../utils/errorContextBuilder.js';

describe('commandExecutor utilities', () => {
  let mockCtx: BotContext;

  beforeEach(() => {
    (commandRegistry.execute as any).mockReset();
    (ErrorContextBuilder.forCommand as any).mockReset();
    (LogEngine.error as any).mockReset();
    
    mockCtx = {
      message: { text: 'test command' },
      from: { id: 123 }
    } as BotContext;
  });

  afterEach(() => {
    clearAllMocks();
  });

  describe('createCommandExecutor', () => {
    describe('void return type (default)', () => {
      it('should execute command successfully and return void', async () => {
        const commandName = 'testCommand';
        (commandRegistry.execute as any).mockResolvedValue(true);

        const executor = createCommandExecutor(commandName);
        const result = await executor(mockCtx);

        expect((commandRegistry.execute as any)).toHaveBeenCalledWith(commandName, mockCtx);
        expect(result).toBeUndefined();
      });

      it('should handle command execution errors', async () => {
        const commandName = 'failingCommand';
        const error = new Error('Command failed');
        
        (commandRegistry.execute as any).mockRejectedValue(error);
        (ErrorContextBuilder.forCommand as any).mockReturnValue({ 
          error: 'Command failed',
          errorType: 'command-error'
        });

        const executor = createCommandExecutor(commandName);
        const result = await executor(mockCtx);

        expect((commandRegistry.execute as any)).toHaveBeenCalledWith(commandName, mockCtx);
        expect((ErrorContextBuilder.forCommand as any)).toHaveBeenCalledWith(error, mockCtx, commandName);
        expect(LogEngine.error).toHaveBeenCalledWith(
          'Command failingCommand failed', 
          { error: 'Command failed', errorType: 'command-error' }
        );
        expect(result).toBeUndefined();
      });

      it('should use custom logPrefix and additionalContext when provided', async () => {
        const commandName = 'testCommand';
        const error = new Error('Command failed');
        const options: CommandExecutorOptions = {
          logPrefix: 'Custom Prefix',
          additionalContext: { customKey: 'customValue' }
        };

        (commandRegistry.execute as any).mockRejectedValue(error);
        (ErrorContextBuilder.forCommand as any).mockReturnValue({ 
          error: 'Command failed',
          errorType: 'command-error' 
        });

        const executor = createCommandExecutor(commandName, options);
        await executor(mockCtx);

        expect(LogEngine.error).toHaveBeenCalledWith(
          'Custom Prefix testCommand failed', 
          { 
            error: 'Command failed',
            errorType: 'command-error',
            customKey: 'customValue'
          }
        );
      });
    });

    describe('boolean return type', () => {
      it('should execute command successfully and return boolean result', async () => {
        const commandName = 'testCommand';
        const expectedResult = true;
        (commandRegistry.execute as any).mockResolvedValue(expectedResult);

        const executor = createCommandExecutor(commandName, { returnType: 'boolean' });
        const result = await executor(mockCtx);

        expect((commandRegistry.execute as any)).toHaveBeenCalledWith(commandName, mockCtx);
        expect(result).toBe(expectedResult);
      });

      it('should return defaultReturn value on error', async () => {
        const commandName = 'testCommand';
        const error = new Error('Command failed');
        const defaultReturn = true;
        
        (commandRegistry.execute as any).mockRejectedValue(error);
        (ErrorContextBuilder.forCommand as any).mockReturnValue({ 
          error: 'Command failed',
          errorType: 'command-error' 
        });

        const executor = createCommandExecutor(commandName, { 
          returnType: 'boolean',
          defaultReturn 
        });
        const result = await executor(mockCtx);

        expect(result).toBe(defaultReturn);
      });

      it('should return false as default value when defaultReturn not specified', async () => {
        const commandName = 'testCommand';
        const error = new Error('Command failed');
        
        (commandRegistry.execute as any).mockRejectedValue(error);
        (ErrorContextBuilder.forCommand as any).mockReturnValue({ 
          error: 'Command failed',
          errorType: 'command-error' 
        });

        const executor = createCommandExecutor(commandName, { returnType: 'boolean' });
        const result = await executor(mockCtx);

        expect(result).toBe(false);
      });
    });

    describe('with empty additionalContext', () => {
      it('should not modify error context when additionalContext is empty', async () => {
        const commandName = 'testCommand';
        const error = new Error('Command failed');
        
        (commandRegistry.execute as any).mockRejectedValue(error);
        (ErrorContextBuilder.forCommand as any).mockReturnValue({ 
          error: 'Command failed',
          errorType: 'command-error' 
        });

        const executor = createCommandExecutor(commandName, { 
          additionalContext: {}
        });
        await executor(mockCtx);

        expect(LogEngine.error).toHaveBeenCalledWith(
          'Command testCommand failed', 
          { error: 'Command failed', errorType: 'command-error' }
        );
      });
    });
  });

  describe('createProcessorExecutor', () => {
    it('should create processor executor with correct configuration', async () => {
      const processorName = 'testProcessor';
      const logDescription = 'Test processor description';
      
      (commandRegistry.execute as any).mockResolvedValue(true);

      const processor = createProcessorExecutor(processorName, logDescription);
      const result = await processor(mockCtx);

      expect((commandRegistry.execute as any)).toHaveBeenCalledWith(processorName, mockCtx);
      expect(result).toBe(true);
    });

    it('should return false on error with proper logging', async () => {
      const processorName = 'testProcessor';
      const logDescription = 'Test processor description';
      const error = new Error('Processor failed');
      
      (commandRegistry.execute as any).mockRejectedValue(error);
      (ErrorContextBuilder.forCommand as any).mockReturnValue({ 
        error: 'Processor failed',
        errorType: 'processor-error' 
      });

      const processor = createProcessorExecutor(processorName, logDescription);
      const result = await processor(mockCtx);

      expect((ErrorContextBuilder.forCommand as any)).toHaveBeenCalledWith(error, mockCtx, processorName);
      expect(LogEngine.error).toHaveBeenCalledWith(
        'Test processor description testProcessor failed', 
        { 
          error: 'Processor failed',
          errorType: 'processor-error',
          processorType: 'conversation',
          isLegacyWrapper: true
        }
      );
      expect(result).toBe(false);
    });

    it('should handle successful processor execution', async () => {
      const processorName = 'successProcessor';
      const logDescription = 'Success processor';
      
      (commandRegistry.execute as any).mockResolvedValue(true);

      const processor = createProcessorExecutor(processorName, logDescription);
      const result = await processor(mockCtx);

      expect(result).toBe(true);
      expect(LogEngine.error).not.toHaveBeenCalled();
    });
  });
});
