/**
 * Unit tests for commands/utils/commandExecutor.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotContext } from '../types/index.js';
import { 
  type CommandExecutorOptions,
  createCommandExecutor, 
  createProcessorExecutor
} from '../commands/utils/commandExecutor.js';

// Mock dependencies
vi.mock('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    error: vi.fn()
  }
}));

vi.mock('../base/CommandRegistry.js', () => ({
  commandRegistry: {
    execute: vi.fn()
  }
}));

vi.mock('../../utils/errorContextBuilder.js', () => ({
  ErrorContextBuilder: {
    forCommand: vi.fn(() => ({ errorType: 'test-error' }))
  }
}));

// Import mocked modules for type checking
import { LogEngine } from '@wgtechlabs/log-engine';
import { commandRegistry } from '../base/CommandRegistry.js';
import { ErrorContextBuilder } from '../../utils/errorContextBuilder.js';

describe('commandExecutor utilities', () => {
  let mockCtx: BotContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = {
      message: { text: 'test command' },
      from: { id: 123 }
    } as BotContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCommandExecutor', () => {
    describe('void return type (default)', () => {
      it('should execute command successfully and return void', async () => {
        const commandName = 'testCommand';
        vi.mocked(commandRegistry.execute).mockResolvedValue(true);

        const executor = createCommandExecutor(commandName);
        const result = await executor(mockCtx);

        expect(commandRegistry.execute).toHaveBeenCalledWith(commandName, mockCtx);
        expect(result).toBeUndefined();
      });

      it('should handle command execution errors and return void', async () => {
        const commandName = 'testCommand';
        const error = new Error('Command failed');
        vi.mocked(commandRegistry.execute).mockRejectedValue(error);
        vi.mocked(ErrorContextBuilder.forCommand).mockReturnValue({ 
          errorType: 'command-error',
          commandName 
        });

        const executor = createCommandExecutor(commandName);
        const result = await executor(mockCtx);

        expect(commandRegistry.execute).toHaveBeenCalledWith(commandName, mockCtx);
        expect(ErrorContextBuilder.forCommand).toHaveBeenCalledWith(error, mockCtx, commandName);
        expect(LogEngine.error).toHaveBeenCalledWith(
          'Command testCommand failed', 
          { errorType: 'command-error', commandName }
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

        vi.mocked(commandRegistry.execute).mockRejectedValue(error);
        vi.mocked(ErrorContextBuilder.forCommand).mockReturnValue({ 
          errorType: 'command-error' 
        });

        const executor = createCommandExecutor(commandName, options);
        await executor(mockCtx);

        expect(LogEngine.error).toHaveBeenCalledWith(
          'Custom Prefix testCommand failed', 
          { 
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
        vi.mocked(commandRegistry.execute).mockResolvedValue(expectedResult);

        const executor = createCommandExecutor(commandName, { returnType: 'boolean' });
        const result = await executor(mockCtx);

        expect(commandRegistry.execute).toHaveBeenCalledWith(commandName, mockCtx);
        expect(result).toBe(expectedResult);
      });

      it('should return defaultReturn value on error', async () => {
        const commandName = 'testCommand';
        const error = new Error('Command failed');
        const defaultReturn = true;
        
        vi.mocked(commandRegistry.execute).mockRejectedValue(error);
        vi.mocked(ErrorContextBuilder.forCommand).mockReturnValue({ 
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
        
        vi.mocked(commandRegistry.execute).mockRejectedValue(error);
        vi.mocked(ErrorContextBuilder.forCommand).mockReturnValue({ 
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
        
        vi.mocked(commandRegistry.execute).mockRejectedValue(error);
        vi.mocked(ErrorContextBuilder.forCommand).mockReturnValue({ 
          errorType: 'command-error' 
        });

        const executor = createCommandExecutor(commandName, { 
          additionalContext: {}
        });
        await executor(mockCtx);

        expect(LogEngine.error).toHaveBeenCalledWith(
          'Command testCommand failed', 
          { errorType: 'command-error' }
        );
      });
    });
  });

  describe('createProcessorExecutor', () => {
    it('should create processor executor with correct configuration', async () => {
      const processorName = 'testProcessor';
      const logDescription = 'Test processor description';
      
      vi.mocked(commandRegistry.execute).mockResolvedValue(true);

      const processor = createProcessorExecutor(processorName, logDescription);
      const result = await processor(mockCtx);

      expect(commandRegistry.execute).toHaveBeenCalledWith(processorName, mockCtx);
      expect(result).toBe(true);
    });

    it('should return false on error with proper logging', async () => {
      const processorName = 'testProcessor';
      const logDescription = 'Test processor description';
      const error = new Error('Processor failed');
      
      vi.mocked(commandRegistry.execute).mockRejectedValue(error);
      vi.mocked(ErrorContextBuilder.forCommand).mockReturnValue({ 
        errorType: 'processor-error' 
      });

      const processor = createProcessorExecutor(processorName, logDescription);
      const result = await processor(mockCtx);

      expect(ErrorContextBuilder.forCommand).toHaveBeenCalledWith(error, mockCtx, processorName);
      expect(LogEngine.error).toHaveBeenCalledWith(
        'Test processor description testProcessor failed', 
        { 
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
      
      vi.mocked(commandRegistry.execute).mockResolvedValue(true);

      const processor = createProcessorExecutor(processorName, logDescription);
      const result = await processor(mockCtx);

      expect(result).toBe(true);
      expect(LogEngine.error).not.toHaveBeenCalled();
    });
  });
});