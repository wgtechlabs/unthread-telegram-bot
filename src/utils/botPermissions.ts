/**
 * Unthread Telegram Bot - Bot Permission Management Module
 *
 * Provides comprehensive utilities for checking and managing bot permissions in
 * Telegram groups and channels. This module ensures the bot has the necessary
 * administrative privileges to perform its functions effectively.
 *
 * Core Features:
 * - Bot admin permission verification in groups
 * - Permission requirement guidance for users
 * - Automated permission checking with user-friendly feedback
 * - Retry mechanisms for permission validation
 * - Integration with group setup workflows
 *
 * Permission Requirements:
 * - Administrator status in target groups
 * - Message sending and editing permissions
 * - Access to group member information
 * - Ability to read message history
 *
 * Error Handling:
 * - Clear messaging when permissions are insufficient
 * - Step-by-step guidance for granting permissions
 * - Graceful fallbacks when permission checks fail
 * - Comprehensive logging for debugging permission issues
 *
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0
 * @since 2025
 */

import type { BotContext } from '../types/index.js'
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { LogEngine } from '@wgtechlabs/log-engine'

/**
 * Determines whether the provided chat object represents a group or supergroup by checking for a string `title` property.
 *
 * @param chat - The chat object to evaluate
 * @returns True if the chat has a string `title` property, indicating it is a group or supergroup
 */
function chatHasTitle(chat: any): chat is { title: string } {
  return (
    chat &&
    typeof chat === 'object' &&
    'title' in chat &&
    typeof chat.title === 'string'
  )
}

/**
 * Returns the chat title if available, or a fallback string if the chat has no title.
 *
 * @param fallback - The string to use if the chat does not have a title
 * @returns The chat's title or the provided fallback
 */
function getChatTitle(ctx: BotContext, fallback: string = 'this chat'): string {
  return chatHasTitle(ctx.chat) ? ctx.chat.title : fallback
}

/**
 * Determines whether the bot has administrative privileges in the current chat.
 *
 * Returns `true` for private chats. For group or supergroup chats, checks the bot's membership status and returns `true` if the bot is an administrator or creator, otherwise returns `false`. Logs errors and returns `false` if the check cannot be completed.
 *
 * @returns A promise that resolves to `true` if the bot is an admin in the current chat, or `false` otherwise.
 */
export async function isBotAdmin(ctx: BotContext): Promise<boolean> {
  try {
    // Only check in group chats (not private messages)
    if (ctx.chat?.type === 'private') {
      return true // Always "admin" in private chats
    }

    if (!ctx.chat) {
      LogEngine.error('[BotPermissions] No chat context available')
      return false
    }

    // Get bot's user ID
    const botUser = await ctx.telegram.getMe()
    const botId = botUser.id

    // Get chat member info for the bot
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, botId)

    // Check if bot has admin status
    const isAdmin =
      chatMember.status === 'administrator' || chatMember.status === 'creator'

    LogEngine.info(
      `[BotPermissions] Bot admin status in chat ${ctx.chat.id}: ${isAdmin ? 'ADMIN' : 'NOT_ADMIN'} (status: ${chatMember.status})`
    )

    return isAdmin
  } catch (error) {
    LogEngine.error('[BotPermissions] Error checking bot admin status:', error)
    return false
  }
}

/**
 * Checks if the bot has admin privileges in the current chat and prompts the user with instructions if not.
 *
 * @returns `true` if the bot is an admin; otherwise, sends a message requesting admin rights and returns `false`.
 */
export async function checkAndPromptBotAdmin(
  ctx: BotContext
): Promise<boolean> {
  const isAdmin = await isBotAdmin(ctx)

  if (!isAdmin) {
    await sendBotNotAdminMessage(ctx)
    return false
  }

  return true
}

/**
 * Sends a message to the chat explaining that the bot requires admin permissions, including step-by-step instructions and options to retry or view help.
 *
 * If sending the message with Markdown formatting fails, a plain text fallback is sent instead.
 */
async function sendBotNotAdminMessage(ctx: BotContext): Promise<void> {
  const chatType = ctx.chat?.type || 'unknown'
  const chatTitle = getChatTitle(ctx, 'this chat')

  const message = `🔐 **Bot Admin Required**

To set up this group with Unthread, I need admin permissions in **${chatTitle}**.

**Steps to fix this:**
1. Go to group settings
2. Find "Administrators" section  
3. Add me (@${ctx.botInfo?.username || 'UnthreadBot'}) as an administrator
4. Grant at least these permissions:
   • Delete messages
   • Pin messages
   • Add new admins (optional)

**Why do I need admin rights?**
• To manage support tickets properly
• To pin important notifications
• To moderate ticket conversations

Once you've made me an admin, click the button below to continue setup.`

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        {
          text: '🔄 Retry Setup',
          callback_data: 'retry_bot_admin_check',
        },
      ],
      [
        {
          text: '❓ Help & Instructions',
          callback_data: 'bot_admin_help',
        },
      ],
    ],
  }

  try {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    })

    LogEngine.info(
      `[BotPermissions] Sent bot admin required message to chat ${ctx.chat?.id}`
    )
  } catch (error) {
    LogEngine.error('[BotPermissions] Error sending bot admin message:', error)

    // Fallback message without markdown if parsing fails
    try {
      await ctx.reply(
        `🔐 Bot Admin Required\n\nTo set up this group, I need admin permissions. Please make me an administrator and try again.`,
        { reply_markup: keyboard }
      )
    } catch (fallbackError) {
      LogEngine.error(
        '[BotPermissions] Error sending fallback bot admin message:',
        fallbackError
      )
    }
  }
}

/**
 * Sends a detailed help message to the chat explaining how to make the bot an admin, including step-by-step instructions for mobile and desktop apps, required permissions, and troubleshooting tips. Provides interactive buttons for retrying the admin check or returning to setup. Falls back to a plain text message if sending with Markdown fails.
 */
export async function sendBotAdminHelpMessage(ctx: BotContext): Promise<void> {
  // Answer callback query if this was triggered by a callback
  if ('answerCbQuery' in ctx) {
    await safeAnswerCallbackQuery(ctx, 'Loading help information...', 3000)
  }

  const chatTitle = getChatTitle(ctx, 'this group')

  const helpMessage = `📋 **How to Make Me an Admin**

**For Mobile Apps:**
1. Tap the group name at the top
2. Tap "Edit" or the pencil icon
3. Tap "Administrators" 
4. Tap "Add Admin"
5. Search for "@${ctx.botInfo?.username || 'UnthreadBot'}"
6. Select me and confirm

**For Desktop Apps:**
1. Right-click the group name
2. Select "Manage Group"
3. Go to "Administrators" tab
4. Click "Add Administrator"
5. Search for "@${ctx.botInfo?.username || 'UnthreadBot'}"
6. Select me and confirm

**Required Permissions:**
✅ Delete messages (required)
✅ Pin messages (required)  
⚪ Add new admins (optional)
⚪ Other permissions (not needed)

**Troubleshooting:**
• Make sure you're an admin of **${chatTitle}**
• Only admins can promote other users to admin
• If you can't find me, try typing my username directly

Need more help? Contact your Unthread administrator.`

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        {
          text: '🔄 I Made You Admin - Retry',
          callback_data: 'retry_bot_admin_check',
        },
      ],
      [
        {
          text: '⬅️ Back to Setup',
          callback_data: 'back_to_setup',
        },
      ],
    ],
  }

  try {
    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    })
  } catch (error) {
    LogEngine.error('[BotPermissions] Error sending bot admin help:', error)

    // Fallback without markdown
    await ctx.reply(
      `How to Make Me an Admin:\n\n1. Go to group settings\n2. Find Administrators section\n3. Add @${ctx.botInfo?.username || 'UnthreadBot'} as admin\n4. Grant delete and pin message permissions\n5. Try setup again`,
      { reply_markup: keyboard }
    )
  }
}

/**
 * Attempts to answer a Telegram callback query with the provided text, enforcing a timeout and handling errors gracefully.
 *
 * @param text - The message to display in the callback query response
 * @param timeoutMs - Maximum time in milliseconds to wait for the response (default: 5000)
 * @returns `true` if the callback query was answered successfully; `false` if the context does not support answering, times out, or encounters an error
 */
async function safeAnswerCallbackQuery(
  ctx: BotContext,
  text: string,
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    // Check if context has answerCbQuery method
    if (!('answerCbQuery' in ctx)) {
      LogEngine.warn(
        '[BotPermissions] Context does not support callback query answering'
      )
      return false
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Callback query answer timed out after ${timeoutMs}ms`)
        )
      }, timeoutMs)
    })

    // Race between the actual API call and timeout
    await Promise.race([ctx.answerCbQuery(text), timeoutPromise])

    LogEngine.info(
      `[BotPermissions] Successfully answered callback query: "${text}"`
    )
    return true
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    LogEngine.error(
      `[BotPermissions] Failed to answer callback query: ${errorMessage}`
    )

    // Log additional context for debugging
    LogEngine.error('[BotPermissions] Callback query context:', {
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type,
      hasAnswerMethod: 'answerCbQuery' in ctx,
      text: text,
    })

    return false
  }
}

/**
 * Handles the retry action for checking if the bot has admin permissions in a Telegram group.
 *
 * Responds to the callback query, re-checks the bot's admin status, and sends an appropriate message to the chat based on the result. If the bot is now an admin, prompts the user to continue setup; otherwise, re-sends the admin permission prompt. Provides robust error handling and fallback messaging if issues occur during the process.
 */
export async function handleRetryBotAdminCheck(ctx: BotContext): Promise<void> {
  try {
    // Answer the callback query first with robust error handling
    const queryAnswered = await safeAnswerCallbackQuery(
      ctx,
      'Checking bot admin status...',
      3000 // 3 second timeout
    )

    if (!queryAnswered) {
      LogEngine.warn(
        '[BotPermissions] Could not answer initial callback query, continuing anyway'
      )
    }

    LogEngine.info(
      `[BotPermissions] Retrying bot admin check for chat ${ctx.chat?.id}`
    )

    const isAdmin = await isBotAdmin(ctx)

    if (isAdmin) {
      // Success! Bot is now admin
      const successMessage = `✅ **Perfect!** I now have admin permissions.

Setup can continue. Type /setup to proceed with linking this group to your Unthread customer.`

      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            {
              text: '▶️ Continue Setup',
              callback_data: 'continue_setup',
            },
          ],
        ],
      }

      await ctx.reply(successMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      })

      LogEngine.info(
        `[BotPermissions] Bot admin check passed for chat ${ctx.chat?.id}`
      )
    } else {
      // Still not admin, send the prompt again
      await sendBotNotAdminMessage(ctx)
      LogEngine.info(
        `[BotPermissions] Bot admin check still failing for chat ${ctx.chat?.id}`
      )
    }
  } catch (error) {
    LogEngine.error(
      '[BotPermissions] Error handling retry bot admin check:',
      error
    )

    // Enhanced error handling for the fallback callback query answer
    const fallbackAnswered = await safeAnswerCallbackQuery(
      ctx,
      'Error checking status. Please try again.',
      2000 // 2 second timeout for error case
    )

    if (!fallbackAnswered) {
      LogEngine.error(
        '[BotPermissions] Failed to answer callback query in error handler'
      )

      // Last resort: try a simple text response without callback query
      try {
        await ctx.reply(
          '❌ Error checking admin status. Please try the setup command again or contact support.'
        )
      } catch (replyError) {
        LogEngine.error(
          '[BotPermissions] Failed to send fallback reply message:',
          replyError
        )
      }
    }
  }
}

/**
 * Returns a summary of the bot's permissions and status in the current chat for debugging or logging purposes.
 *
 * The summary includes chat ID, chat type, the bot's status, whether the bot is an admin, and any available permissions.
 *
 * @returns An object containing the chat ID, chat type, bot status, admin status, and permissions if available.
 */
export async function getBotPermissionSummary(ctx: BotContext): Promise<{
  chatId: number
  chatType: string
  botStatus: string
  isAdmin: boolean
  permissions?: any
}> {
  try {
    if (!ctx.chat) {
      return {
        chatId: 0,
        chatType: 'unknown',
        botStatus: 'no_chat_context',
        isAdmin: false,
      }
    }

    const botUser = await ctx.telegram.getMe()
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, botUser.id)

    return {
      chatId: ctx.chat.id,
      chatType: ctx.chat.type,
      botStatus: chatMember.status,
      isAdmin:
        chatMember.status === 'administrator' ||
        chatMember.status === 'creator',
      permissions:
        'permissions' in chatMember ? chatMember.permissions : undefined,
    }
  } catch (error) {
    LogEngine.error('[BotPermissions] Error getting permission summary:', error)

    return {
      chatId: ctx.chat?.id || 0,
      chatType: ctx.chat?.type || 'unknown',
      botStatus: 'error',
      isAdmin: false,
    }
  }
}
