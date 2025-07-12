# Unthread Telegram Bot 🎫🤖 [![made by](https://img.shields.io/badge/made%20by-WG%20Tech%20Labs-0060a0.svg?logo=github&longCache=true&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs) [![official](https://img.shields.io/badge/official-Unthread%20Extension-FF5241.svg?logo=telegram&logoColor=white&labelColor=181717&style=flat-square)](https://unthread.com)

[![release workflow](https://img.shields.io/github/actions/workflow/status/wgtechlabs/unthread-telegram-bot/release.yml?style=flat-square&logo=github&label=release&labelColor=181717)](https://github.com/wgtechlabs/unthread-telegram-bot/actions/workflows/release.yml) [![build workflow](https://img.shields.io/github/actions/workflow/status/wgtechlabs/unthread-telegram-bot/build.yml?branch=dev&style=flat-square&logo=github&labelColor=181717&label=build)](https://github.com/wgtechlabs/unthread-telegram-bot/actions/workflows/build.yml) [![sponsors](https://img.shields.io/badge/sponsor-%E2%9D%A4-%23db61a2.svg?&logo=github&logoColor=white&labelColor=181717&style=flat-square)](https://github.com/sponsors/wgtechlabs) [![version](https://img.shields.io/github/release/wgtechlabs/unthread-telegram-bot.svg?logo=github&labelColor=181717&color=default&style=flat-square&label=version)](https://github.com/wgtechlabs/unthread-telegram-bot/releases) [![star](https://img.shields.io/github/stars/wgtechlabs/unthread-telegram-bot.svg?&logo=github&labelColor=181717&color=yellow&style=flat-square)](https://github.com/wgtechlabs/unthread-telegram-bot/stargazers) [![license](https://img.shields.io/github/license/wgtechlabs/unthread-telegram-bot.svg?&logo=github&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs/unthread-telegram-bot/blob/main/license)

[![banner](https://raw.githubusercontent.com/wgtechlabs/unthread-telegram-bot/main/.github/assets/repo_banner.jpg)](https://github.com/wgtechlabs/unthread-telegram-bot)

**Official Unthread Extension** - The Unthread Telegram Bot is the official integration that connects your customer and partner Telegram chats with Unthread's comprehensive ticket management system. Create and manage support tickets directly within dedicated Telegram groups, with real-time bidirectional communication between your team and clients.

This bot is designed for businesses managing customer support through private Telegram groups or dedicated partner channels - optimized for professional support workflows rather than public community groups.

## 🤗 Special Thanks

### 🤝 Partner Organizations

These outstanding organizations partner with us to support our open-source work:

<!-- markdownlint-disable MD033 -->
| <div align="center">💎 Platinum Sponsor</div> |
|:-------------------------------------------:|
| <a href="https://unthread.com"><img src="https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/sponsors/platinum_unthread.png" width="250" alt="Unthread"></a> |
| <div align="center"><a href="https://unthread.com" target="_blank"><b>Unthread</b></a><br/>Streamlined support ticketing for modern teams.</div> |
<!-- markdownlint-enable MD033 -->

## 🤔 How It Works

The **Official Unthread Telegram Bot** creates a seamless bridge between your customer/partner Telegram chats and Unthread's ticket management system.

### **📥 Ticket Creation**

- Customers and partners in dedicated group chats can create support tickets using the `/support` command
- The bot guides them through a simple conversation to collect issue summary and email (optional)
- Tickets are automatically created in Unthread with proper customer and user association

### **🔄 Bidirectional Communication**

- **Agent → Customer**: When agents respond via the Unthread dashboard, messages are delivered to Telegram in real-time
- **Customer → Agent**: Customers can simply reply to agent messages naturally - no special commands needed
- **Status Notifications**: Receive real-time notifications when ticket status changes with clear messaging and emoji indicators
- **Conversation Flow**: Maintains complete conversation history across both platforms

### **🏢 Smart Customer Management**

- Automatically extracts customer company names from group chat titles (e.g., "Company X Support" → "Company X")
- Creates customers in Unthread with `[Telegram]` prefix for platform identification
- Maps Telegram users to Unthread user profiles with fallback email generation

## ✨ Key Features

- **🎫 Seamless Ticket Management** - Create support tickets directly from Telegram with `/support` command
- **👤 One-Time Email Setup** - Collect email once, automatically use for all future tickets
- **📧 Profile Management** - View and update email preferences with `/profile` command
- **💬 Real-Time Communication** - Bidirectional messaging between agents and customers
- **🏢 Smart Customer Detection** - Automatically extracts customer names from group chat titles
- **💬 Natural Conversation Flow** - Customers reply normally, no special commands needed
- **✅ Status Notifications** - Real-time alerts when tickets are opened or closed
- **🔒 Enterprise-Ready** - Secure, scalable architecture with comprehensive logging
- **⚡ Easy Deployment** - Quick setup with Docker or manual installation
- **🛠️ Template System** - Customizable message templates for consistent communication

## 🚀 Quick Start

### **🎯 Easy Setup**

1. **Get Your Bot Token**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Create new bot with `/newbot` command
   - Save the bot token

2. **Get Your Telegram User ID** *(NEW REQUIREMENT)*
   - Message [@userinfobot](https://t.me/userinfobot) on Telegram
   - Copy your numeric user ID (e.g., `123456789`)
   - **IMPORTANT**: This is required for admin access to setup groups

3. **Setup Unthread**
   - Log into your Unthread dashboard
   - Navigate to Settings → API Keys
   - Generate a new API key
   - Find your channel ID in the dashboard URL

4. **Deploy Instantly**

   **Option A: Railway (One-Click Deploy)**

   [![deploy on railway](https://railway.com/button.svg)](https://railway.com/deploy/unthread-telegram-bot?referralCode=dTwT-i)

   **Option B: Docker (Recommended)**

   ```bash
   # Clone and setup
   git clone https://github.com/wgtechlabs/unthread-telegram-bot.git
   cd unthread-telegram-bot
   cp .env.example .env
   
   # IMPORTANT: Create the external network first
   docker network create unthread-integration-network
   
   # Edit .env with your tokens AND your Telegram user ID
   # ADMIN_USERS=your_telegram_user_id_here  # Replace with actual ID!
   # For multiple admins: ADMIN_USERS=123456789,987654321,555666777
   # Then start everything
   docker compose up -d
   ```

   > **⚠️ IMPORTANT**: If you don't create the external network first, Docker will fail with:
   >
   > `ERROR: Network unthread-integration-network declared as external, but could not be found`
   >
   > **For Local Development**: If you're running Docker on your local machine, add this to your `.env` file:
   >
   > ```bash
   > DATABASE_SSL_VALIDATE=false
   > ```
   >
   > This prevents SSL validation issues with local PostgreSQL connections.

   **Option C: Manual Installation**

   ```bash
   # Clone and setup
   git clone https://github.com/wgtechlabs/unthread-telegram-bot.git
   cd unthread-telegram-bot
   yarn install
   cp .env.example .env
   
   # Edit .env with ALL required values including ADMIN_USERS
   # ADMIN_USERS supports multiple user IDs: ADMIN_USERS=123456789,987654321
   # Then start the bot
   yarn start
   ```

5. **Test Your Bot**
   - Add your bot to a Telegram group
   - Send `/start` to see if it responds
   - Try creating a ticket with `/support`

## 🚂 One-Click Deploy

Deploy instantly to Railway with a single click:

[![deploy on railway](https://railway.com/button.svg)](https://railway.com/deploy/unthread-telegram-bot?referralCode=dTwT-i)

> [!TIP]
> Deploying using Railway directly supports this project's ongoing development and maintenance! 🚀

### **📋 Required Configuration**

Edit your `.env` file with these required values:

```bash
# Required - Get from BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Required - Get from Unthread dashboard
UNTHREAD_API_KEY=your_unthread_api_key
UNTHREAD_SLACK_CHANNEL_ID=your_unthread_slack_channel_id
UNTHREAD_WEBHOOK_SECRET=your_unthread_webhook_secret

# Required - Database (Docker will handle this automatically)
POSTGRES_URL=postgresql://postgres:postgres@postgres-platform:5432/unthread_telegram_bot

# Required - Redis for bot operations (Docker will handle this automatically)
WEBHOOK_REDIS_URL=redis://redis-webhook:6379  # Critical for agent response delivery
PLATFORM_REDIS_URL=redis://redis-platform:6379  # Required for bot state management
```

> **💡 Pro Tip**: The Docker setup includes PostgreSQL and Redis automatically - no separate installation needed!

### **🛤️ Railway Deployment**

For detailed information about Railway's managed PostgreSQL and SSL handling, please refer to the [Railway Deployment section in the README](README.md#🛤️-railway-deployment).

- ✅ **Environment Override**: Railway detection takes precedence over all other SSL settings
- ✅ **No Configuration**: Works out-of-the-box without manual SSL setup

> **🔒 Security Note**: Railway's self-signed certificates are secure within their managed infrastructure. The bot maintains SSL encryption while accommodating Railway's certificate setup.

## 🕹️ Usage

### **Bot Commands**

**User Commands:**

- `/start` - Welcome message and bot introduction
- `/help` - Display available commands and usage instructions  
- `/support` - Create a new support ticket (customer/partner group chats only)
- `/profile` - View and update your email preferences
- `/version` - Show current bot version

### **Creating Support Tickets**

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

**Note**: After your first ticket, the bot remembers your email and skips the email prompt for future tickets. You can update your email anytime using the `/profile` command.

### **Managing Your Profile**

Use the `/profile` command to view and update your email preferences:

```text
User: /profile
Bot: 👤 Your Profile
     Email: john@example.com
     
     What would you like to do?
     [📧 Update Email] [ℹ️ About]

User: [clicks Update Email]
Bot: Please enter your new email address:

User: john.doe@company.com
Bot: ✅ Email Updated Successfully!
     Your email has been updated to: john.doe@company.com
     This email will be used for all future support tickets.
```

**Profile Features:**

- **View current email** - See the email associated with your profile
- **Update email** - Change your email for future support tickets
- **Auto-generated email detection** - Get notified if you're using an auto-generated email
- **Seamless integration** - Email updates apply to all future support tickets

### **For Agents (Unthread Dashboard)**

- **New tickets** appear in your Unthread dashboard automatically
- **Reply normally** in Unthread - messages are delivered to Telegram instantly
- **Close tickets** and customers get notified in Telegram with status updates

### **Group Chat Setup**

1. **Add your bot** to the customer/partner Telegram group
2. **Give message permissions** to the bot
3. **Use descriptive names** like "Acme Corp Support" for automatic customer detection

> **💡 Best Practice**: Use this bot for dedicated customer/partner support channels, not public community groups.

## 💬 Community Discussions

Join our community discussions to get help, share ideas, and connect with other users:

- 📣 **[Announcements](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/announcements)**: Official updates from the maintainer
- 📸 **[Showcase](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/showcase)**: Show and tell your implementation
- 💖 **[Wall of Love](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/wall-of-love)**: Share your experience with the bot
- 🛟 **[Help & Support](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/help-support)**: Get assistance from the community
- 🧠 **[Ideas](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/ideas)**: Suggest new features and improvements

## 🛟 Help & Support

### Getting Help

Need assistance with the bot? Here's how to get help:

- **Community Support**: Check the [Help & Support](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/help-support) category in our GitHub Discussions for answers to common questions.
- **Ask a Question**: Create a [new discussion](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/new?category=help-support) if you can't find answers to your specific issue.
- **Documentation**: Review the [usage instructions](#%EF%B8%8F-usage) in this README for common commands and features.
- **Known Issues**: Browse [existing issues](https://github.com/wgtechlabs/unthread-telegram-bot/issues) to see if your problem has already been reported.

### Reporting Issues

Please report any issues, bugs, or improvement suggestions by [creating a new issue](https://github.com/wgtechlabs/unthread-telegram-bot/issues/new/choose). Before submitting, please check if a similar issue already exists to avoid duplicates.

### Security Vulnerabilities

For security vulnerabilities, please do not report them publicly. Follow the guidelines in our [security policy](./SECURITY.md) to responsibly disclose security issues.

Your contributions to improving this project are greatly appreciated! 🙏✨

## 🎯 Contributing

Contributions are welcome! Create a pull request to this repo and I will review your code. Please consider submitting your pull request to the `dev` branch. Thank you!

For detailed setup instructions, technical documentation, architecture details, and development guidelines, see our comprehensive [Contributing Guide](./CONTRIBUTING.md).

### **🛡️ Security & Supply Chain**

This project implements comprehensive supply chain security measures including:

- **SBOM generation** for all container images
- **Build provenance attestations** for transparency
- **Automated vulnerability scanning** with Trivy
- **Multi-layer security** from development to production

For complete security documentation, see the [Contributing Guide](./CONTRIBUTING.md#-supply-chain-security).

## 💖 Sponsors

Like this project? **Leave a star**! ⭐⭐⭐⭐⭐

There are several ways you can support this project:

- [Become a sponsor](https://github.com/sponsors/wgtechlabs) and get some perks! 💖
- [Buy me a coffee](https://buymeacoffee.com/wgtechlabs) if you just love what I do! ☕
- Deploy using the [Railway Template](https://railway.com/deploy/unthread-telegram-bot?referralCode=dTwT-i) which directly supports the ongoing development! 🛠️

## ⭐ GitHub Star Nomination

Found this project helpful? Consider nominating me **(@warengonzaga)** for the [GitHub Star program](https://stars.github.com/nominate/)! This recognition supports ongoing development of this project and [my other open-source projects](https://github.com/warengonzaga?tab=repositories). GitHub Stars are recognized for their significant contributions to the developer community - your nomination makes a difference and encourages continued innovation!

## 📋 Code of Conduct

I'm committed to providing a welcoming and inclusive environment for all contributors and users. Please review the project's [Code of Conduct](./CODE_OF_CONDUCT.md) to understand the community standards and expectations for participation.

## 📃 License

This project is licensed under the [GNU General Public License v3.0](https://opensource.org/licenses/GPL-3.0). This license ensures that the software remains free and open source, requiring that any redistributed versions also remain under the same license. See the [LICENSE](LICENSE) file for the full license text.

## 📝 Author

This project is created by **[Waren Gonzaga](https://github.com/warengonzaga)** under [WG Technology Labs](https://github.com/wgtechlabs), with the help of awesome [contributors](https://github.com/wgtechlabs/unthread-telegram-bot/graphs/contributors).

[![contributors](https://contrib.rocks/image?repo=wgtechlabs/unthread-telegram-bot)](https://github.com/wgtechlabs/unthread-telegram-bot/graphs/contributors)

---

💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏
