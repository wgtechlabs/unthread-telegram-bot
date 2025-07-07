/**
 * Bot Permission Utilities
 * 
 * This module handles checking if the bot has admin permissions in Telegram groups,
 * which is required for proper setup and operation.
 */

import { Context as BotContext } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';

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
      console.error('[BotPermissions] No chat context available');
      return false;
    }

    // Get bot's user ID
    const botUser = await ctx.telegram.getMe();
    const botId = botUser.id;

    // Get chat member info for the bot
    const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, botId);
    
    // Check if bot has admin status
    const isAdmin = chatMember.status === 'administrator' || chatMember.status === 'creator';
    
    console.log(`[BotPermissions] Bot admin status in chat ${ctx.chat.id}: ${isAdmin ? 'ADMIN' : 'NOT_ADMIN'} (status: ${chatMember.status})`);
    
    return isAdmin;
  } catch (error) {
    console.error('[BotPermissions] Error checking bot admin status:', error);
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
  const chatTitle = 'title' in (ctx.chat || {}) ? (ctx.chat as any).title : 'this chat';
  
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
    
    console.log(`[BotPermissions] Sent bot admin required message to chat ${ctx.chat?.id}`);
  } catch (error) {
    console.error('[BotPermissions] Error sending bot admin message:', error);
    
    // Fallback message without markdown if parsing fails
    try {
      await ctx.reply(
        `🔐 Bot Admin Required\n\nTo set up this group, I need admin permissions. Please make me an administrator and try again.`,
        { reply_markup: keyboard }
      );
    } catch (fallbackError) {
      console.error('[BotPermissions] Error sending fallback bot admin message:', fallbackError);
    }
  }
}

/**
 * Send detailed help message about making the bot an admin
 * @param ctx Telegram bot context
 */
export async function sendBotAdminHelpMessage(ctx: BotContext): Promise<void> {
  const chatTitle = 'title' in (ctx.chat || {}) ? (ctx.chat as any).title : 'this group';
  
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
    console.error('[BotPermissions] Error sending bot admin help:', error);
    
    // Fallback without markdown
    await ctx.reply(
      `How to Make Me an Admin:\n\n1. Go to group settings\n2. Find Administrators section\n3. Add @${ctx.botInfo?.username || 'UnthreadBot'} as admin\n4. Grant delete and pin message permissions\n5. Try setup again`,
      { reply_markup: keyboard }
    );
  }
}

/**
 * Handle retry bot admin check callback
 * @param ctx Telegram bot context (from callback query)
 */
export async function handleRetryBotAdminCheck(ctx: BotContext): Promise<void> {
  try {
    // Answer the callback query first
    if ('answerCbQuery' in ctx) {
      await ctx.answerCbQuery('Checking bot admin status...');
    }

    console.log(`[BotPermissions] Retrying bot admin check for chat ${ctx.chat?.id}`);

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
      
      console.log(`[BotPermissions] Bot admin check passed for chat ${ctx.chat?.id}`);
    } else {
      // Still not admin, send the prompt again
      await sendBotNotAdminMessage(ctx);
      console.log(`[BotPermissions] Bot admin check still failing for chat ${ctx.chat?.id}`);
    }
  } catch (error) {
    console.error('[BotPermissions] Error handling retry bot admin check:', error);
    
    try {
      if ('answerCbQuery' in ctx) {
        await ctx.answerCbQuery('Error checking status. Please try again.');
      }
    } catch (cbError) {
      console.error('[BotPermissions] Error answering callback query:', cbError);
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
    console.error('[BotPermissions] Error getting permission summary:', error);
    
    return {
      chatId: ctx.chat?.id || 0,
      chatType: ctx.chat?.type || 'unknown',
      botStatus: 'error',
      isAdmin: false
    };
  }
}
