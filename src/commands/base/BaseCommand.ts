/**
 * Enhanced Base Command with Complete Authorization System
 *
 * @author Waren Gonzaga, WG Technology Labs
 */

import type { BotContext } from '../../types/index.js'
import { LogEngine } from '@wgtechlabs/log-engine'
import { isAdminUser, getConfiguredBotUsername } from '../../config/env.js'
import { validateAdminAccess } from '../../utils/permissions.js'

export interface CommandMetadata {
  name: string
  description: string
  usage: string
  examples?: string[]
  adminOnly?: boolean
  groupOnly?: boolean
  privateOnly?: boolean
  requiresSetup?: boolean
}

export interface ICommand {
  metadata: CommandMetadata
  execute(ctx: BotContext): Promise<void>
  generateHelp(): string
}

export interface IConversationProcessor {
  canHandle(ctx: BotContext): Promise<boolean>
  process(ctx: BotContext): Promise<boolean>
}

export interface ICallbackProcessor {
  canHandle(callbackData: string): boolean
  process(ctx: BotContext, callbackData: string): Promise<boolean>
}

export abstract class BaseCommand implements ICommand {
  abstract readonly metadata: CommandMetadata

  /**
   * Template method for command execution with comprehensive validation
   */
  async execute(ctx: BotContext): Promise<void> {
    const startTime = Date.now()

    try {
      // Context validation
      if (!this.validateContext(ctx)) {
        await this.handleInvalidContext(ctx)
        return
      }

      // Authorization check
      if (!(await this.canExecute(ctx))) {
        await this.handleUnauthorized(ctx)
        return
      }

      // Setup requirement check
      if (this.metadata.requiresSetup && !(await this.validateSetup(ctx))) {
        await this.handleSetupRequired(ctx)
        return
      }

      LogEngine.info(`Executing command: ${this.metadata.name}`, {
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        chatType: ctx.chat?.type,
        command: this.metadata.name,
      })

      await this.executeCommand(ctx)

      LogEngine.info(`Command completed: ${this.metadata.name}`, {
        userId: ctx.from?.id,
        chatId: ctx.chat?.id,
        executionTime: Date.now() - startTime,
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }

  /**
   * Command-specific execution logic (implemented by subclasses)
   */
  protected abstract executeCommand(ctx: BotContext): Promise<void>

  /**
   * Context validation
   */
  protected validateContext(ctx: BotContext): boolean {
    return !!(ctx.from && ctx.chat)
  }

  /**
   * Authorization check with comprehensive validation
   */
  protected async canExecute(ctx: BotContext): Promise<boolean> {
    const userId = ctx.from?.id
    const chatType = ctx.chat?.type

    // Basic context requirements
    if (this.metadata.privateOnly && chatType !== 'private') {
      return false
    }

    if (this.metadata.groupOnly && chatType === 'private') {
      return false
    }

    // Admin requirements
    if (this.metadata.adminOnly && userId) {
      if (!isAdminUser(userId)) {
        return false
      }

      // For admin commands, also check if admin has activated their profile
      // This ensures proper admin setup and secure communication channels
      if (this.metadata.name !== 'activate') {
        // Skip check for activate command itself
        try {
          const { BotsStore } = await import('../../sdk/bots-brain/index.js')
          const adminProfile = await BotsStore.getAdminProfile(userId)
          if (!adminProfile?.isActivated) {
            return false // Will trigger handleUnauthorized with proper messaging
          }
        } catch (error) {
          LogEngine.error(
            'Failed to check admin profile during authorization',
            {
              userId,
              command: this.metadata.name,
              error: (error as Error).message,
            }
          )
          return false
        }
      }

      // Additional admin validation for sensitive commands in group context
      if (chatType !== 'private') {
        return await validateAdminAccess(ctx)
      }
    }

    return true
  }

  /**
   * Setup validation for commands that require group configuration
   */
  protected async validateSetup(ctx: BotContext): Promise<boolean> {
    if (!this.metadata.requiresSetup) {
      return true
    }

    // Import here to avoid circular dependencies
    const { BotsStore } = await import('../../sdk/bots-brain/index.js')

    if (ctx.chat?.type === 'private') {
      return true // Private chats don't need setup
    }

    const groupConfig = await BotsStore.getGroupConfig(ctx.chat!.id)
    return groupConfig?.isConfigured === true
  }

  /**
   * Handle invalid context
   */
  protected async handleInvalidContext(ctx: BotContext): Promise<void> {
    await ctx.reply('❌ Invalid command context. Please try again.')
  }

  /**
   * Handle unauthorized access with detailed feedback
   */
  protected async handleUnauthorized(ctx: BotContext): Promise<void> {
    const chatType = ctx.chat?.type
    const userId = ctx.from?.id

    if (this.metadata.adminOnly && userId) {
      if (!isAdminUser(userId)) {
        await ctx.reply(
          '🔒 **Admin Only Command**\n\n' +
            'This command requires administrator privileges. Contact your bot administrator for access.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      // Check if admin activation is the issue
      if (this.metadata.name !== 'activate') {
        try {
          const { BotsStore } = await import('../../sdk/bots-brain/index.js')
          const adminProfile = await BotsStore.getAdminProfile(userId)
          if (!adminProfile?.isActivated) {
            await this.handleAdminActivationRequired(ctx)
            return
          }
        } catch (error) {
          LogEngine.error(
            'Failed to check admin profile in handleUnauthorized',
            {
              userId,
              command: this.metadata.name,
              error: (error as Error).message,
            }
          )
        }
      }
    }

    if (this.metadata.privateOnly && chatType !== 'private') {
      await ctx.reply(
        '📱 **Private Chat Required**\n\n' +
          `The \`/${this.metadata.name}\` command can only be used in private chat with the bot.\n\n` +
          "Please click on the bot's name and start a private conversation.",
        { parse_mode: 'Markdown' }
      )
      return
    }

    if (this.metadata.groupOnly && chatType === 'private') {
      await ctx.reply(
        '👥 **Group Chat Required**\n\n' +
          `The \`/${this.metadata.name}\` command can only be used in group chats.\n\n` +
          'Please use this command in a configured group chat.',
        { parse_mode: 'Markdown' }
      )
      return
    }

    await ctx.reply("❌ You don't have permission to use this command.")
  }

  /**
   * Handle setup requirement not met
   */
  protected async handleSetupRequired(ctx: BotContext): Promise<void> {
    const userId = ctx.from?.id
    const isAdmin = userId ? isAdminUser(userId) : false

    if (isAdmin) {
      await ctx.reply(
        '⚙️ **Group Setup Required**\n\n' +
          'This group needs to be configured before support tickets can be created.\n\n' +
          '**Admin Action Required:**\n' +
          '1. Use `/setup` command to configure this group\n' +
          '2. Link to a customer or create a new one\n' +
          '3. Complete the setup wizard\n\n' +
          'Once setup is complete, all users can create support tickets.',
        { parse_mode: 'Markdown' }
      )
    } else {
      await ctx.reply(
        '⚠️ **Setup Required**\n\n' +
          'This group is not yet configured for support tickets.\n\n' +
          'Please contact a group administrator to complete the setup process using the `/setup` command.',
        { parse_mode: 'Markdown' }
      )
    }
  }

  /**
   * Handle case where admin needs to activate their privileges
   */
  protected async handleAdminActivationRequired(
    ctx: BotContext
  ): Promise<void> {
    const firstName = ctx.from?.first_name || 'Admin'
    const commandName = this.metadata.name

    try {
      // Try to get bot username for deep link generation
      const botUsername = await this.getBotUsername(ctx)

      const activationMessage =
        '🔐 **Admin Activation Required**\n\n' +
        `Hello ${firstName}! To use the \`/${commandName}\` command, you need to activate your admin privileges first.\n\n` +
        '**Quick Setup:**\n' +
        '1. **Send me a private message** (DM)\n' +
        '2. Use the `/activate` command in our DM\n' +
        '3. Return and try the command again\n\n' +
        '**Why activate?**\n' +
        '• Secure admin communication channel\n' +
        '• Enhanced bot administration features\n' +
        '• Notifications and configuration updates\n\n' +
        '**Ready?** Click below to start activation:'

      await ctx.reply(activationMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Start Activation',
                url: `https://t.me/${botUsername}?start=admin_activate`,
              },
            ],
          ],
        },
      })
    } catch (error) {
      LogEngine.error(
        'Failed to generate admin activation message with deep link',
        {
          error: error instanceof Error ? error.message : String(error),
          commandName,
          userId: ctx.from?.id,
        }
      )

      // Fallback message without deep link
      const fallbackMessage =
        '🔐 **Admin Activation Required**\n\n' +
        `Hello ${firstName}! To use the \`/${commandName}\` command, you need to activate your admin privileges first.\n\n` +
        '**Setup Steps:**\n' +
        '1. **Send me a private message** by clicking on my profile\n' +
        '2. Use the `/activate` command in our private chat\n' +
        '3. Return here and try the command again\n\n' +
        '**Why activate?**\n' +
        '• Secure admin communication channel\n' +
        '• Enhanced bot administration features\n' +
        '• Notifications and configuration updates\n\n' +
        '*Start a private chat with me to activate admin features.*'

      await ctx.reply(fallbackMessage, { parse_mode: 'Markdown' })
    }
  }

  /**
   * Retrieve bot username with optional performance optimization
   *
   * Two modes:
   * 1. BOT_USERNAME configured → Zero API calls, guaranteed performance
   * 2. BOT_USERNAME not configured → Use API calls, fail if API fails (no fallback)
   */
  private async getBotUsername(ctx: BotContext): Promise<string> {
    // 🚀 OPTIMIZATION: Check if we have a pre-configured username (ZERO API CALLS!)
    const configuredUsername = getConfiguredBotUsername()
    if (configuredUsername) {
      LogEngine.debug('Using configured bot username (API calls eliminated)', {
        username: configuredUsername,
        source: 'environment_config',
      })
      return configuredUsername
    }

    // Not configured - use API calls as intended, fail if they fail
    LogEngine.debug('No configured username, using API retrieval')

    try {
      // Try context first (no additional API call)
      if (ctx.botInfo?.username) {
        LogEngine.debug('Using bot username from context', {
          username: ctx.botInfo.username,
          source: 'bot_context',
        })
        return ctx.botInfo.username
      }

      // Fetch from API
      LogEngine.debug('Fetching bot username from Telegram API')
      const botInfo = await ctx.telegram.getMe()

      if (!botInfo.username) {
        throw new Error(
          'Bot username not available from Telegram API - bot may not have a username set'
        )
      }

      LogEngine.debug('Retrieved bot username from API', {
        username: botInfo.username,
        source: 'telegram_api',
      })

      return botInfo.username
    } catch (error) {
      LogEngine.error('Failed to retrieve bot username via API', {
        error: error instanceof Error ? error.message : String(error),
        contextHasBotInfo: !!ctx.botInfo,
        hasConfiguredUsername: false,
      })

      // NO FALLBACK - fail is fail!
      throw new Error(
        `Unable to retrieve bot username. Either:\n` +
          `1. Set BOT_USERNAME environment variable for optimal performance, or\n` +
          `2. Ensure Telegram API is accessible and bot has a username set.\n` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Centralized error handling with context awareness
   */
  protected async handleError(ctx: BotContext, error: unknown): Promise<void> {
    const errorId = Date.now().toString(36)

    LogEngine.error(`Command error: ${this.metadata.name}`, {
      errorId,
      command: this.metadata.name,
      error: error instanceof Error ? error.message : String(error),
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      stack: error instanceof Error ? error.stack : undefined,
    })

    // User-friendly error message
    const isAdmin = ctx.from?.id ? isAdminUser(ctx.from.id) : false
    const errorMessage = isAdmin
      ? `❌ **Command Error**\n\nAn error occurred while executing \`/${this.metadata.name}\`.\n\n**Error ID:** \`${errorId}\`\n\nPlease check the logs for more details.`
      : `❌ **Something went wrong**\n\nPlease try again in a moment. If the problem persists, contact an administrator.\n\n**Error ID:** \`${errorId}\``

    await ctx.reply(errorMessage, { parse_mode: 'Markdown' })
  }

  /**
   * Generate help text for this command
   */
  public generateHelp(): string {
    let help = `**/${this.metadata.name}** - ${this.metadata.description}\n`
    help += `**Usage:** ${this.metadata.usage}\n`

    if (this.metadata.examples?.length) {
      help += `**Examples:**\n${this.metadata.examples.map((ex) => `• ${ex}`).join('\n')}\n`
    }

    const restrictions: string[] = []
    if (this.metadata.adminOnly) restrictions.push('Admin only')
    if (this.metadata.privateOnly) restrictions.push('Private chat only')
    if (this.metadata.groupOnly) restrictions.push('Group chat only')
    if (this.metadata.requiresSetup) restrictions.push('Requires group setup')

    if (restrictions.length > 0) {
      help += `**Restrictions:** ${restrictions.join(', ')}\n`
    }

    return help
  }
}
