/**
 * Callback Query Processors
 *
 * Handles inline button callbacks for various bot flows
 * following Clean Code principles and single responsibility.
 *
 * @author Waren Gonzaga, WG Technology Labs
 */

import type { ICallbackProcessor } from '../base/BaseCommand.js'
import type { BotContext } from '../../types/index.js'
import type { DmSetupSession } from '../../sdk/types.js'
import { logError } from '../utils/errorHandler.js'
import { LogEngine } from '@wgtechlabs/log-engine'
import { BotsStore } from '../../sdk/bots-brain/index.js'
import * as unthreadService from '../../services/unthread.js'

// Clean Code: Extract constants to avoid magic strings and numbers
const CALLBACK_CONSTANTS = {
  SESSION: {
    EXPIRY_EXTENSION_MINUTES: 30, // Increased from 15 to 30 minutes for better UX
    MAX_CACHED_MAPPINGS: 100,
  },
  TEMPLATE_CODES: {
    TICKET_CREATED: 'tc',
    AGENT_RESPONSE: 'ar',
    TICKET_STATUS: 'ts',
  },
  TEMPLATE_TYPES: {
    tc: 'ticket_created',
    ar: 'agent_response',
    ts: 'ticket_status',
  },
} as const

/**
 * Support Callback Processor
 * Handles callbacks related to support ticket creation
 */
export class SupportCallbackProcessor implements ICallbackProcessor {
  canHandle(callbackData: string): boolean {
    return callbackData.startsWith('support_')
  }

  async process(ctx: BotContext, callbackData: string): Promise<boolean> {
    const action = callbackData.replace('support_', '')

    try {
      switch (action) {
        case 'continue':
          return await this.handleContinue(ctx)
        case 'restart':
          return await this.handleRestart(ctx)
        case 'cancel':
          return await this.handleCancel(ctx)
        case 'create_new':
          return await this.handleCreateNew(ctx)
        default:
          return false
      }
    } catch (error) {
      logError(error, 'SupportCallbackProcessor.process', {
        action,
        userId: ctx.from?.id,
      })
      await ctx.answerCbQuery('❌ An error occurred. Please try again.')
      return true
    }
  }

  private async handleContinue(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('✅ Continuing support form...')

    const userId = ctx.from?.id
    if (!userId) return false

    const userState = await BotsStore.getUserState(userId)
    if (!userState) {
      await ctx.editMessageText(
        '❌ **No Active Session**\n\nNo active support session found. Use `/support` to start a new ticket.',
        { parse_mode: 'Markdown' }
      )
      return true
    }

    const stepText =
      userState.field === 'summary'
        ? 'Please describe your issue:'
        : 'Please provide your email address:'

    const placeholder =
      userState.field === 'summary'
        ? 'Describe your issue...'
        : 'your@email.com'

    await ctx.editMessageText(
      `🎫 **Continue Support Ticket**\n\n` +
        `**Step ${userState.step} of ${userState.totalSteps}:** ${stepText}\n\n` +
        '*Type your response below:*',
      { parse_mode: 'Markdown' }
    )
    return true
  }

  /**
   * Shared logic for initializing support ticket flow
   */
  private async initializeSupportFlow(
    ctx: BotContext,
    options: {
      title: string
      emoji: string
      stepDescription: string
    }
  ): Promise<boolean> {
    const userId = ctx.from?.id
    if (!userId) return false

    // Clear existing state
    await BotsStore.clearUserState(userId)

    // Check if user has email
    const userData = await unthreadService.getOrCreateUser(
      userId,
      ctx.from?.username
    )
    const hasEmail = userData?.email

    // Set new state
    await BotsStore.setUserState(userId, {
      field: 'summary',
      step: 1,
      totalSteps: hasEmail ? 1 : 2,
      hasEmail: !!hasEmail,
      chatId: ctx.chat!.id,
      startedAt: new Date().toISOString(),
    })

    await ctx.editMessageText(
      `${options.emoji} **${options.title}**\n\n` +
        `**Step 1 of ${hasEmail ? 1 : 2}:** ${options.stepDescription}\n\n` +
        '*Type your message below:*',
      { parse_mode: 'Markdown' }
    )
    return true
  }

  private async handleRestart(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('🔄 Restarting support form...')

    return await this.initializeSupportFlow(ctx, {
      title: 'Support Ticket Restarted',
      emoji: '🔄',
      stepDescription: 'Please describe your issue.',
    })
  }

  private async handleCancel(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('❌ Support form cancelled')

    const userId = ctx.from?.id
    if (!userId) return false

    // Clear user state
    await BotsStore.clearUserState(userId)

    await ctx.editMessageText(
      `❌ **Support Ticket Cancelled**\n\n` +
        'Your support ticket creation has been cancelled. No ticket was created.\n\n' +
        'Use `/support` anytime to create a new support ticket.',
      { parse_mode: 'Markdown' }
    )
    return true
  }

  private async handleCreateNew(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('🎫 Creating new ticket...')

    return await this.initializeSupportFlow(ctx, {
      title: 'Create New Support Ticket',
      emoji: '🎫',
      stepDescription: 'Please describe your issue or question.',
    })
  }
}

/**
 * Setup Callback Processor
 * Handles callbacks related to DM-based group setup flow
 */
export class SetupCallbackProcessor implements ICallbackProcessor {
  // Callback ID mapping to handle Telegram's 64-byte limit
  private static callbackSessionMap = new Map<string, string>()
  private static callbackIdCounter = 1

  canHandle(callbackData: string): boolean {
    return (
      callbackData.startsWith('setup_') ||
      callbackData.startsWith('dmsetup_') ||
      callbackData.startsWith('template_edit_') ||
      callbackData.startsWith('template_start_edit_') ||
      callbackData.startsWith('template_cancel_edit_')
    )
  }

  // Helper function to convert template types to short codes for callback data
  private getTemplateShortCode(templateType: string): string {
    // Clean Code: Use constants instead of magic strings
    return (
      CALLBACK_CONSTANTS.TEMPLATE_CODES[
        templateType as keyof typeof CALLBACK_CONSTANTS.TEMPLATE_CODES
      ] || templateType
    )
  }

  // Helper function to convert short codes back to template types
  private getTemplateTypeFromCode(shortCode: string): string | undefined {
    return CALLBACK_CONSTANTS.TEMPLATE_TYPES[
      shortCode as keyof typeof CALLBACK_CONSTANTS.TEMPLATE_TYPES
    ]
  }

  /**
   * Generate a short callback ID for long session IDs to work within Telegram's 64-byte limit
   */
  public static generateShortCallbackId(sessionId: string): string {
    // Check if we already have a mapping for this session
    for (const [
      shortId,
      fullId,
    ] of SetupCallbackProcessor.callbackSessionMap.entries()) {
      if (fullId === sessionId) {
        return shortId
      }
    }

    // Generate new short ID
    const shortId = `cb${SetupCallbackProcessor.callbackIdCounter++}`
    SetupCallbackProcessor.callbackSessionMap.set(shortId, sessionId)

    // Clean up old mappings (keep only last 100)
    if (
      SetupCallbackProcessor.callbackSessionMap.size >
      CALLBACK_CONSTANTS.SESSION.MAX_CACHED_MAPPINGS
    ) {
      const firstKey = SetupCallbackProcessor.callbackSessionMap
        .keys()
        .next().value
      if (firstKey) {
        SetupCallbackProcessor.callbackSessionMap.delete(firstKey)
      }
    }

    return shortId
  }

  /**
   * Resolve short callback ID back to full session ID
   */
  private static resolveCallbackId(shortId: string): string | undefined {
    return SetupCallbackProcessor.callbackSessionMap.get(shortId)
  }

  /**
   * Extract session ID from callback data parts based on action type
   */
  private extractSessionId(action: string, parts: string[]): string {
    if (action === 'existing' && parts[2] === 'customer') {
      // Format: setup_existing_customer_setup_chatId_timestamp
      return parts.slice(3).join('_')
    } else if (action === 'customize' && parts[2] === 'templates') {
      // Format: setup_customize_templates_[shortId OR setup_chatId_timestamp]
      return parts.slice(3).join('_')
    } else if (action === 'use' && parts[2] === 'defaults') {
      // Format: setup_use_defaults_[shortId OR setup_chatId_timestamp]
      return parts.slice(3).join('_')
    } else if (action === 'use' && parts[2] === 'suggested') {
      // Format: setup_use_suggested_[sessionId]
      return parts.slice(3).join('_')
    } else if (action === 'template' && parts[2] === 'info') {
      // Format: setup_template_info_[shortId OR setup_chatId_timestamp]
      return parts.slice(3).join('_')
    } else if (
      action === 'back' &&
      parts[2] === 'to' &&
      parts[3] === 'completion'
    ) {
      // Format: setup_back_to_completion_[shortId OR setup_chatId_timestamp]
      return parts.slice(4).join('_')
    } else if (
      action === 'back' &&
      parts[2] === 'to' &&
      parts[3] === 'customer' &&
      parts[4] === 'selection'
    ) {
      // Format: setup_back_to_customer_selection_[sessionId]
      return parts.slice(5).join('_')
    } else if (action === 'finish' && parts[2] === 'custom') {
      // Format: setup_finish_custom_[shortId OR setup_chatId_timestamp]
      return parts.slice(3).join('_')
    } else {
      // Standard format: session ID is the last part
      return parts[parts.length - 1] || ''
    }
  }

  async process(ctx: BotContext, callbackData: string): Promise<boolean> {
    try {
      // Handle dmsetup_ prefixed callbacks
      if (callbackData.startsWith('dmsetup_')) {
        const parts = callbackData.split('_')
        const action = parts[1]
        const sessionId = parts[parts.length - 1]

        if (!sessionId) {
          await ctx.answerCbQuery('❌ Invalid setup session.')
          return true
        }

        if (action === 'cancel') {
          return await this.handleCancel(ctx, sessionId)
        }

        return false
      }

      // Handle template_edit_ prefixed callbacks (shortened for callback data limits)
      if (callbackData.startsWith('template_edit_')) {
        const parts = callbackData.split('_')
        // Use short codes: tc=ticket_created, ar=agent_response, ts=ticket_status
        const shortCode = parts[2] // tc, ar, or ts
        const shortCallbackId = parts[3] // Short callback ID

        // Ensure we have the shortCallbackId
        if (!shortCallbackId) {
          await ctx.answerCbQuery('❌ Invalid callback format.')
          return true
        }

        // Resolve short callback ID to full session ID
        const sessionId =
          SetupCallbackProcessor.resolveCallbackId(shortCallbackId)
        if (!sessionId) {
          await ctx.answerCbQuery(
            '❌ Session expired. Please start setup again.'
          )
          return true
        }

        // Clean Code: Use helper method instead of duplicated mapping
        const templateType = shortCode
          ? this.getTemplateTypeFromCode(shortCode)
          : undefined
        if (!templateType) {
          await ctx.answerCbQuery('❌ Invalid template edit request.')
          return true
        }

        return await this.handleTemplateEdit(ctx, sessionId, templateType)
      }

      // Handle template_start_edit_ prefixed callbacks (shortened)
      if (callbackData.startsWith('template_start_edit_')) {
        const parts = callbackData.split('_')
        // Format: template_start_edit_shortCode_shortCallbackId
        const shortCode = parts[3] // tc, ar, or ts
        const shortCallbackId = parts[4] // Short callback ID

        // Ensure we have the shortCallbackId
        if (!shortCallbackId) {
          await ctx.answerCbQuery('❌ Invalid callback format.')
          return true
        }

        // Resolve short callback ID to full session ID
        const sessionId =
          SetupCallbackProcessor.resolveCallbackId(shortCallbackId)
        if (!sessionId) {
          await ctx.answerCbQuery(
            '❌ Session expired. Please start setup again.'
          )
          return true
        }

        // Clean Code: Use helper method instead of duplicated mapping
        const templateType = shortCode
          ? this.getTemplateTypeFromCode(shortCode)
          : undefined
        if (!templateType) {
          await ctx.answerCbQuery('❌ Invalid template edit request.')
          return true
        }

        return await this.handleTemplateStartEdit(ctx, sessionId, templateType)
      }

      // Handle template_cancel_edit_ prefixed callbacks (shortened)
      if (callbackData.startsWith('template_cancel_edit_')) {
        const parts = callbackData.split('_')
        // Format: template_cancel_edit_shortCode_shortCallbackId
        const shortCode = parts[3] // tc, ar, or ts
        const shortCallbackId = parts[4] // Short callback ID

        // Ensure we have the shortCallbackId
        if (!shortCallbackId) {
          await ctx.answerCbQuery('❌ Invalid callback format.')
          return true
        }

        // Resolve short callback ID to full session ID
        const sessionId =
          SetupCallbackProcessor.resolveCallbackId(shortCallbackId)
        if (!sessionId) {
          await ctx.answerCbQuery(
            '❌ Session expired. Please start setup again.'
          )
          return true
        }

        // Clean Code: Use helper method instead of duplicated mapping
        const templateType = shortCode
          ? this.getTemplateTypeFromCode(shortCode)
          : undefined
        if (!templateType) {
          await ctx.answerCbQuery('❌ Invalid template cancel request.')
          return true
        }

        return await this.handleTemplateCancelEdit(ctx, sessionId, templateType)
      }

      // Handle setup_ prefixed callbacks
      const parts = callbackData.split('_')
      const action = parts[1] || ''

      // Extract session ID using dedicated method
      const rawSessionId = this.extractSessionId(action, parts)

      // Check if this is a short callback ID (starts with 'cb') that needs resolution
      let sessionId: string
      if (rawSessionId.startsWith('cb') && /^cb\d+$/.test(rawSessionId)) {
        sessionId = SetupCallbackProcessor.resolveCallbackId(rawSessionId) || ''
        if (!sessionId) {
          await ctx.answerCbQuery(
            '❌ Session expired. Please start setup again.'
          )
          return true
        }
      } else {
        sessionId = rawSessionId
      }

      // Session ID resolution complete - ready for processing

      if (!sessionId) {
        await ctx.answerCbQuery('❌ Invalid setup session.')
        return true
      }

      switch (action) {
        case 'retry':
          if (parts[2] === 'validation') {
            return await this.handleRetryValidation(ctx, sessionId)
          }
          break
        case 'use':
          if (parts[2] === 'suggested') {
            return await this.handleUseSuggested(ctx, sessionId)
          } else if (parts[2] === 'defaults') {
            return await this.handleUseDefaultTemplates(ctx, sessionId)
          }
          break
        case 'customize':
          if (parts[2] === 'templates') {
            return await this.handleCustomizeTemplates(ctx, sessionId)
          }
          break
        case 'template':
          if (parts[2] === 'info') {
            return await this.handleTemplateInfo(ctx, sessionId)
          }
          break
        case 'back':
          if (parts[2] === 'to' && parts[3] === 'completion') {
            return await this.handleBackToCompletion(ctx, sessionId)
          } else if (
            parts[2] === 'to' &&
            parts[3] === 'customer' &&
            parts[4] === 'selection'
          ) {
            return await this.handleBackToCustomerSelection(ctx, sessionId)
          }
          break
        case 'custom':
          if (parts[2] === 'name') {
            return await this.handleCustomName(ctx, sessionId)
          }
          break
        case 'existing':
          if (parts[2] === 'customer') {
            return await this.handleExistingCustomer(ctx, sessionId)
          }
          break
        case 'finish':
          if (parts[2] === 'custom') {
            return await this.handleFinishCustomSetup(ctx, sessionId)
          }
          break
        case 'cancel':
          return await this.handleCancel(ctx, sessionId)
        default:
          return false
      }
      return false
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.process', {
        callbackData,
        userId: ctx.from?.id,
      })
      await ctx.answerCbQuery('❌ An error occurred. Please try again.')
      return true
    }
  }

  private async handleRetryValidation(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('🔄 Retrying validation...')

    try {
      // Import here to avoid circular dependencies
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Re-run validation
      const validationMessage =
        '⏳ **Re-running Validation**\n\nPlease wait while I check the setup requirements again...'
      await ctx.editMessageText(validationMessage)

      // Note: In production, you'd extract validation to a shared service
      await this.performSetupValidation(
        ctx,
        sessionId,
        session.groupChatId,
        session.groupChatName
      )

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleRetryValidation', {
        sessionId,
      })
      await ctx.editMessageText(
        '❌ Failed to retry validation. Please start over.'
      )
      return true
    }
  }

  private async handleUseSuggested(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('✅ Using suggested name...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session not found. Please start over with `/setup` in the group.'
        )
        return true
      }

      if (!session.stepData?.suggestedName) {
        await ctx.editMessageText(
          '❌ Setup session missing customer name. Please start over with `/setup` in the group.'
        )
        return true
      }

      const customerName = session.stepData.suggestedName

      // Create customer and complete setup
      await this.completeCustomerSetup(ctx, sessionId, customerName, session)

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleUseSuggested', {
        sessionId,
      })
      await ctx.answerCbQuery('❌ Failed to create customer. Please try again.')
      return true
    }
  }

  private async handleCustomName(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('✏️ Enter custom name...')

    // First, extend session expiry before any operations to prevent expiration
    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')

      // Get current session and extend expiry immediately
      const currentSession = await BotsStore.getDmSetupSession(sessionId)
      if (!currentSession) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Extend session expiry to 30 minutes from now
      const now = new Date()
      const extendedExpiresAt = new Date(
        now.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )

      const updateResult = await BotsStore.updateDmSetupSession(sessionId, {
        expiresAt: extendedExpiresAt.toISOString(),
        currentStep: 'awaiting_custom_name',
      })

      // Verify the update with multiple attempts if needed
      let verifySession = await BotsStore.getDmSetupSession(sessionId)
      let attemptCount = 1

      // Retry verification up to 3 times if step update failed
      while (
        verifySession?.currentStep !== 'awaiting_custom_name' &&
        attemptCount <= 3
      ) {
        // Wait 100ms and retry
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Try updating again
        await BotsStore.updateDmSetupSession(sessionId, {
          currentStep: 'awaiting_custom_name',
        })

        verifySession = await BotsStore.getDmSetupSession(sessionId)
        attemptCount++
      }

      if (verifySession?.currentStep !== 'awaiting_custom_name') {
        logError(
          `Critical: Session step update failed after retries`,
          'Error',
          {
            sessionId,
            finalStep: verifySession?.currentStep,
            expectedStep: 'awaiting_custom_name',
          }
        )
      }
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleCustomName.sessionUpdate', {
        sessionId,
      })
    }

    // Generate short callback IDs to stay within Telegram's 64-byte limit
    const shortBackId =
      SetupCallbackProcessor.generateShortCallbackId(sessionId)
    const shortCancelId =
      SetupCallbackProcessor.generateShortCallbackId(sessionId)

    await ctx.editMessageText(
      `✏️ **Custom Customer Name**

Please type the customer name you'd like to use:

*(Type your customer name and I'll set it up)*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '⬅️ Back to Options',
                callback_data: `setup_back_to_customer_selection_${shortBackId}`,
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

    return true
  }

  private async handleExistingCustomer(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('🔗 Link existing customer...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')

      // Get current session and extend expiry immediately
      const session = await BotsStore.getDmSetupSession(sessionId)
      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Extend session expiry to 30 minutes from now
      const now = new Date()
      const extendedExpiresAt = new Date(
        now.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )

      // Update session to expect customer ID input and extend expiry
      await BotsStore.updateDmSetupSession(sessionId, {
        currentStep: 'awaiting_customer_id',
        expiresAt: extendedExpiresAt.toISOString(),
      })

      // Verify the update
      const verifySession = await BotsStore.getDmSetupSession(sessionId)

      // Generate short callback IDs to stay within Telegram's 64-byte limit
      const shortBackId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)
      const shortCancelId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)

      const customerIdMsg = await ctx.editMessageText(
        `🔗 **Enter Existing Customer ID**

Group: ${session.groupChatName || 'Unknown Group'}

Please type the existing customer ID you'd like to link to this group.

**Guidelines:**
• Enter the exact Customer ID from Unthread
• The customer ID will be validated before linking
• Customer must exist in your Unthread workspace

**Example:** ee19d165-a170-4261-8a4b-569c6a1bbcb7`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '⬅️ Back to Options',
                  callback_data: `setup_back_to_customer_selection_${shortBackId}`,
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

      // Track this message for cleanup when input is successful
      const messageIds = session.messageIds || []
      if (
        customerIdMsg &&
        typeof customerIdMsg === 'object' &&
        'message_id' in customerIdMsg
      ) {
        messageIds.push(customerIdMsg.message_id)
        await BotsStore.updateDmSetupSession(sessionId, { messageIds })
      }

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleExistingCustomer', {
        sessionId,
      })
      await ctx.editMessageText(
        '❌ An error occurred. Please try again with /setup'
      )
      return true
    }
  }

  private async handleCancel(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('❌ Setup cancelled')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      await BotsStore.deleteDmSetupSession(sessionId)

      await ctx.editMessageText(
        `❌ **Setup Cancelled**

Group setup has been cancelled. You can start over anytime by using \`/setup\` in the group chat.`
      )

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleCancel', { sessionId })
      await ctx.editMessageText('❌ Setup cancelled.')
      return true
    }
  }

  /**
   * Create a new customer via Unthread API and store locally
   */
  private async createNewCustomer(
    customerName: string,
    session: DmSetupSession,
    sessionId: string
  ): Promise<{ customerId: string; finalCustomerName: string }> {
    if (!customerName) {
      throw new Error('Customer name is required for new customer creation')
    }

    try {
      // Import and use the proper Unthread service to create customer
      const { createCustomerWithName } = await import(
        '../../services/unthread.js'
      )
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const createdCustomer = await createCustomerWithName(customerName)

      const customerId = createdCustomer.id // Use the real UUID from Unthread
      const finalCustomerName = createdCustomer.name || customerName

      // Create customer record in local storage
      const customerData = {
        id: customerId,
        unthreadCustomerId: customerId,
        telegramChatId: session.groupChatId,
        chatId: session.groupChatId,
        chatTitle: session.groupChatName,
        customerName: finalCustomerName,
        name: finalCustomerName,
        company: finalCustomerName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await BotsStore.storeCustomer(customerData)

      return { customerId, finalCustomerName }
    } catch (apiError) {
      logError(apiError, 'CallbackProcessors.createNewCustomer', {
        customerName,
        sessionId,
      })

      // Fail fast - do not generate fake data
      throw new Error(
        `Failed to create customer via Unthread API: ${(apiError as Error).message}`
      )
    }
  }

  /**
   * Link to existing customer and validate
   */
  private async linkExistingCustomer(
    existingCustomerId: string
  ): Promise<{ customerId: string; finalCustomerName: string }> {
    try {
      // Import and use validateCustomerExists to get the actual customer name
      const { validateCustomerExists } = await import(
        '../../services/unthread.js'
      )
      const validationResult = await validateCustomerExists(existingCustomerId)

      if (validationResult.exists && validationResult.customer?.name) {
        return {
          customerId: existingCustomerId,
          finalCustomerName: validationResult.customer.name,
        }
      } else {
        // Fail fast - don't generate fake names
        throw new Error(
          `Customer validation failed: Customer ID ${existingCustomerId} not found or has no name`
        )
      }
    } catch (error) {
      logError(error, 'CallbackProcessors.linkExistingCustomer', {
        existingCustomerId,
      })
      // Fail fast - don't generate fake names
      throw new Error(`Customer validation failed: ${(error as Error).message}`)
    }
  }

  /**
   * Create group configuration
   */
  private async createGroupConfiguration(
    session: DmSetupSession,
    customerId: string,
    finalCustomerName: string,
    sessionId: string,
    isExistingCustomer: boolean
  ): Promise<void> {
    const { BotsStore } = await import('../../sdk/bots-brain/index.js')

    const groupConfig = {
      chatId: session.groupChatId,
      chatTitle: session.groupChatName,
      isConfigured: true,
      customerId,
      customerName: finalCustomerName,
      setupBy: session.adminId,
      setupAt: new Date().toISOString(),
      botIsAdmin: true,
      lastAdminCheck: new Date().toISOString(),
      setupVersion: '2.0',
      metadata: {
        setupSessionId: sessionId,
        isExistingCustomer,
      },
    }

    await BotsStore.storeGroupConfig(groupConfig)

    // Complete the setup
    await BotsStore.updateDmSetupSession(sessionId, {
      status: 'completed',
      currentStep: 'completed',
    })
  }

  /**
   * Send completion message with template options
   */
  private async sendCompletionMessage(
    ctx: BotContext,
    sessionId: string,
    session: DmSetupSession,
    customerId: string,
    finalCustomerName: string,
    isExistingCustomer: boolean
  ): Promise<void> {
    const setupType = isExistingCustomer
      ? 'Linked to Existing Customer'
      : 'New Customer Created'
    const successMessage = `🎉 **Setup Complete!**

**${setupType}**
**Customer:** ${finalCustomerName}
**Group:** ${session.groupChatName}
**Customer ID:** \`${customerId}\`

✅ **What's configured:**
• Group linked to customer account
• Support ticket system enabled
• Bot admin permissions verified

📝 **Template Configuration** (Optional)

Choose how you'd like to handle message templates:`

    // Generate short callback ID for this session
    const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId)

    try {
      await ctx.editMessageText(successMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Finish Setup',
                callback_data: `setup_use_defaults_${shortId}`,
              },
              {
                text: '🎨 Customize Templates',
                callback_data: `setup_customize_templates_${shortId}`,
              },
            ],
          ],
        },
      })
    } catch (editError) {
      // If edit fails (e.g., message too old or from text input), send a new message
      await ctx.reply(successMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Finish Setup',
                callback_data: `setup_use_defaults_${shortId}`,
              },
              {
                text: '🎨 Customize Templates',
                callback_data: `setup_customize_templates_${shortId}`,
              },
            ],
          ],
        },
      })
    }
  }

  public async completeCustomerSetup(
    ctx: BotContext,
    sessionId: string,
    customerName: string | null,
    session: DmSetupSession,
    existingCustomerId?: string
  ): Promise<void> {
    try {
      let customerId: string
      let finalCustomerName: string
      let isExistingCustomer = false

      // Step 1: Handle customer creation or linking
      if (existingCustomerId) {
        // Link to existing customer
        isExistingCustomer = true
        const result = await this.linkExistingCustomer(existingCustomerId)
        customerId = result.customerId
        finalCustomerName = result.finalCustomerName
      } else {
        // Create new customer
        const result = await this.createNewCustomer(
          customerName!,
          session,
          sessionId
        )
        customerId = result.customerId
        finalCustomerName = result.finalCustomerName
      }

      // Step 2: Create group configuration
      await this.createGroupConfiguration(
        session,
        customerId,
        finalCustomerName,
        sessionId,
        isExistingCustomer
      )

      // Step 3: Send completion message
      await this.sendCompletionMessage(
        ctx,
        sessionId,
        session,
        customerId,
        finalCustomerName,
        isExistingCustomer
      )
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.completeCustomerSetup', {
        sessionId,
        customerName,
        existingCustomerId,
      })

      try {
        await ctx.editMessageText(`❌ **Setup Failed**

Failed to complete customer setup. Please try again.`)
      } catch (editError) {
        // If edit fails, send a new message
        await ctx.reply(`❌ **Setup Failed**

Failed to complete customer setup. Please try again.`)
      }
    }
  }

  /**
   * Handle using default templates during setup
   */
  private async handleUseDefaultTemplates(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('✅ Finishing setup with default templates...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )

      const session = await BotsStore.getDmSetupSession(sessionId)
      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Initialize default templates for the group
      const templateManager = GlobalTemplateManager.getInstance()
      await templateManager.initializeDefaultTemplates(session.groupChatId)

      // Complete setup with defaults
      await this.finalizeSetupWithDefaults(ctx, sessionId, session)

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleUseDefaultTemplates', {
        sessionId,
      })
      await ctx.answerCbQuery(
        '❌ Failed to set up default templates. Please try again.'
      )
      return true
    }
  }

  /**
   * Handle customizing templates during setup
   */
  private async handleCustomizeTemplates(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('🎨 Opening template customization...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        LogEngine.warn('Session not found during template customization', {
          sessionId,
          userId: ctx.from?.id,
          context: 'handleCustomizeTemplates',
        })
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      LogEngine.info('Session found for template customization', {
        sessionId,
        currentExpiresAt: session.expiresAt,
        currentStep: session.currentStep,
        userId: ctx.from?.id,
      })

      // Extend session expiration to give user more time for template customization
      const now = new Date()
      const currentExpiry = new Date(session.expiresAt)

      // Extend to 15 minutes from now, or add 15 minutes to current expiry, whichever is later
      const newExpiryFromNow = new Date(
        now.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )
      const newExpiryFromCurrent = new Date(
        currentExpiry.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )
      const extendedExpiresAt =
        newExpiryFromNow > newExpiryFromCurrent
          ? newExpiryFromNow
          : newExpiryFromCurrent

      LogEngine.info(
        'Extending session expiration for template customization',
        {
          sessionId,
          currentTime: now.toISOString(),
          currentExpiry: session.expiresAt,
          newExpiryFromNow: newExpiryFromNow.toISOString(),
          newExpiryFromCurrent: newExpiryFromCurrent.toISOString(),
          finalExpiry: extendedExpiresAt.toISOString(),
          extensionMinutes: CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES,
        }
      )

      const updateResult = await BotsStore.updateDmSetupSession(sessionId, {
        expiresAt: extendedExpiresAt.toISOString(),
      })

      LogEngine.info('Session update completed', {
        sessionId,
        updateResult,
        newExpiresAt: extendedExpiresAt.toISOString(),
      })

      // Show template customization interface
      await this.showTemplateCustomization(ctx, sessionId, session)

      return true
    } catch (error) {
      LogEngine.error('Error in handleCustomizeTemplates', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        sessionId,
        userId: ctx.from?.id,
        context: 'handleCustomizeTemplates',
      })
      logError(error, 'SetupCallbackProcessor.handleCustomizeTemplates', {
        sessionId,
      })
      await ctx.answerCbQuery(
        '❌ Failed to open template customization. Please try again.'
      )
      return true
    }
  }

  /**
   * Handle showing template information during setup
   */
  private async handleTemplateInfo(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('ℹ️ Loading template information...')

    const infoMessage = `📝 **About Message Templates**

Templates control how the bot communicates with users and admins.

**🚀 Default Templates:**
• Pre-configured and ready to use
• Professional and friendly tone
• Can be customized later via \`/templates\`
• Perfect for quick setup

**🎨 Custom Templates:**
• Immediate personalization
• Match your brand voice
• Preview before saving
• More engaging setup experience

**Available Templates:**
• 🎫 **Ticket Created** - When new support tickets are created
• 👨‍💼 **Agent Response** - When agents reply to tickets
• ✅ **Ticket Closed** - When support tickets are resolved

**💡 Template Variables:**
Templates use dynamic placeholders like:
• \`{{ticketId}}\` - Unique ticket identifier
• \`{{customerName}}\` - Customer name
• \`{{agentName}}\` - Support agent name
• \`{{summary}}\` - Ticket description
• \`{{status}}\` - Current ticket status

**Example Template:**
\`\`\`
🎫 New Ticket: {{summary}}

ID: {{ticketId}}
Customer: {{customerName}}
Status: {{status}}

We'll respond soon!
\`\`\`

Choose your preferred approach:`

    // Generate short callback ID for this session
    const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId)

    await ctx.editMessageText(infoMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Use Defaults',
              callback_data: `setup_use_defaults_${shortId}`,
            },
            {
              text: '🎨 Customize Now',
              callback_data: `setup_customize_templates_${shortId}`,
            },
          ],
          [
            {
              text: '⬅️ Back to Setup',
              callback_data: `setup_back_to_completion_${shortId}`,
            },
          ],
        ],
      },
    })

    return true
  }

  /**
   * Handle returning to setup completion screen
   */
  private async handleBackToCompletion(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('⬅️ Returning to setup...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      const customerName =
        session.stepData?.customerName ||
        session.stepData?.suggestedName ||
        'Unknown'
      const customerId = session.stepData?.customerId || 'Unknown'

      const successMessage = `🎉 **Setup Complete!**

**Customer:** ${customerName}
**Group:** ${session.groupChatName}
**Customer ID:** \`${customerId}\`

✅ **What's configured:**
• Group linked to customer account
• Support ticket system enabled
• Bot admin permissions verified

📝 **Template Configuration** (Optional)

Choose how you'd like to handle message templates:`

      // Generate short callback ID for this session
      const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId)

      await ctx.editMessageText(successMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Finish Setup',
                callback_data: `setup_use_defaults_${shortId}`,
              },
              {
                text: '🎨 Customize Templates',
                callback_data: `setup_customize_templates_${shortId}`,
              },
            ],
          ],
        },
      })

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleBackToCompletion', {
        sessionId,
      })
      await ctx.editMessageText(
        '❌ Failed to return to setup. Please try again.'
      )
      return true
    }
  }

  /**
   * Finalize setup with default templates
   */
  private async finalizeSetupWithDefaults(
    ctx: BotContext,
    sessionId: string,
    session: DmSetupSession
  ): Promise<void> {
    try {
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )

      // Initialize global templates for the group
      const templateManager = GlobalTemplateManager.getInstance()
      await templateManager.initializeDefaultTemplates(session.groupChatId)

      const customerName =
        session.stepData?.customerName ||
        session.stepData?.suggestedName ||
        'Unknown'

      const completionMessage = `✅ **Setup Fully Complete!**

**Customer:** ${customerName}
**Group:** ${session.groupChatName}
**Templates:** Default templates active

🎉 **Your group is ready for support ticket management!**

**Next Steps:**
• Users can now create support tickets
• Templates are ready and working
• Use \`/templates\` anytime to customize
• Check \`/help\` for all commands

*Enjoy your new support system!*`

      await ctx.editMessageText(completionMessage, { parse_mode: 'Markdown' })

      // Send notification to the group chat
      await this.sendGroupSetupNotification(ctx, session)

      // Clean up session after delay
      setTimeout(async () => {
        const { BotsStore } = await import('../../sdk/bots-brain/index.js')
        await BotsStore.deleteDmSetupSession(sessionId)
      }, 60000)
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.finalizeSetupWithDefaults', {
        sessionId,
      })
      await ctx.editMessageText(
        '❌ **Setup Error**\n\nFailed to finalize setup. Please try `/setup` again.'
      )
    }
  }

  /**
   * Handle finishing custom template setup
   */
  private async handleFinishCustomSetup(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('✅ Finishing custom template setup...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Complete setup with custom templates
      await this.finalizeCustomTemplateSetup(ctx, sessionId, session)

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleFinishCustomSetup', {
        sessionId,
      })
      await ctx.answerCbQuery(
        '❌ Failed to finish custom setup. Please try again.'
      )
      return true
    }
  }

  /**
   * Finalize setup with custom templates
   */
  private async finalizeCustomTemplateSetup(
    ctx: BotContext,
    sessionId: string,
    session: DmSetupSession
  ): Promise<void> {
    try {
      const customerName =
        session.stepData?.customerName ||
        session.stepData?.suggestedName ||
        (session.stepData?.existingCustomerId
          ? `Customer ${session.stepData.existingCustomerId.substring(0, 8)}...`
          : 'Unknown')

      const completionMessage = `✅ **Custom Setup Complete!**

**Customer:** ${customerName}
**Group:** ${session.groupChatName}
**Templates:** Custom templates configured

🎉 **Your group is ready for support ticket management!**

**Next Steps:**
• Users can now create support tickets
• Your custom templates are active
• Use \`/templates\` anytime to modify them
• Check \`/help\` for all commands

*Enjoy your personalized support system!*`

      await ctx.editMessageText(completionMessage, { parse_mode: 'Markdown' })

      // Send notification to the group chat
      await this.sendGroupSetupNotification(ctx, session)

      // Clean up session after delay
      setTimeout(async () => {
        const { BotsStore } = await import('../../sdk/bots-brain/index.js')
        await BotsStore.deleteDmSetupSession(sessionId)
      }, 60000)
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.finalizeCustomTemplateSetup', {
        sessionId,
      })
      await ctx.editMessageText(
        '❌ **Setup Error**\n\nFailed to finalize custom setup. Please try `/setup` again.'
      )
    }
  }

  // Enhanced validation method that performs actual validation logic
  private async performSetupValidation(
    ctx: BotContext,
    sessionId: string,
    groupChatId: number,
    groupTitle: string
  ): Promise<void> {
    try {
      // Import and use existing validation service
      const { ValidationService } = await import(
        '../../services/validationService.js'
      )

      // Perform actual setup validation
      const validationResult = await ValidationService.performSetupValidation(
        ctx,
        groupChatId,
        groupTitle
      )

      if (validationResult.allPassed) {
        // Validation passed - continue with setup completion
        await ctx.editMessageText(
          `✅ **Validation Successful**

Group "${groupTitle}" is properly configured and ready for setup completion.

${validationResult.message}

Please proceed with the next step in the setup process.`
        )
      } else {
        // Validation failed - provide specific error information
        const failedChecks = validationResult.checks
          .filter((check) => !check.passed)
          .map((check) => `• ${check.name}: ${check.details}`)
          .join('\n')

        await ctx.editMessageText(
          `❌ **Validation Failed**

${validationResult.message}

**Issues Found:**
${failedChecks}

Please return to the group and run \`/setup\` again after resolving these issues.`
        )
      }
    } catch (error) {
      // Fallback validation logic if service is unavailable
      logError(error, 'SetupCallbackProcessor.performSetupValidation', {
        sessionId,
        groupChatId,
        groupTitle,
      })

      // Basic fallback validation - check if group exists and bot has access
      try {
        const { BotsStore } = await import('../../sdk/bots-brain/index.js')
        const existingConfig = await BotsStore.getGroupConfig(groupChatId)

        if (existingConfig?.isConfigured) {
          await ctx.editMessageText(
            `⚠️ **Setup Already Complete**

This group appears to already be configured. If you're experiencing issues, please contact support.`
          )
        } else {
          await ctx.editMessageText(
            `🔄 **Validation Retry Required**

Unable to complete validation automatically. Please return to the group and run \`/setup\` again to retry the validation process.`
          )
        }
      } catch (fallbackError) {
        // Ultimate fallback
        await ctx.editMessageText(
          `🔄 **Validation Retry Required**

Please return to the group and run \`/setup\` again to retry the validation process.`
        )
      }
    }
  }

  /**
   * Send setup completion notification to the group chat
   */
  private async sendGroupSetupNotification(
    ctx: BotContext,
    session: DmSetupSession
  ): Promise<void> {
    try {
      const customerName =
        session.stepData?.customerName ||
        session.stepData?.suggestedName ||
        (session.stepData?.existingCustomerId
          ? `Customer ${session.stepData.existingCustomerId.substring(0, 8)}...`
          : 'Unknown')

      const groupNotification = `✅ **Setup Complete!**

📋 **This group is now configured for support tickets for ${customerName}.**

🎫 **Members can use** \`/support\` **to create support tickets and get help from our team.**`

      await ctx.telegram.sendMessage(session.groupChatId, groupNotification, {
        parse_mode: 'Markdown',
      })
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.sendGroupSetupNotification', {
        sessionId: session.sessionId,
        groupChatId: session.groupChatId,
      })
    }
  }

  /**
   * Show template customization interface (public method for external access)
   */
  public async showTemplateCustomization(
    ctx: BotContext,
    sessionId: string,
    session: DmSetupSession
  ): Promise<void> {
    try {
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )

      // Get current templates (will be defaults if not set)
      const templateManager = GlobalTemplateManager.getInstance()
      const templates = await templateManager.getGlobalTemplates()

      // Generate short callback ID for this session
      const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId)

      const customizationMessage = `🎨 **Template Customization**

**Group:** ${session.groupChatName}

Choose which template to customize first:

**Available Templates:**
• 🎫 **Ticket Created** - New support ticket notifications
• 👨‍💼 **Agent Response** - When agents reply to tickets  
• ✅ **Ticket Status** - Support ticket resolution messages

💡 **What You Can Customize:**
• Message content and formatting
• Use dynamic variables like \`{{ticketId}}\`, \`{{customerName}}\`
• Add your brand voice and personality
• Include specific instructions or next steps

🔧 **Available Variables:**
Each template has access to relevant data like ticket details, customer info, agent names, and timestamps.

*Click a template below to see all available variables and current content:*`

      await ctx.reply(customizationMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎫 Ticket Created',
                callback_data: `template_edit_tc_${shortId}`,
              },
            ],
            [
              {
                text: '👨‍💼 Agent Response',
                callback_data: `template_edit_ar_${shortId}`,
              },
            ],
            [
              {
                text: '✅ Ticket Status',
                callback_data: `template_edit_ts_${shortId}`,
              },
              {
                text: 'ℹ️ Learn About Templates',
                callback_data: `setup_template_info_${shortId}`,
              },
            ],
            [
              {
                text: '🚀 Use Defaults Instead',
                callback_data: `setup_use_defaults_${shortId}`,
              },
              {
                text: '✅ Finish Setup',
                callback_data: `setup_finish_custom_${shortId}`,
              },
            ],
          ],
        },
      })
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.showTemplateCustomization', {
        sessionId,
      })
      await ctx.reply(
        '❌ Failed to load template customization. Using defaults instead...'
      )
      await this.handleUseDefaultTemplates(ctx, sessionId)
    }
  }

  /**
   * Handle template editing during setup
   */
  private async handleTemplateEdit(
    ctx: BotContext,
    sessionId: string,
    templateType: string
  ): Promise<boolean> {
    await ctx.answerCbQuery(
      `✏️ Editing ${templateType.replace('_', ' ')} template...`
    )

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Extend session expiration for template editing
      const now = new Date()
      const currentExpiry = new Date(session.expiresAt)

      // Extend to 15 minutes from now, or add 15 minutes to current expiry, whichever is later
      const newExpiryFromNow = new Date(
        now.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )
      const newExpiryFromCurrent = new Date(
        currentExpiry.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )
      const extendedExpiresAt =
        newExpiryFromNow > newExpiryFromCurrent
          ? newExpiryFromNow
          : newExpiryFromCurrent

      LogEngine.info('Extending session expiration for template editing', {
        sessionId,
        templateType,
        currentTime: now.toISOString(),
        currentExpiry: session.expiresAt,
        finalExpiry: extendedExpiresAt.toISOString(),
      })

      await BotsStore.updateDmSetupSession(sessionId, {
        expiresAt: extendedExpiresAt.toISOString(),
      })

      // Get current template content and available variables
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )
      const templateManager = GlobalTemplateManager.getInstance()
      const availableVariables = templateManager.getAvailableVariables()

      // Get current template
      const currentTemplate = await templateManager.getTemplate(
        templateType as any
      )

      // Map template type to readable name
      let templateDisplayName = 'Template'
      let templateDescription = ''

      switch (templateType) {
        case 'ticket_created':
          templateDisplayName = 'Ticket Created'
          templateDescription = 'Sent when a new support ticket is created'
          break
        case 'agent_response':
          templateDisplayName = 'Agent Response'
          templateDescription = 'Sent when an agent responds to a ticket'
          break
        case 'ticket_status':
          templateDisplayName = 'Ticket Status'
          templateDescription = 'Sent when a support ticket status changes'
          break
        default:
          templateDisplayName =
            templateType.charAt(0).toUpperCase() +
            templateType.slice(1).replace('_', ' ')
      }

      // Build available variables list
      const coreVars = availableVariables.core
        .map((v) => `• \`{{${v.name}}}\` - ${v.description}`)
        .join('\n')
      const agentVars = availableVariables.agent
        .map((v) => `• \`{{${v.name}}}\` - ${v.description}`)
        .join('\n')
      const timeVars = availableVariables.time
        .map((v) => `• \`{{${v.name}}}\` - ${v.description}`)
        .join('\n')

      const editMessage = `✏️ **Template Editor: ${templateDisplayName}**

**Group:** ${session.groupChatName}
**Purpose:** ${templateDescription}

📝 **Current Template:**
\`\`\`
${currentTemplate?.content || 'Loading...'}
\`\`\`

🔧 **Available Variables:**

**Core Variables:**
${coreVars}

**Agent Variables:**
${agentVars}

**Time Variables:**
${timeVars}

💡 **Usage Examples:**
• \`{{ticketId}}\` → TKT-12345
• \`{{customerName}}\` → John Doe
• \`{{agentName}}\` → Sarah Johnson

**Ready to customize? Click "Edit Template" to start!**`

      // Generate short callback ID for this session
      const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId)

      await ctx.editMessageText(editMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✏️ Edit Template',
                callback_data: `template_start_edit_${this.getTemplateShortCode(templateType)}_${shortId}`,
              },
            ],
            [
              {
                text: '⬅️ Back to Templates',
                callback_data: `setup_customize_templates_${shortId}`,
              },
            ],
            [
              {
                text: '🚀 Use Defaults Instead',
                callback_data: `setup_use_defaults_${shortId}`,
              },
              {
                text: '✅ Finish Setup',
                callback_data: `setup_finish_custom_${shortId}`,
              },
            ],
          ],
        },
      })

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleTemplateEdit', {
        sessionId,
        templateType,
      })
      await ctx.answerCbQuery(
        '❌ Failed to open template editor. Please try again.'
      )
      return true
    }
  }

  /**
   * Handle starting template editing (text input flow)
   */
  private async handleTemplateStartEdit(
    ctx: BotContext,
    sessionId: string,
    templateType: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('✏️ Starting template editor...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Extend session expiration for template editing
      const now = new Date()
      const currentExpiry = new Date(session.expiresAt)

      // Extend to 15 minutes from now, or add 15 minutes to current expiry, whichever is later
      const newExpiryFromNow = new Date(
        now.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )
      const newExpiryFromCurrent = new Date(
        currentExpiry.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )
      const extendedExpiresAt =
        newExpiryFromNow > newExpiryFromCurrent
          ? newExpiryFromNow
          : newExpiryFromCurrent

      LogEngine.info('Extending session expiration for template start edit', {
        sessionId,
        templateType,
        currentTime: now.toISOString(),
        currentExpiry: session.expiresAt,
        finalExpiry: extendedExpiresAt.toISOString(),
      })

      await BotsStore.updateDmSetupSession(sessionId, {
        expiresAt: extendedExpiresAt.toISOString(),
      })

      // Get current template content
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )
      const templateManager = GlobalTemplateManager.getInstance()
      const currentTemplate = await templateManager.getTemplate(
        templateType as any
      )

      // Map template type to readable name
      let templateDisplayName =
        templateType.charAt(0).toUpperCase() +
        templateType.slice(1).replace('_', ' ')

      switch (templateType) {
        case 'ticket_created':
          templateDisplayName = 'Ticket Created'
          break
        case 'agent_response':
          templateDisplayName = 'Agent Response'
          break
        case 'ticket_status':
          templateDisplayName = 'Ticket Status'
          break
      }

      // Update session to expect template content input
      await BotsStore.updateDmSetupSession(sessionId, {
        currentStep: 'awaiting_template_content',
        stepData: {
          ...session.stepData,
          editingTemplateType: templateType,
          originalTemplateContent: currentTemplate?.content || '',
        },
      })

      const editPromptMessage = `✏️ **Edit ${templateDisplayName} Template**

**Group:** ${session.groupChatName}

📝 **Current Template:**
\`\`\`
${currentTemplate?.content || 'Loading...'}
\`\`\`

**Instructions:**
• Type your new template content below
• Use variables like \`{{ticketId}}\`, \`{{customerName}}\`, \`{{agentName}}\`
• Keep it clear and professional
• You can use multiple lines

**Available Variables:**
• \`{{ticketId}}\` - Unique ticket identifier
• \`{{summary}}\` - Ticket summary/title  
• \`{{customerName}}\` - Customer name
• \`{{status}}\` - Ticket status
• \`{{agentName}}\` - Agent name (for responses)
• \`{{response}}\` - Agent response content
• \`{{createdAt}}\` - Creation time
• \`{{updatedAt}}\` - Last update time

**Type your new template content:**`

      // Generate short callback ID for this session
      const shortId = SetupCallbackProcessor.generateShortCallbackId(sessionId)

      await ctx.editMessageText(editPromptMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '❌ Cancel Edit',
                callback_data: `template_cancel_edit_${this.getTemplateShortCode(templateType)}_${shortId}`,
              },
            ],
            [
              {
                text: '⬅️ Back to Template Info',
                callback_data: `template_edit_${this.getTemplateShortCode(templateType)}_${shortId}`,
              },
            ],
          ],
        },
      })

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleTemplateStartEdit', {
        sessionId,
        templateType,
      })
      await ctx.answerCbQuery(
        '❌ Failed to start template editor. Please try again.'
      )
      return true
    }
  }

  /**
   * Handle canceling template edit
   */
  private async handleTemplateCancelEdit(
    ctx: BotContext,
    sessionId: string,
    templateType: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('❌ Template edit cancelled')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')

      // Reset session step
      await BotsStore.updateDmSetupSession(sessionId, {
        currentStep: 'template_customization',
      })

      // Return to template info view
      return await this.handleTemplateEdit(ctx, sessionId, templateType)
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleTemplateCancelEdit', {
        sessionId,
        templateType,
      })
      await ctx.editMessageText(
        '❌ Failed to cancel template edit. Please try again.'
      )
      return true
    }
  }

  /**
   * Handle returning to customer selection screen
   */
  private async handleBackToCustomerSelection(
    ctx: BotContext,
    sessionId: string
  ): Promise<boolean> {
    await ctx.answerCbQuery('⬅️ Returning to customer setup options...')

    try {
      const { BotsStore } = await import('../../sdk/bots-brain/index.js')
      const session = await BotsStore.getDmSetupSession(sessionId)

      if (!session) {
        await ctx.editMessageText(
          '❌ Setup session expired. Please start over with `/setup` in the group.'
        )
        return true
      }

      // Extend session expiry when navigating back to prevent expiration
      const now = new Date()
      const extendedExpiresAt = new Date(
        now.getTime() +
          CALLBACK_CONSTANTS.SESSION.EXPIRY_EXTENSION_MINUTES * 60 * 1000
      )

      // Update session step and extend expiry
      await BotsStore.updateDmSetupSession(sessionId, {
        currentStep: 'customer_setup',
        expiresAt: extendedExpiresAt.toISOString(),
      })

      const suggestedName = session.stepData?.suggestedName || 'Unknown'
      const groupTitle =
        session.stepData?.groupTitle || session.groupChatName || 'Unknown Group'

      const customerSetupMessage = `🎯 **Customer Setup**

**Group:** ${groupTitle}

Please choose how you'd like to set up the customer for this group:

**Suggested Customer Name:**
\`${suggestedName}\`

**Choose your preferred option:**`

      // Generate short callback IDs to stay within Telegram's 64-byte limit
      const shortSuggestedId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)
      const shortCustomId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)
      const shortExistingId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)
      const shortCancelId =
        SetupCallbackProcessor.generateShortCallbackId(sessionId)

      await ctx.editMessageText(customerSetupMessage, {
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
      })

      return true
    } catch (error) {
      logError(error, 'SetupCallbackProcessor.handleBackToCustomerSelection', {
        sessionId,
      })
      await ctx.editMessageText(
        '❌ Failed to return to customer setup. Please try again.'
      )
      return true
    }
  }
}

/**
 * Admin Callback Processor
 * Handles callbacks related to admin functionality and activation
 */
export class AdminCallbackProcessor implements ICallbackProcessor {
  canHandle(callbackData: string): boolean {
    return (
      callbackData.startsWith('admin_help_') ||
      callbackData.startsWith('template_preview_') ||
      callbackData.startsWith('template_reset_') ||
      callbackData.startsWith('template_close') ||
      callbackData.startsWith('template_edit_ticket_') ||
      callbackData.startsWith('template_edit_agent_') ||
      callbackData.startsWith('template_edit_status') ||
      callbackData === 'template_back_to_manager'
    )
  }

  async process(ctx: BotContext, callbackData: string): Promise<boolean> {
    try {
      // Handle admin help callbacks
      if (callbackData.startsWith('admin_help_activation_')) {
        return await this.handleActivationHelp(ctx)
      }

      // Handle template management callbacks
      if (callbackData === 'template_preview_all') {
        return await this.handleTemplatePreview(ctx)
      }

      if (callbackData === 'template_reset_confirm') {
        return await this.handleTemplateResetConfirm(ctx)
      }

      if (callbackData === 'template_reset_confirmed') {
        return await this.handleTemplateResetConfirmed(ctx)
      }

      if (callbackData === 'template_close') {
        return await this.handleTemplateClose(ctx)
      }

      if (callbackData === 'template_back_to_manager') {
        return await this.handleBackToManager(ctx)
      }

      // Handle standalone template editing (outside setup flow)
      if (callbackData.startsWith('template_edit_')) {
        const templateType = callbackData.replace('template_edit_', '')
        return await this.handleStandaloneTemplateEdit(ctx, templateType)
      }

      return false
    } catch (error) {
      logError(error, 'AdminCallbackProcessor.process', {
        callbackData,
        userId: ctx.from?.id,
      })
      await ctx.answerCbQuery('❌ An error occurred. Please try again.')
      return true
    }
  }

  /**
   * Handle template preview - show all current templates with edit buttons
   */
  private async handleTemplatePreview(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('📊 Loading template preview...')

    try {
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )
      const templateManager = GlobalTemplateManager.getInstance()
      const templates = await templateManager.getGlobalTemplates()

      // Smart status calculation for user-friendly display (consistent with template manager)
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

      const previewMessage =
        `📊 **Template Preview**\n\n` +
        `**Current Status:** ${statusMessage}\n` +
        `**Last Activity:** ${activityInfo}\n\n` +
        `**Available Templates:**\n\n` +
        `🎫 **Ticket Created Template:**\n` +
        `\`\`\`\n${templates.templates.ticket_created?.content || 'Using default template'}\n\`\`\`\n\n` +
        `👨‍💼 **Agent Response Template:**\n` +
        `\`\`\`\n${templates.templates.agent_response?.content || 'Using default template'}\n\`\`\`\n\n` +
        `✅ **Ticket Status Template:**\n` +
        `\`\`\`\n${templates.templates.ticket_status?.content || 'Using default template'}\n\`\`\`\n\n` +
        `*Click a template below to edit it:*`

      await ctx.editMessageText(previewMessage, {
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
            ],
            [
              {
                text: '⬅️ Back to Manager',
                callback_data: 'template_back_to_manager',
              },
            ],
          ],
        },
      })

      return true
    } catch (error) {
      logError(error, 'AdminCallbackProcessor.handleTemplatePreview')
      await ctx.editMessageText(
        '❌ Failed to load template preview. Please try again.'
      )
      return true
    }
  }

  /**
   * Handle template reset confirmation
   */
  private async handleTemplateResetConfirm(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('⚠️ Reset confirmation required...')

    const confirmMessage =
      `⚠️ **Reset Templates to Defaults**\n\n` +
      `**Warning:** This action will:\n` +
      `• Replace all custom templates with defaults\n` +
      `• Remove any personalization you've added\n` +
      `• Cannot be undone automatically\n\n` +
      `**Current templates will be lost permanently.**\n\n` +
      `Are you absolutely sure you want to proceed?`

    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Yes, Reset to Defaults',
              callback_data: 'template_reset_confirmed',
            },
          ],
          [{ text: '❌ Cancel', callback_data: 'template_back_to_manager' }],
        ],
      },
    })

    return true
  }

  /**
   * Handle confirmed template reset
   */
  private async handleTemplateResetConfirmed(
    ctx: BotContext
  ): Promise<boolean> {
    await ctx.answerCbQuery('🔄 Resetting templates to defaults...')

    try {
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )
      const templateManager = GlobalTemplateManager.getInstance()

      const result = await templateManager.resetToDefaults(ctx.from?.id)

      if (result.success) {
        const successMessage =
          `✅ **Templates Reset Successfully**\n\n` +
          `All templates have been restored to their default values.\n\n` +
          `**What's been reset:**\n` +
          `• 🎫 Ticket Created Template\n` +
          `• 👨‍💼 Agent Response Template\n` +
          `• ✅ Ticket Status Template\n\n` +
          `You can now customize them again as needed.`

        await ctx.editMessageText(successMessage, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '📊 Preview Templates',
                  callback_data: 'template_preview_all',
                },
              ],
              [
                {
                  text: '⬅️ Back to Manager',
                  callback_data: 'template_back_to_manager',
                },
              ],
            ],
          },
        })
      } else {
        await ctx.editMessageText(
          `❌ **Reset Failed**\n\nFailed to reset templates: ${result.error || 'Unknown error'}\n\nPlease try again.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🔄 Try Again',
                    callback_data: 'template_reset_confirm',
                  },
                  {
                    text: '⬅️ Back',
                    callback_data: 'template_back_to_manager',
                  },
                ],
              ],
            },
          }
        )
      }

      return true
    } catch (error) {
      logError(error, 'AdminCallbackProcessor.handleTemplateResetConfirmed')
      await ctx.editMessageText(
        '❌ An error occurred while resetting templates. Please try again.'
      )
      return true
    }
  }

  /**
   * Handle template close - simply dismiss the interface
   */
  private async handleTemplateClose(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('✅ Template manager closed')

    await ctx.editMessageText(
      `✅ **Template Manager Closed**\n\n` +
        `Template management session ended.\n\n` +
        `Use \`/templates\` anytime to manage your message templates again.`,
      { parse_mode: 'Markdown' }
    )

    return true
  }

  /**
   * Handle going back to template manager
   */
  private async handleBackToManager(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('⬅️ Returning to template manager...')

    try {
      // Import and call the template manager from AdminCommands
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )
      const templateManager = GlobalTemplateManager.getInstance()
      const templates = await templateManager.getGlobalTemplates()
      const templateCount = Object.keys(templates.templates).length

      const templateMessage =
        '📝 **Message Template Manager**\n\n' +
        `**Current Status:** ${templateCount} templates configured\n\n` +
        '**Available Templates:**\n' +
        '• 🎫 **Ticket Created** - New support ticket notifications\n' +
        '• 👨‍💼 **Agent Response** - When agents reply to tickets\n' +
        '• ✅ **Ticket Closed** - Support ticket resolution messages\n\n' +
        '**Management Options:**'

      await ctx.editMessageText(templateMessage, {
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

      return true
    } catch (error) {
      logError(error, 'AdminCallbackProcessor.handleBackToManager')
      await ctx.editMessageText(
        '❌ Failed to return to template manager. Please try `/templates` again.'
      )
      return true
    }
  }

  private async handleActivationHelp(ctx: BotContext): Promise<boolean> {
    await ctx.answerCbQuery('📋 Loading activation help...')

    const helpMessage = `📋 **Admin Activation Guide**

**Why do you need to activate?**
• Security: Links your admin account to a private chat
• Notifications: Enables direct updates and alerts
• Configuration: Allows secure setup management
• Audit Trail: Tracks admin actions for compliance

**Step-by-Step Instructions:**

**1. Start Private Chat**
   • Click 'Send Private Message' button (above)
   • Or search for this bot in Telegram
   • Start a conversation

**2. Send Activation Command**
   • Type: \`/activate\`
   • Send the message
   • Wait for confirmation

**3. Return to Group**
   • Come back to this group chat
   • Try \`/setup\` command again
   • Configuration should now work

**Troubleshooting:**
• Make sure you're in a private chat (not group)
• Verify your user ID is in bot's admin list
• Contact system administrator if issues persist

*Ready to activate? Use the buttons above!*`

    await ctx.editMessageText(helpMessage, {
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
              text: '⬅️ Back to Setup',
              callback_data: 'admin_back_to_setup',
            },
          ],
        ],
      },
    })

    return true
  }

  /**
   * Handle standalone template editing (outside of setup flow)
   */
  private async handleStandaloneTemplateEdit(
    ctx: BotContext,
    templateType: string
  ): Promise<boolean> {
    await ctx.answerCbQuery(
      `✏️ Opening ${templateType.replace('_', ' ')} editor...`
    )

    try {
      const { GlobalTemplateManager } = await import(
        '../../utils/globalTemplateManager.js'
      )
      const templateManager = GlobalTemplateManager.getInstance()
      const availableVariables = templateManager.getAvailableVariables()
      const currentTemplate = await templateManager.getTemplate(
        templateType as any
      )

      // Map template type to readable name and description
      let templateDisplayName =
        templateType.charAt(0).toUpperCase() +
        templateType.slice(1).replace('_', ' ')
      let templateDescription = ''

      switch (templateType) {
        case 'ticket_created':
          templateDisplayName = 'Ticket Created'
          templateDescription = 'Sent when a new support ticket is created'
          break
        case 'agent_response':
          templateDisplayName = 'Agent Response'
          templateDescription = 'Sent when an agent responds to a ticket'
          break
        case 'ticket_status':
          templateDisplayName = 'Ticket Status'
          templateDescription = 'Sent when a support ticket status changes'
          break
      }

      // Build available variables list
      const coreVars = availableVariables.core
        .map((v) => `• \`{{${v.name}}}\` - ${v.description}`)
        .join('\n')
      const agentVars = availableVariables.agent
        .map((v) => `• \`{{${v.name}}}\` - ${v.description}`)
        .join('\n')
      const timeVars = availableVariables.time
        .map((v) => `• \`{{${v.name}}}\` - ${v.description}`)
        .join('\n')

      const editMessage = `✏️ **Template Editor: ${templateDisplayName}**

**Purpose:** ${templateDescription}

📝 **Current Template:**
\`\`\`
${currentTemplate?.content || 'Loading...'}
\`\`\`

🔧 **Available Variables:**

**Core Variables:**
${coreVars}

**Agent Variables:**
${agentVars}

**Time Variables:**
${timeVars}

💡 **Usage Examples:**
• \`{{ticketId}}\` → TKT-12345
• \`{{customerName}}\` → John Doe
• \`{{agentName}}\` → Sarah Johnson

**To edit this template, type your new content below:**`

      await ctx.editMessageText(editMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📊 Preview All Templates',
                callback_data: 'template_preview_all',
              },
            ],
            [
              {
                text: '⬅️ Back to Manager',
                callback_data: 'template_back_to_manager',
              },
            ],
          ],
        },
      })

      return true
    } catch (error) {
      logError(error, 'AdminCallbackProcessor.handleStandaloneTemplateEdit', {
        templateType,
      })
      await ctx.answerCbQuery(
        '❌ Failed to open template editor. Please try again.'
      )
      return true
    }
  }
}
