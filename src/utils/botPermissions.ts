/**
 * Bot Permission Utilities
 * 
 * This module handles checking if the bot has admin permissions in Telegram groups,
 * which is required for proper setup and operation.
 */

import type { BotContext } from '../types/index.js';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { LogEngine } from '@wgtechlabs/log-engine';

/**
 * Type guard to check if a chat has a title property (group/supergroup chats)
 * @param chat - The chat object to check
 * @returns True if the chat has a title property
 */
function chatHasTitle(chat: any): chat is { title: string } {
  return chat && typeof chat === 'object' && 'title' in chat && typeof chat.title === 'string';
}

/**
 * Safely get chat title with fallback
 * @param ctx - Bot context
 * @param fallback - Fallback title if chat doesn't have a title
 * @returns Chat title or fallback
 */
function getChatTitle(ctx: BotContext, fallback: string = 'this chat'): string {
  return chatHasTitle(ctx.chat) ? ctx.chat.title : fallback;
}

/**
 * Check if the bot has admin permissions in the current chat
 * @param ctx Telegram bot context
 * @returns Promise<boolean> - true if bot is admin, false otherwise
 */
export async function isBotAdmin(ctx: BotContext): Promise<boolean> {
  try {
    // Only check in group chats (not private messages)
    if (ctx.chat?.type === 'private') {
      return true; // Always "admin" in private chats
    }

    if (!ctx.chat) {
      LogEngine.error('[BotPermissions] No chat context available');
      return false;
    }

    // Get bot's user ID
    const botUser = await ctx.telegram.getMe();
    const botId = botUser.id;

    // Get chat member info for the bot
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, botId);
    
    // Check if bot has admin status
    const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
    
    LogEngine.info(`[BotPermissions] Bot admin status in chat ${ctx.chat.id}: ${isAdmin ? 'ADMIN' : 'NOT_ADMIN'} (status: ${chatMember.status})`);
    
    return isAdmin;
  } catch (error) {
    LogEngine.error('[BotPermissions] Error checking bot admin status:', error);
    return false;
  }
}

/**
 * Check bot admin status and prompt user if not admin
 * @param ctx Telegram bot context
 * @returns Promise<boolean> - true if bot is admin or check succeeded, false if not admin
 */
export async function checkAndPromptBotAdmin(ctx: BotContext): Promise<boolean> {
  const isAdmin = await isBotAdmin(ctx);
  
  if (!isAdmin) {
    await sendBotNotAdminMessage(ctx);
    return false;
  }
  
  return true;
}

/**
 * Send message indicating bot needs admin permissions with retry option
 * @param ctx Telegram bot context
 */
async function sendBotNotAdminMessage(ctx: BotContext): Promise<void> {
  const chatType = ctx.chat?.type || 'unknown';
  const chatTitle = getChatTitle(ctx, 'this chat');
  
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

Once you've made me an admin, click the button below to continue setup.`;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        {
          text: '🔄 Retry Setup',
          callback_data: 'retry_bot_admin_check'
        }
      ],
      [
        {
          text: '❓ Help & Instructions',
          callback_data: 'bot_admin_help'
        }
      ]
    ]
  };

  try {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
    LogEngine.info(`[BotPermissions] Sent bot admin required message to chat ${ctx.chat?.id}`);
  } catch (error) {
    LogEngine.error('[BotPermissions] Error sending bot admin message:', error);
    
    // Fallback message without markdown if parsing fails
    try {
      await ctx.reply(
        `🔐 Bot Admin Required\n\nTo set up this group, I need admin permissions. Please make me an administrator and try again.`,
        { reply_markup: keyboard }
      );
    } catch (fallbackError) {
      LogEngine.error('[BotPermissions] Error sending fallback bot admin message:', fallbackError);
    }
  }
}

/**
 * Send detailed help message about making the bot an admin
 * @param ctx Telegram bot context
 */
export async function sendBotAdminHelpMessage(ctx: BotContext): Promise<void> {
  // Answer callback query if this was triggered by a callback
  if ('answerCbQuery' in ctx) {
    await safeAnswerCallbackQuery(ctx, 'Loading help information...', 3000);
  }

  const chatTitle = getChatTitle(ctx, 'this group');
  
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

Need more help? Contact your Unthread administrator.`;

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        {
          text: '🔄 I Made You Admin - Retry',
          callback_data: 'retry_bot_admin_check'
        }
      ],
      [
        {
          text: '⬅️ Back to Setup',
          callback_data: 'back_to_setup'
        }
      ]
    ]
  };

  try {
    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    LogEngine.error('[BotPermissions] Error sending bot admin help:', error);
    
    // Fallback without markdown
    await ctx.reply(
      `How to Make Me an Admin:\n\n1. Go to group settings\n2. Find Administrators section\n3. Add @${ctx.botInfo?.username || 'UnthreadBot'} as admin\n4. Grant delete and pin message permissions\n5. Try setup again`,
      { reply_markup: keyboard }
    );
  }
}

/**
 * Safely answer a callback query with timeout and robust error handling
 * @param ctx Telegram bot context
 * @param text Text to show in the callback query answer
 * @param timeoutMs Timeout in milliseconds (default: 5000ms)
 * @returns Promise<boolean> - true if successful, false if failed
 */
async function safeAnswerCallbackQuery(
  ctx: BotContext, 
  text: string, 
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    // Check if context has answerCbQuery method
    if (!('answerCbQuery' in ctx)) {
      LogEngine.warn('[BotPermissions] Context does not support callback query answering');
      return false;
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Callback query answer timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // Race between the actual API call and timeout
    await Promise.race([
      ctx.answerCbQuery(text),
      timeoutPromise
    ]);

    LogEngine.info(`[BotPermissions] Successfully answered callback query: "${text}"`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    LogEngine.error(`[BotPermissions] Failed to answer callback query: ${errorMessage}`);
    
    // Log additional context for debugging
    LogEngine.error('[BotPermissions] Callback query context:', {
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type,
      hasAnswerMethod: 'answerCbQuery' in ctx,
      text: text
    });
    
    return false;
  }
}

/**
 * Handle retry bot admin check callback
 * @param ctx Telegram bot context (from callback query)
 */
export async function handleRetryBotAdminCheck(ctx: BotContext): Promise<void> {
  try {
    // Answer the callback query first with robust error handling
    const queryAnswered = await safeAnswerCallbackQuery(
      ctx, 
      'Checking bot admin status...',
      3000 // 3 second timeout
    );
    
    if (!queryAnswered) {
      LogEngine.warn('[BotPermissions] Could not answer initial callback query, continuing anyway');
    }

    LogEngine.info(`[BotPermissions] Retrying bot admin check for chat ${ctx.chat?.id}`);

    const isAdmin = await isBotAdmin(ctx);
    
    if (isAdmin) {
      // Success! Bot is now admin
      const successMessage = `✅ **Perfect!** I now have admin permissions.

Setup can continue. Type /setup to proceed with linking this group to your Unthread customer.`;

      const keyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            {
              text: '▶️ Continue Setup',
              callback_data: 'continue_setup'
            }
          ]
        ]
      };

      await ctx.reply(successMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
      LogEngine.info(`[BotPermissions] Bot admin check passed for chat ${ctx.chat?.id}`);
    } else {
      // Still not admin, send the prompt again
      await sendBotNotAdminMessage(ctx);
      LogEngine.info(`[BotPermissions] Bot admin check still failing for chat ${ctx.chat?.id}`);
    }
  } catch (error) {
    LogEngine.error('[BotPermissions] Error handling retry bot admin check:', error);
    
    // Enhanced error handling for the fallback callback query answer
    const fallbackAnswered = await safeAnswerCallbackQuery(
      ctx,
      'Error checking status. Please try again.',
      2000 // 2 second timeout for error case
    );
    
    if (!fallbackAnswered) {
      LogEngine.error('[BotPermissions] Failed to answer callback query in error handler');
      
      // Last resort: try a simple text response without callback query
      try {
        await ctx.reply('❌ Error checking admin status. Please try the setup command again or contact support.');
      } catch (replyError) {
        LogEngine.error('[BotPermissions] Failed to send fallback reply message:', replyError);
      }
    }
  }
}

/**
 * Get a summary of bot permissions for debugging/logging
 * @param ctx Telegram bot context
 * @returns Promise<object> - Permission summary object
 */
export async function getBotPermissionSummary(ctx: BotContext): Promise<{
  chatId: number;
  chatType: string;
  botStatus: string;
  isAdmin: boolean;
  permissions?: any;
}> {
  try {
    if (!ctx.chat) {
      return {
        chatId: 0,
        chatType: 'unknown',
        botStatus: 'no_chat_context',
        isAdmin: false
      };
    }

    const botUser = await ctx.telegram.getMe();
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, botUser.id);
    
    return {
      chatId: ctx.chat.id,
      chatType: ctx.chat.type,
      botStatus: chatMember.status,
      isAdmin: chatMember.status === 'administrator' || chatMember.status === 'creator',
      permissions: 'permissions' in chatMember ? chatMember.permissions : undefined
    };
  } catch (error) {
    LogEngine.error('[BotPermissions] Error getting permission summary:', error);
    
    return {
      chatId: ctx.chat?.id || 0,
      chatType: ctx.chat?.type || 'unknown',
      botStatus: 'error',
      isAdmin: false
    };
  }
}
