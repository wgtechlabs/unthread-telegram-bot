# Usage Guide

## 🕹️ Usage

### **🚀 Getting Started - Admin Setup & Customer Usage**

This bot requires a **one-time admin setup** before customers can create support tickets. Here's the complete process:

### **👨‍💼 Admin Setup (One-Time Configuration)**

### **Step 1: Admin Activation (Private DM)**

1. **Admin only**: Start a **private chat** with the bot (click the bot username)
2. Send `/activate` command to enable your admin privileges
3. The bot will confirm your admin access is enabled

```text
Admin: /activate
Bot: ✅ Admin privileges activated!
     You can now configure group chats and manage templates.
```

### **Step 2: Group Chat Configuration**

1. **Admin**: Add the bot to your **customer/partner group chat**
2. **Admin**: Make sure the bot has **message permissions** (send messages, read messages)
3. **Admin**: In the **group chat**, send `/setup` command
4. **Admin**: The bot will send you a **private DM** to complete the configuration

```text
# In the group chat:
Admin: /setup
Bot: 🔧 Group setup initiated! Check your private messages to complete configuration.

# In private DM:
Bot: 🔧 Group Setup Configuration
     
     Group: "Acme Corp Support"
     Detected Customer: "Acme Corp"
     
     Please confirm this setup:
     [✅ Confirm] [✏️ Edit Customer Name] [❌ Cancel]
```

### **Step 3: Setup Completion**

1. **Admin**: Complete the setup process in the private DM
2. **Admin**: Once confirmed, the group chat is ready for customer support
3. **Customers**: Can now use `/support` to create tickets

```text
# Setup completion DM:
Bot: ✅ Group Setup Complete!
     
     Group "Acme Corp Support" is now configured for:
     • Customer: Acme Corp
     • Support tickets via /support command
     • Bidirectional agent communication
     
     Your customers can now create tickets using /support in the group chat.
```

### **👥 Customer Usage (After Admin Setup)**

Once the admin has completed the setup, customers can use the bot naturally:

### **Creating Customer Support Tickets**

1. **Customer**: Use `/support` in the configured group chat
2. **Customer**: Describe the issue when prompted  
3. **Customer**: Provide email (first-time users only)
4. **Customer**: Receive ticket confirmation and agent responses

```text
Customer: /support
Bot: Let's create a support ticket. Please describe your issue:

Customer: Unable to access my dashboard
Bot: Please provide your email address: [Skip] [Enter Email]

Customer: customer@company.com  
Bot: 🎫 Support Ticket Created Successfully!
     
     Ticket #TKT-001 - Open
     Summary: Unable to access my dashboard
     
     Our team will respond shortly. You'll receive updates right here in this chat!
```

### **Ongoing Customer Experience**

- **Natural replies**: Simply reply to agent messages - no commands needed
- **Automatic updates**: Receive status notifications when tickets are closed
- **Email management**: Use `/viewemail` to view settings and `/setemail` to update your email
- **Easy ticket creation**: Use `/support` anytime for new issues

> **💡 Pro Tip**: Only admins need to do the setup process. Once configured, customers can immediately start creating tickets with `/support` - no activation needed on their part!

## Bot Commands

**User Commands:**

- `/start` - Welcome message and bot introduction
- `/help` - Display available commands and usage instructions  
- `/support` - Create a new support ticket (customer/partner group chats only)
- `/viewemail` - View your current email settings
- `/setemail` - Set or update your email address for support tickets
- `/version` - Show current bot version
- `/cancel` - Cancel current operation
- `/reset` - Reset conversation state

**Admin Commands:**

- `/activate` - Activate admin privileges for advanced features (private chat only)
- `/setup` - Configure group chat for support (admin only)
- `/templates` - Manage message templates (admin only)

## Creating Support Tickets

1. **Use `/support` in your group chat**
2. **Describe your issue** when the bot asks
3. **Provide email (first-time users only)** - returning users automatically use their stored email
4. **Get your ticket number** and confirmation

```text
User: /support
Bot: Let's create a support ticket. Please provide your issue summary:

User: Unable to login to my account
Bot: Please provide your email address or skip this step: [Skip Button]

User: john@example.com
Bot: 🎫 Support Ticket Created Successfully!
     Ticket #TKT-001
     Your issue has been submitted and our team will be in touch soon.
```

**Note**: After your first ticket, the bot remembers your email and skips the email prompt for future tickets. You can update your email anytime using the `/setemail` command or view your settings with `/viewemail`.

## Managing Your Email Settings

Use the `/viewemail` command to view your current email settings and `/setemail` to update them:

```text
User: /viewemail
Bot: 📧 Email Settings
     
     ✅ Email address: john@example.com
     📅 Set on: {date}
     🏷️ Type: Personal email
     
     What would you like to do?
     [📝 Update Email] [ℹ️ About]

User: /setemail john.doe@company.com
Bot: ✅ Email Updated Successfully!
     Your email has been updated to: john.doe@company.com
     This email will be used for all future support tickets.
```

**Email Management Features:**

- **View current email** - See the email associated with your account
- **Update email** - Change your email for future support tickets
- **Auto-generated email detection** - Get notified if you're using an auto-generated email
- **Seamless integration** - Email updates apply to all future support tickets

## For Agents (Unthread Dashboard)

- **New tickets** appear in your Unthread dashboard automatically
- **Reply normally** in Unthread - messages are delivered to Telegram instantly
- **Close tickets** and customers get notified in Telegram with status updates

## Group Chat Setup

1. **Add your bot** to the customer/partner Telegram group
2. **Give message permissions** to the bot
3. **Use descriptive names** like "Acme Corp Support" for automatic customer detection

> **💡 Best Practice**: Use this bot for dedicated customer/partner support channels, not public community groups.