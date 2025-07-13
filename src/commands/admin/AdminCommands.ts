/**
 * Admin Commands - Complete Implementation
 *
 * Handles admin-specific commands including activation, setup, and templates
 * following Clean Code principles and SOLID design.
 *
 * @author Waren Gonzaga, WG Technology Labs
 */

import { BaseCommand, type CommandMetadata } from '../base/BaseCommand.js'
import type { BotContext } from '../../types/index.js'
import { BotsStore } from '../../sdk/bots-brain/index.js'
import {
  checkAndPromptBotAdmin,
  isBotAdmin,
} from '../../utils/botPermissions.js'
import { logError, createUserErrorMessage } from '../utils/errorHandler.js'
import { getCompanyName } from '../../config/env.js'
import { GlobalTemplateManager } from '../../utils/globalTemplateManager.js'
import { ValidationService } from '../../services/validationService.js'
import type { AdminProfile, GroupConfig } from '../../sdk/types.js'
import type { GlobalTemplate } from '../../config/globalTemplates.js'
import { SetupCallbackProcessor } from '../processors/CallbackProcessors.js'

// Clean Code: Extract magic numbers to named constants
const SETUP_SESSION_TIMEOUT_MINUTES = 10

export class ActivateCommand extends BaseCommand {
  readonly metadata: CommandMetadata = {
    name: 'activate',
    description: 'Activate admin privileges for advanced features',
    usage: '/activate',
    examples: ['/activate - Activate admin access in private chat'],
    adminOnly: true,
    privateOnly: true,
  }

  protected async executeCommand(ctx: BotContext): Promise<void> {
    const userId = ctx.from!.id

    try {
      // Check if admin is already activated
      const adminProfile = await BotsStore.getAdminProfile(userId)

      if (adminProfile?.isActivated) {
        await this.handleAlreadyActivated(ctx, adminProfile)
        return
      }

      // Activate admin
      await this.activateAdmin(ctx, userId)
    } catch (error) {
      logError(error, 'ActivateCommand.executeCommand', { userId })
      await ctx.reply(createUserErrorMessage(error))
    }
  }

  private async handleAlreadyActivated(
    ctx: BotContext,
    adminProfile: AdminProfile
  ): Promise<void> {
    const lastActiveDate = new Date(
      adminProfile.lastActiveAt
    ).toLocaleDateString()

    const message =
      '✅ **Admin Already Activated**\n\n' +
      'Your administrator privileges are already active!\n\n' +
      `**Status:** Active\n` +
      `**Last Activity:** ${lastActiveDate}\n` +
      `**DM Chat ID:** ${adminProfile.dmChatId}\n\n` +
      '**Available Admin Commands:**\n' +
      '• `/setup` - Configure group chats\n' +
      '• `/templates` - Manage message templates\n' +
      '• `/help` - View all commands\n\n' +
      "*You're ready to manage bot settings!*"

    await ctx.reply(message, { parse_mode: 'Markdown' })
  }

  private async activateAdmin(ctx: BotContext, userId: number): Promise<void> {
    const companyName = getCompanyName() || 'Support'

    // Create admin profile
    const adminProfile = {
      telegramUserId: userId,
      isActivated: true,
      dmChatId: ctx.chat!.id,
      activatedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    }

    await BotsStore.storeAdminProfile(adminProfile)

    const activationMessage =
      `🎉 **Admin Activation Successful!**\n\n` +
      `Welcome to ${companyName} Bot Administration!\n\n` +
      `**✅ Activated Features:**\n` +
      `• Group chat configuration via /setup\n` +
      `• Message template management via /templates\n` +
      `• Advanced bot administration tools\n` +
      `• Priority support and notifications\n\n` +
      `**🔧 Next Steps:**\n` +
      `1. Use /setup in group chats to configure support\n` +
      `2. Customize message templates with /templates\n` +
      `3. Check /help for all available commands\n\n` +
      `**🛡️ Security Note:**\n` +
      `Your admin status is linked to this private chat. Keep this conversation secure.\n\n` +
      `*You're now ready to manage the bot!*`

    await ctx.reply(activationMessage, { parse_mode: 'Markdown' })
  }
}

export class SetupCommand extends BaseCommand {
  readonly metadata: CommandMetadata = {
    name: 'setup',
    description: 'Configure group chat for support tickets',
    usage: '/setup',
    examples: ['/setup - Start group configuration wizard'],
    adminOnly: true,
    groupOnly: true,
  }

  protected async executeCommand(ctx: BotContext): Promise<void> {
    const userId = ctx.from!.id
    const chatId = ctx.chat!.id
    const chatTitle =
      'title' in ctx.chat!
        ? ctx.chat!.title || 'Unknown Group'
        : 'Unknown Group'

    try {
      // Check if admin has activated their privileges via /activate command
      const adminProfile = await BotsStore.getAdminProfile(userId)
      if (!adminProfile?.isActivated) {
        await this.handleAdminNotActivated(ctx, userId)
        return
      }

      // Check if bot has admin permissions
      const hasBotAdmin = await isBotAdmin(ctx)
      if (!hasBotAdmin) {
        await checkAndPromptBotAdmin(ctx)
        return
      }

      // Check for existing configuration
      const existingConfig = await BotsStore.getGroupConfig(chatId)
      if (existingConfig?.isConfigured) {
        await this.handleExistingSetup(ctx, existingConfig)
        return
      }

      // Start setup wizard
      await this.startSetupWizard(ctx, userId, chatId, chatTitle)
    } catch (error) {
      logError(error, 'SetupCommand.executeCommand', { userId, chatId })
      await ctx.reply(createUserErrorMessage(error))
    }
  }

  private async handleExistingSetup(
    ctx: BotContext,
    config: GroupConfig
  ): Promise<void> {
    const setupDate = config.setupAt
      ? new Date(config.setupAt).toLocaleDateString()
      : 'Unknown'

    const message =
      '⚙️ **Group Already Configured**\n\n' +
      'This group is already set up for support tickets!\n\n' +
      `**Current Configuration:**\n` +
      `• Customer: ${config.customerName}\n` +
      `• Customer ID: ${config.customerId}\n` +
      `• Configured: ${setupDate}\n` +
      `• Setup By: Admin #${config.setupBy}\n\n` +
      '**Available Actions:**'

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔄 Reconfigure',
              callback_data: `setup_reconfigure_${ctx.chat!.id}`,
            },
            {
              text: '👁️ View Details',
              callback_data: `setup_details_${ctx.chat!.id}`,
            },
          ],
          [
            {
              text: '📝 Edit Templates',
              callback_data: `setup_templates_${ctx.chat!.id}`,
            },
            {
              text: '❌ Remove Setup',
              callback_data: `setup_remove_${ctx.chat!.id}`,
            },
          ],
        ],
      },
    })
  }

  private async startSetupWizard(
    ctx: BotContext,
    userId: number,
    chatId: number,
    chatTitle: string
  ): Promise<void> {
    try {
      // Create a setup session using the proper adminManager function
      const { createDmSetupSession } = await import(
        '../../utils/adminManager.js'
      )
      const sessionId = await createDmSetupSession(userId, chatId, chatTitle)

      if (!sessionId) {
        await ctx.reply(
          '❌ **Setup Error**\n\n' +
            'Failed to create setup session. Please try again.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      const adminProfile = await BotsStore.getAdminProfile(userId)

      if (!adminProfile?.dmChatId) {
        await ctx.reply(
          '❌ **Setup Error**\n\n' +
            'Cannot initiate setup: Admin DM chat not found.\n' +
            'Please re-run `/activate` in private chat first.',
          { parse_mode: 'Markdown' }
        )
        return
      }

      // Send confirmation in group
      const groupMessage =
        '✅ **Setup Started**\n\n' +
        'Check your private messages to complete the setup for Unthread x Telegram.\n\n' +
        '⚡ **Quick Setup: Just two simple choices in your DM!**'

      await ctx.reply(groupMessage, { parse_mode: 'Markdown' })

      // Initiate DM setup process
      await this.initiateDmSetup(
        ctx,
        sessionId,
        adminProfile.dmChatId,
        chatId,
        chatTitle
      )
    } catch (error) {
      logError(error, 'SetupCommand.startSetupWizard', { userId, chatId })
      await ctx.reply(
        '❌ **Setup Error**\n\nFailed to start setup. Please try again.'
      )
    }
  }

  private async initiateDmSetup(
    ctx: BotContext,
    sessionId: string,
    dmChatId: number,
    groupChatId: number,
    groupTitle: string
  ): Promise<void> {
    try {
      // Send initial setup message to admin's DM
      const welcomeMessage =
        '🚀 **Group Setup Configuration**\n\n' +
        `**Group:** ${groupTitle}\n` +
        `**Chat ID:** \`${groupChatId}\`\n\n` +
        'Running pre-setup validation checks...\n\n' +
        '⏳ *Please wait while I verify the setup requirements...*'

      const sentMessage = await ctx.telegram.sendMessage(
        dmChatId,
        welcomeMessage,
        {
          parse_mode: 'Markdown',
        }
      )

      // Run setup validation checks
      await this.performSetupValidation(
        ctx,
        sessionId,
        dmChatId,
        groupChatId,
        groupTitle,
        sentMessage.message_id
      )
    } catch (error) {
      logError(error, 'SetupCommand.initiateDmSetup', {
        sessionId,
        dmChatId,
        groupChatId,
      })
      // Try to notify in group about DM failure
      await ctx.reply(
        '⚠️ **DM Setup Failed**\n\n' +
          'Could not send setup instructions to your private chat.\n' +
          'Please ensure you have started a conversation with the bot first.',
        { parse_mode: 'Markdown' }
      )
    }
  }

  private async handleAdminNotActivated(
    ctx: BotContext,
    userId: number
  ): Promise<void> {
    const username = ctx.from?.username ? `@${ctx.from.username}` : 'Admin'
    const firstName = ctx.from?.first_name || 'Admin'

    const activationMessage =
      '🔐 **Admin Activation Required**\n\n' +
      `Hello ${firstName}! Before you can configure group chats, you need to activate your admin privileges.\n\n` +
      '**Required Steps:**\n' +
      '1. Send me a **private message** (DM)\n' +
      '2. Use the `/activate` command in our private chat\n' +
      '3. Return here and try `/setup` again\n\n' +
      '**Why is this needed?**\n' +
      '• Ensures secure admin communication channel\n' +
      '• Enables notifications and configuration updates\n' +
      '• Links your admin account to a private chat for security\n\n' +
      '**Start Here:** Click the button below to message me privately.'

    await ctx.reply(activationMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '💬 Send Private Message',
              url: `https://t.me/${ctx.botInfo?.username || 'unthread_bot'}?start=admin_activate`,
            },
          ],
          [
            {
              text: '❓ Help & Instructions',
              callback_data: `admin_help_activation_${userId}`,
            },
          ],
        ],
      },
    })
  }

  private async performSetupValidation(
    ctx: BotContext,
    sessionId: string,
    dmChatId: number,
    groupChatId: number,
    groupTitle: string,
    messageId: number
  ): Promise<void> {
    try {
      // Clean Code: Delegate complex validation logic to dedicated service
      const validationResult = await ValidationService.performSetupValidation(
        ctx,
        groupChatId,
        groupTitle
      )

      if (validationResult.allPassed) {
        // Update session and proceed to customer setup
        await BotsStore.updateDmSetupSession(sessionId, {
          currentStep: 'validation_passed',
          stepData: { validationResults: validationResult.checks },
        })

        await this.proceedToCustomerSetup(
          ctx,
          sessionId,
          dmChatId,
          groupChatId,
          groupTitle,
          messageId
        )
      } else {
        await ctx.telegram.editMessageText(
          dmChatId,
          messageId,
          undefined,
          validationResult.message,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🔄 Retry Validation',
                    callback_data: `setup_retry_validation_${sessionId}`,
                  },
                ],
                [
                  {
                    text: '❌ Cancel Setup',
                    callback_data: `setup_cancel_${sessionId}`,
                  },
                ],
              ],
            },
          }
        )
      }
    } catch (error) {
      logError(error, 'SetupCommand.performSetupValidation', {
        sessionId,
        groupChatId,
      })
      await ctx.telegram.editMessageText(
        dmChatId,
        messageId,
        undefined,
        '❌ **Validation Error**\n\n' +
          'Failed to validate setup requirements. Please try again.',
        { parse_mode: 'Markdown' }
      )
    }
  }

  private async proceedToCustomerSetup(
    ctx: BotContext,
    sessionId: string,
    dmChatId: number,
    groupChatId: number,
    groupTitle: string,
    messageId: number
  ): Promise<void> {
    try {
      // Extract suggested customer name from group title using sophisticated partner extraction
      const { generateCustomerName } = await import(
        '../../services/unthread.js'
      )
      const suggestedName = generateCustomerName(groupTitle).replace(
        '[Telegram] ',
        ''
      )

      const customerSetupMessage =
        '👥 **Customer Setup**\n\n' +
        `**Group:** ${groupTitle}\n\n` +
        "I'll help you link this group to a customer for support ticket management.\n\n" +
        `**Suggested Customer Name:**\n\`${suggestedName}\`\n\n` +
        '**Choose an option below:**'

      // Generate short callback IDs to stay within Telegram's 64-byte limit
      const shortSuggestedId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)
      const shortCustomId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)
      const shortExistingId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)
      const shortCancelId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)

      await ctx.telegram.editMessageText(
        dmChatId,
        messageId,
        undefined,
        customerSetupMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `✅ Use "${suggestedName}"`,
                  callback_data: `setup_use_suggested_${shortSuggestedId}`,
                },
              ],
              [
                {
                  text: '✏️ Use Different Name',
                  callback_data: `setup_custom_name_${shortCustomId}`,
                },
                {
                  text: '🔗 Existing Customer ID',
                  callback_data: `setup_existing_customer_${shortExistingId}`,
                },
              ],
              [
                {
                  text: '❌ Cancel Setup',
                  callback_data: `setup_cancel_${shortCancelId}`,
                },
              ],
            ],
          },
        }
      )

      // Update session with customer setup step
      await BotsStore.updateDmSetupSession(sessionId, {
        currentStep: 'customer_setup',
        stepData: {
          suggestedName,
          groupTitle,
          messageId,
        },
      })
    } catch (error) {
      logError(error, 'SetupCommand.proceedToCustomerSetup', {
        sessionId,
        groupChatId,
      })
    }
  }
}

export class TemplatesCommand extends BaseCommand {
  readonly metadata: CommandMetadata = {
    name: 'templates',
    description: 'Manage message templates for notifications',
    usage: '/templates',
    examples: ['/templates - Open template management interface'],
    adminOnly: true,
    privateOnly: true,
  }

  protected async executeCommand(ctx: BotContext): Promise<void> {
    const userId = ctx.from!.id

    try {
      // Check admin activation with enhanced messaging
      const adminProfile = await BotsStore.getAdminProfile(userId)
      if (!adminProfile?.isActivated) {
        await this.handleTemplateAdminNotActivated(ctx)
        return
      }

      await this.showTemplateManager(ctx)
    } catch (error) {
      logError(error, 'TemplatesCommand.executeCommand', { userId })
      await ctx.reply(createUserErrorMessage(error))
    }
  }

  private async showTemplateManager(ctx: BotContext): Promise<void> {
    try {
      // Get current template statistics
      const templateManager = GlobalTemplateManager.getInstance()
      const templates = await templateManager.getGlobalTemplates()

      // Smart status calculation for user-friendly display
      const templateEntries = Object.entries(templates.templates)
      const customizedTemplates = templateEntries.filter(
        ([_, template]) => template.lastModifiedBy && template.lastModifiedAt
      )
      const totalTemplates = templateEntries.length
      const customizedCount = customizedTemplates.length

      // Generate status message based on customization state
      let statusMessage: string
      let activityInfo: string

      if (customizedCount === 0) {
        statusMessage = 'Using default templates'
        activityInfo = 'Never modified'
      } else if (customizedCount === totalTemplates) {
        statusMessage = 'All templates customized'
        const lastModified = new Date(
          templates.lastUpdated
        ).toLocaleDateString()
        activityInfo = `Last modified: ${lastModified}`
      } else {
        statusMessage = `${customizedCount} of ${totalTemplates} templates customized`
        const lastModified = new Date(
          templates.lastUpdated
        ).toLocaleDateString()
        activityInfo = `Last modified: ${lastModified}`
      }

      // Generate individual template status indicators
      const getTemplateStatus = (template: GlobalTemplate): string => {
        if (!template.lastModifiedBy || !template.lastModifiedAt) {
          return '📋 Default template'
        }
        const modifiedDate = new Date(
          template.lastModifiedAt
        ).toLocaleDateString()
        return `✏️ Customized (${modifiedDate})`
      }

      const templateMessage =
        '📝 **Message Template Manager**\n\n' +
        'Customize how the bot communicates with your customers.\n\n' +
        `**Current Status:** ${statusMessage}\n` +
        `**Last Activity:** ${activityInfo}\n\n` +
        '**Available Templates:**\n' +
        `• 🎫 **Ticket Created** - ${getTemplateStatus(templates.templates.ticket_created)}\n` +
        `• 👨‍💼 **Agent Response** - ${getTemplateStatus(templates.templates.agent_response)}\n` +
        `• ✅ **Ticket Status** - ${getTemplateStatus(templates.templates.ticket_status)}\n\n` +
        '**Management Options:**'

      await ctx.reply(templateMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎫 Edit Ticket Created',
                callback_data: 'template_edit_ticket_created',
              },
              {
                text: '👨‍💼 Edit Agent Response',
                callback_data: 'template_edit_agent_response',
              },
            ],
            [
              {
                text: '✅ Edit Ticket Status',
                callback_data: 'template_edit_ticket_status',
              },
              {
                text: '📊 Template Preview',
                callback_data: 'template_preview_all',
              },
            ],
            [
              {
                text: '🔄 Reset to Defaults',
                callback_data: 'template_reset_confirm',
              },
            ],
            [{ text: '❌ Close', callback_data: 'template_close' }],
          ],
        },
      })
    } catch (error) {
      logError(error, 'TemplatesCommand.showTemplateManager')

      // Fallback to basic interface
      const fallbackMessage =
        '📝 **Message Template Manager**\n\n' +
        'Template management interface is being prepared.\n\n' +
        'For now, templates are using sensible defaults that work great!\n\n' +
        '*Full customization interface coming soon.*'

      await ctx.reply(fallbackMessage, { parse_mode: 'Markdown' })
    }
  }

  private async handleTemplateAdminNotActivated(
    ctx: BotContext
  ): Promise<void> {
    const firstName = ctx.from?.first_name || 'Admin'

    const activationMessage =
      '🔒 **Admin Activation Required**\n\n' +
      `Hello ${firstName}! To manage message templates, you need to activate your admin privileges first.\n\n` +
      '**Quick Steps:**\n' +
      '1. **Start a private chat** with me\n' +
      '2. Send `/activate` command in our DM\n' +
      '3. Return and use `/templates` again\n\n' +
      "**What You'll Get:**\n" +
      '• Full template management access\n' +
      '• Customizable message templates\n' +
      '• Admin notification preferences\n' +
      '• Secure configuration channel\n\n' +
      '**Ready to activate?** Click below to start:'

    await ctx.reply(activationMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Activate Admin Access',
              url: `https://t.me/${ctx.botInfo?.username || 'unthread_bot'}?start=admin_activate`,
            },
          ],
        ],
      },
    })
  }
}
