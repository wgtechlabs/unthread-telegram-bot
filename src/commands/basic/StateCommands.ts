/**
 * State Management Commands
 *
 * Commands for managing conversation state, canceling operations,
 * and resetting user sessions following Clean Code principles.
 *
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js'
import type { BotContext } from '../../types/index.js'
import { BotsStore } from '../../sdk/bots-brain/index.js'
import { logError } from '../utils/errorHandler.js'

export class CancelCommand extends BaseCommand {
  readonly metadata: CommandMetadata = {
    name: 'cancel',
    description: 'Cancel ongoing support form or operation',
    usage: '/cancel',
  }

  protected async executeCommand(ctx: BotContext): Promise<void> {
    const userId = ctx.from?.id
    if (!userId) {
      await ctx.reply('❌ Unable to process cancellation request.')
      return
    }

    try {
      // Clear user state using BotsStore method
      await BotsStore.clearUserState(userId)

      const cancelMessage =
        '❌ **Operation Canceled**\n\n' +
        'All ongoing operations have been canceled and your conversation state has been cleared.\n\n' +
        'You can start fresh anytime by using any command. Use /help to see available options.'

      await ctx.reply(cancelMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logError(error, 'CancelCommand.executeCommand', { userId })
      await ctx.reply(
        '❌ An error occurred while canceling the operation. Please try again.'
      )
    }
  }
}

export class ResetCommand extends BaseCommand {
  readonly metadata: CommandMetadata = {
    name: 'reset',
    description: 'Reset user conversation state and clear form data',
    usage: '/reset',
  }

  protected async executeCommand(ctx: BotContext): Promise<void> {
    const userId = ctx.from?.id
    if (!userId) {
      await ctx.reply('❌ Unable to process reset request.')
      return
    }

    try {
      // Clear all user-related state using BotsStore methods
      await BotsStore.clearUserState(userId)

      const resetMessage =
        '🔄 **Conversation Reset Complete**\n\n' +
        'Your conversation state has been completely reset. All form data and session information has been cleared.\n\n' +
        "**What's been reset:**\n" +
        '• Support form progress\n' +
        '• Template editing sessions\n' +
        '• Profile update data\n' +
        '• Setup configurations\n\n' +
        'You can now start fresh with any command. Use /help to see your options!'

      await ctx.reply(resetMessage, { parse_mode: 'Markdown' })
    } catch (error) {
      logError(error, 'ResetCommand.executeCommand', { userId })
      await ctx.reply(
        '❌ An error occurred while resetting your conversation state. Please try again.'
      )
    }
  }
}
