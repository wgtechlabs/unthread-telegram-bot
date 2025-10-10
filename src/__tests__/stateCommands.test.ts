/**
 * Unit tests for commands/basic/StateCommands.ts
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BotContext } from '../../types/index.js';
import { CancelCommand, ResetCommand } from '../commands/basic/StateCommands.js';

// Mock dependencies
vi.mock('../sdk/bots-brain/index.js', () => ({
  BotsStore: {
    clearUserState: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('../commands/utils/errorHandler.js', () => ({
  logError: vi.fn()
}));

import { BotsStore } from '../sdk/bots-brain/index.js';
import { logError } from '../commands/utils/errorHandler.js';

describe('StateCommands', () => {
  let mockCtx: BotContext;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCtx = {
      from: { id: 123, first_name: 'Test', is_bot: false },
      chat: { id: 456, type: 'private' },
      message: { text: '/cancel', message_id: 789 },
      reply: vi.fn()
    } as BotContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CancelCommand', () => {
    let cancelCommand: CancelCommand;

    beforeEach(() => {
      cancelCommand = new CancelCommand();
    });

    it('should have correct metadata', () => {
      expect(cancelCommand.metadata.name).toBe('cancel');
      expect(cancelCommand.metadata.description).toBe('Cancel ongoing support form or operation');
      expect(cancelCommand.metadata.usage).toBe('/cancel');
    });

    it('should successfully cancel and clear user state', async () => {
      await cancelCommand.execute(mockCtx);

      expect(BotsStore.clearUserState).toHaveBeenCalledWith(123);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('❌ **Operation Canceled**'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should handle missing user ID', async () => {
      const ctxWithoutUserId = {
        ...mockCtx,
        from: undefined
      } as BotContext;

      await cancelCommand.execute(ctxWithoutUserId);

      expect(BotsStore.clearUserState).not.toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        "❌ Invalid command context. Please try again."
      );
    });

    it('should handle BotsStore errors gracefully', async () => {
      const error = new Error('BotsStore error');
      vi.mocked(BotsStore.clearUserState).mockRejectedValue(error);

      await cancelCommand.execute(mockCtx);

      expect(logError).toHaveBeenCalledWith(
        error,
        'CancelCommand.executeCommand',
        { userId: 123 }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        "❌ An error occurred while canceling the operation. Please try again."
      );
    });

    it('should include help text in cancel message', async () => {
      await cancelCommand.execute(mockCtx);

      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      expect(replyCall[0]).toContain('Use /help to see available options');
    });
  });

  describe('ResetCommand', () => {
    let resetCommand: ResetCommand;

    beforeEach(() => {
      resetCommand = new ResetCommand();
    });

    it('should have correct metadata', () => {
      expect(resetCommand.metadata.name).toBe('reset');
      expect(resetCommand.metadata.description).toBe('Reset user conversation state and clear form data');
      expect(resetCommand.metadata.usage).toBe('/reset');
    });

    it('should successfully reset and clear user state', async () => {
      await resetCommand.execute(mockCtx);

      expect(BotsStore.clearUserState).toHaveBeenCalledWith(123);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🔄 **Conversation Reset Complete**'),
        { parse_mode: 'Markdown' }
      );
    });

    it('should handle missing user ID', async () => {
      const ctxWithoutUserId = {
        ...mockCtx,
        from: undefined
      } as BotContext;

      await resetCommand.execute(ctxWithoutUserId);

      expect(BotsStore.clearUserState).not.toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        "❌ Invalid command context. Please try again."
      );
    });

    it('should handle BotsStore errors gracefully', async () => {
      const error = new Error('BotsStore error');
      vi.mocked(BotsStore.clearUserState).mockRejectedValue(error);

      await resetCommand.execute(mockCtx);

      expect(logError).toHaveBeenCalledWith(
        error,
        'ResetCommand.executeCommand',
        { userId: 123 }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        "❌ An error occurred while resetting your conversation state. Please try again."
      );
    });

    it('should include detailed reset information', async () => {
      await resetCommand.execute(mockCtx);

      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      const message = replyCall[0];
      
      expect(message).toContain('Support form progress');
      expect(message).toContain('Template editing sessions');
      expect(message).toContain('Profile update data');
      expect(message).toContain('Setup configurations');
      expect(message).toContain('Use /help to see your options');
    });

    it('should use correct markdown formatting', async () => {
      await resetCommand.execute(mockCtx);

      const replyCall = vi.mocked(mockCtx.reply).mock.calls[0];
      expect(replyCall[1]).toEqual({ parse_mode: 'Markdown' });
    });
  });

  describe('Command inheritance', () => {
    it('CancelCommand should extend BaseCommand', () => {
      const cancelCommand = new CancelCommand();
      expect(cancelCommand).toHaveProperty('execute');
      expect(cancelCommand).toHaveProperty('generateHelp');
      expect(typeof cancelCommand.execute).toBe('function');
      expect(typeof cancelCommand.generateHelp).toBe('function');
    });

    it('ResetCommand should extend BaseCommand', () => {
      const resetCommand = new ResetCommand();
      expect(resetCommand).toHaveProperty('execute');
      expect(resetCommand).toHaveProperty('generateHelp');
      expect(typeof resetCommand.execute).toBe('function');
      expect(typeof resetCommand.generateHelp).toBe('function');
    });

    it('should generate help text for cancel command', () => {
      const cancelCommand = new CancelCommand();
      const help = cancelCommand.generateHelp();
      
      expect(help).toContain('cancel');
      expect(help).toContain('/cancel');
      expect(help).toContain('Cancel ongoing support form or operation');
    });

    it('should generate help text for reset command', () => {
      const resetCommand = new ResetCommand();
      const help = resetCommand.generateHelp();
      
      expect(help).toContain('reset');
      expect(help).toContain('/reset');
      expect(help).toContain('Reset user conversation state and clear form data');
    });
  });
});