/**
 * Support Command - Complete Clean Implementation
 *
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js'
import { BotsStore } from '../../sdk/bots-brain/index.js'
import * as unthreadService from '../../services/unthread.js'
import { LogEngine } from '@wgtechlabs/log-engine'
import { BotContext } from '../../types/index.js'
import { UserState } from '../../sdk/types.js'

export class SupportCommand extends BaseCommand {
  readonly metadata: CommandMetadata = {
    name: 'support',
    description: 'Create a new support ticket',
    usage: '/support',
    examples: ['/support - Start the support ticket creation wizard'],
    requiresSetup: true,
  }

  protected async executeCommand(ctx: BotContext): Promise<void> {
    const userId = ctx.from?.id
    const chatId = ctx.chat?.id

    if (!userId || !chatId || chatId > 0) {
      await ctx.reply(
        '❌ **Support tickets can only be created in group chats.**\n\n' +
          'Please use this command in your designated support group chat.',
        { parse_mode: 'Markdown' }
      )
      return
    }

    try {
      // Check if user already has an active ticket creation session
      const existingState = await BotsStore.getUserState(userId)
      if (existingState) {
        await this.handleExistingSession(ctx, existingState)
        return
      }

      // Start new ticket creation process
      await this.startTicketCreation(ctx)
    } catch (error) {
      LogEngine.error('Error in support command', {
        error: (error as Error).message,
        userId,
        chatId,
      })

      await ctx.reply(
        '❌ **Error starting support ticket**\n\n' +
          'An unexpected error occurred. Please try again or contact an administrator.',
        { parse_mode: 'Markdown' }
      )
    }
  }

  private async handleExistingSession(
    ctx: BotContext,
    state: UserState
  ): Promise<void> {
    const message =
      '🎫 **Support Ticket in Progress**\n\n' +
      'You already have a support ticket creation session active.\n\n' +
      '**Current Step:** ' +
      (state.field === 'summary'
        ? 'Waiting for issue summary'
        : 'Waiting for email address') +
      '\n\n' +
      '**What would you like to do?**'

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '▶️ Continue', callback_data: 'support_continue' },
            { text: '🔄 Restart', callback_data: 'support_restart' },
          ],
          [{ text: '❌ Cancel', callback_data: 'support_cancel' }],
        ],
      },
    })
  }

  private async startTicketCreation(ctx: BotContext): Promise<void> {
    // Defensive check for ctx.from
    if (!ctx.from) {
      LogEngine.warn('Support command executed without sender information')
      await ctx.reply('❌ Unable to process request. Please try again.')
      return
    }

    // Defensive check for ctx.chat
    if (!ctx.chat) {
      LogEngine.warn('Support command executed without chat information')
      await ctx.reply('❌ Unable to process request. Please try again.')
      return
    }

    const userId = ctx.from.id

    // Check if user already has email stored
    const userData = await unthreadService.getOrCreateUser(
      userId,
      ctx.from?.username
    )
    const hasEmail = userData?.email

    // Set initial user state
    await BotsStore.setUserState(userId, {
      field: 'summary',
      step: 1,
      totalSteps: hasEmail ? 1 : 2,
      hasEmail: !!hasEmail,
      chatId: ctx.chat.id,
      startedAt: new Date().toISOString(),
    })

    const message =
      '🎫 **Create Support Ticket**\n\n' +
      "I'll help you create a support ticket. This will connect you directly with our support team.\n\n" +
      `**Step 1 of ${hasEmail ? 1 : 2}:** Please describe your issue or question.\n\n` +
      "*Type your message below and I'll create your ticket:*"

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        input_field_placeholder: 'Describe your issue...',
      },
    })
  }
}
