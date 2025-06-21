# Unthread Telegram Bot 🎫🤖 [![made by](https://img.shields.io/badge/made%20by-WG%20Tech%20Labs-0060a0.svg?logo=github&longCache=true&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs) [![official](https://img.shields.io/badge/official-Unthread%20Extension-FF5241.svg?logo=telegram&logoColor=white&labelColor=181717&style=flat-square)](https://unthread.com)

[![sponsors](https://img.shields.io/badge/sponsor-%E2%9D%A4-%23db61a2.svg?&logo=github&logoColor=white&labelColor=181717&style=flat-square)](https://github.com/sponsors/wgtechlabs) [![release](https://img.shields.io/github/release/wgtechlabs/unthread-telegram-bot.svg?logo=github&labelColor=181717&color=green&style=flat-square)](https://github.com/wgtechlabs/unthread-telegram-bot/releases) [![star](https://img.shields.io/github/stars/wgtechlabs/unthread-telegram-bot.svg?&logo=github&labelColor=181717&color=yellow&style=flat-square)](https://github.com/wgtechlabs/unthread-telegram-bot/stargazers) [![license](https://img.shields.io/github/license/wgtechlabs/unthread-telegram-bot.svg?&logo=github&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs/unthread-telegram-bot/blob/main/license)

[![banner](https://raw.githubusercontent.com/wgtechlabs/unthread-telegram-bot/main/.github/assets/repo_banner.jpg)](https://github.com/wgtechlabs/unthread-telegram-bot)

**Official Unthread Extension** - The Unthread Telegram Bot is the official integration that connects your customer and partner Telegram chats with Unthread's ticket management system. Create and manage support tickets directly within dedicated Telegram groups, with real-time bidirectional communication between your team and clients.

Perfect for businesses managing customer support through private Telegram groups or partner channels - not for public community groups.

## 🤗 Special Thanks

### 🤝 Partner Organizations

These outstanding organizations partner with us to support our open-source work:

<!-- markdownlint-disable MD033 -->
| <div align="center">💎 Platinum Sponsor</div> |
|:-------------------------------------------:|
| <a href="https://unthread.com"><img src="https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/sponsors/platinum_unthread.png" width="250" alt="Unthread"></a> |
| <div align="center"><a href="https://unthread.com" target="_blank"><b>Unthread</b></a><br/>Streamlined support ticketing for modern teams.</div> |
<!-- markdownlint-enable MD033 -->

## 💸 Sponsored Ads

Open source development is resource-intensive. These **sponsored ads help keep Log Engine free and actively maintained** while connecting you with tools and services that support open-source development.

[![sponsored ads](https://gitads.dev/v1/ad-serve?source=wgtechlabs/unthread-telegram-bot@github)](https://gitads.dev/v1/ad-track?source=wgtechlabs/unthread-telegram-bot@github)

## 🤔 How It Works

The **Official Unthread Telegram Bot** creates a seamless bridge between your customer/partner Telegram chats and Unthread's ticket management system. Here's how it works:

### **📥 Ticket Creation**

- Customers and partners in dedicated group chats can create support tickets using the `/support` command
- The bot guides them through a simple conversation to collect issue summary and email (optional)
- Tickets are automatically created in Unthread with proper customer and user association

### **🔄 Bidirectional Communication**

- **Agent → Customer**: When agents respond via the Unthread dashboard, messages are delivered to Telegram in real-time through webhook processing
- **Customer → Agent**: Customers can simply reply to agent messages naturally - no special commands needed
- **Status Notifications**: Receive real-time notifications when ticket status changes (Open/Closed) with clear messaging and emoji indicators
- **Conversation Flow**: Maintains complete conversation history across both platforms using message reply chains
- **Webhook Server**: Powered by [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server) which processes Unthread webhooks and queues events in Redis for real-time delivery

### **🏢 Smart Customer Management**

- Automatically extracts customer company names from group chat titles (e.g., "Company X Support" → "Company X")
- Creates customers in Unthread with `[Telegram]` prefix for platform identification
- Maps Telegram users to Unthread user profiles with fallback email generation

### **💾 Multi-Layer Storage**

- **Memory Layer** (24h): Fast access for active conversations
- **Redis Layer** (3 days): Intermediate caching for recent activity  
- **PostgreSQL** (permanent): Long-term storage with full conversation history

## 🔗 Webhook Server Integration

This bot works in conjunction with the [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server) to enable real-time bidirectional communication. Here's how the complete system works:

### **🏗️ System Architecture**

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Unthread      │    │   Webhook       │    │   Redis         │    │   Telegram      │
│   Dashboard     │───▶│   Server        │───▶│   Queue         │───▶│  Bot (Official) │
│                 │    │ (wgtechlabs/    │    │ unthread-events │    │                 │
│   Agent Reply   │    │  unthread-      │    │                 │    │ Customer gets   │
│                 │    │  webhook-server)│    │                 │    │ agent message   │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **🔄 Event Flow**

1. **Agent responds** in Unthread dashboard to a ticket
2. **Unthread webhook** fires and sends event to the webhook server
3. **Webhook server** processes the event and queues it in Redis with proper formatting
4. **Telegram bot** polls the Redis queue and delivers the message to the appropriate group chat
5. **User replies** in Telegram, and the bot sends it back to Unthread API
6. **Status changes** (ticket closed/reopened) trigger real-time notifications to users

### **⚙️ Configuration Requirements**

- **Webhook Server**: Must be deployed separately to receive Unthread webhooks
- **Shared Redis**: Both webhook server and bot must use the same Redis instance
- **Queue Names**: Both webhook server and bot use the standard queue name `unthread-events`

For webhook server setup instructions, see the [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server) repository.

## ✨ Key Features

### **🎫 Seamless Ticket Management**

- Create support tickets directly from customer/partner Telegram chats with `/support` command
- Interactive ticket creation with guided prompts for summary and email
- Automatic ticket numbering and confirmation messages
- Smart customer extraction from group chat names

### **💬 Real-Time Bidirectional Communication**

- Agent responses from Unthread dashboard delivered instantly to Telegram
- Customers reply naturally to agent messages without special commands
- Complete conversation history maintained across both platforms
- Message reply chains preserve conversation context
- **Status Notifications**: Real-time alerts when tickets are opened or closed with emoji-rich formatting
- **Reaction-Based Feedback**: Customer messages are reacted to with ⏳ (sending) → ✅ (sent) or ❌ (error) for clean, non-intrusive status updates

### **🏢 Enterprise-Ready Customer Management**

- Automatic customer creation with `[Telegram]` platform identification
- Smart company name extraction from group chat titles (e.g., "Acme Corp x Support" → "Acme Corp")
- User profile mapping with automatic fallback email generation
- Duplicate prevention for customers and users

### **🚀 Production-Grade Architecture**

- Multi-layer storage: Memory (24h) → Redis (3d) → PostgreSQL (permanent)
- Webhook-based real-time event processing from Unthread via [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server)
- Redis queue system for reliable webhook event processing and delivery
- Graceful degradation when services are unavailable
- Comprehensive error handling and recovery mechanisms

### **⚡ Developer Experience**

- Built with modern ES6+ modules and async/await patterns
- Structured logging with `@wgtechlabs/log-engine` integration
- Auto-setup database schema on first run
- Clean separation of concerns with SDK architecture
- Docker support with multi-stage builds for easy deployment

### **🔧 Flexible Configuration**

- Environment variable based configuration
- Support for both basic mode (ticket creation only) and full mode (with webhooks)
- Configurable webhook polling intervals and queue names
- Optional Redis caching with PostgreSQL fallback

## 📥 Easy Deployment

### **Quick Start (Recommended)**

The bot is designed for easy deployment with minimal configuration. Here's the fastest way to get started:

#### **1. Environment Setup**

Create a `.env` file with the following required variables (you can copy from `.env.example`):

```bash
# Required - Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Required - Database Configuration  
POSTGRES_URL=postgresql://user:password@host:port/database

# Required - Unthread API Configuration
UNTHREAD_API_KEY=your_unthread_api_key
UNTHREAD_CHANNEL_ID=your_unthread_channel_id

# Optional - Webhook Configuration (for real-time agent responses)
# Requires wgtechlabs/unthread-webhook-server to be deployed and configured
WEBHOOK_REDIS_URL=redis://user:password@host:port
WEBHOOK_POLL_INTERVAL=1000
UNTHREAD_WEBHOOK_SECRET=your_unthread_webhook_secret

# Optional - Platform Redis (for advanced caching)
PLATFORM_REDIS_URL=redis://user:password@host:port

# Optional - Company Configuration
COMPANY_NAME=YourCompany
```

#### **2. Install & Run**

```bash
# Install dependencies (Yarn required)
yarn install

# Start the bot
yarn start
```

That's it! The database schema will be created automatically on first run.

### **Deployment Options**

#### **🚀 Railway (One-Click Deploy)**

> [!NOTE]
> This is not yet available.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/u/warengonzaga)

#### **🐳 Docker Support**

##### Option 1: Docker Run (Single Container)

```bash
# Build the Docker image
docker build -t unthread-telegram-bot .

# Run the container with environment variables
docker run -d \
  --name unthread-bot \
  -e TELEGRAM_BOT_TOKEN=your_bot_token \
  -e UNTHREAD_API_KEY=your_api_key \
  -e UNTHREAD_CHANNEL_ID=your_channel_id \
  -e UNTHREAD_WEBHOOK_SECRET=your_webhook_secret \
  -e POSTGRES_URL=your_postgres_url \
  -e WEBHOOK_REDIS_URL=redis://<host>:6379 \
  -e PLATFORM_REDIS_URL=redis://<host>:6379 \
  unthread-telegram-bot
```

##### Option 2: Docker Compose (Recommended)

Docker Compose provides a complete setup with PostgreSQL and Redis included:

- **Complete Stack**: Automatically sets up the bot, PostgreSQL database, and Redis cache
- **Health Checks**: Ensures services start in the correct order
- **Data Persistence**: Database and Redis data are persisted across restarts
- **Network Isolation**: All services run in a dedicated Docker network
- **Easy Management**: Single command to start/stop the entire stack

```bash
# Copy the Docker environment file
cp .env.docker .env

# Edit .env with your configuration
nano .env

# Start all services (bot, database, redis)
docker-compose up -d

# View logs
docker-compose logs -f unthread-bot

# Stop all services
docker-compose down
```

> [!WARNING]
> **Security Notice**
> Never commit sensitive secrets, credentials, or production environment variables (such as API keys or database URLs) to your repository.
> For production deployments, use Docker secrets, environment variables, or a secure secrets manager to inject sensitive values at runtime.
> This helps keep your application and data safe.

### **Database Requirements**

- **PostgreSQL 12+** (required)
- **Redis 6+** (optional, for enhanced performance)
- Automatic schema setup on first connection
- No manual migration scripts needed

## 🕹️ Usage

### **Bot Commands**

The bot provides several commands for users and administrators:

#### **User Commands**

- `/start` - Welcome message and bot introduction
- `/help` - Display available commands and usage instructions  
- `/support` - Create a new support ticket (customer/partner group chats only)
- `/version` - Show current bot version

#### **Support Ticket Creation**

1. **Initiate Ticket**: Use `/support` in a customer/partner group chat
2. **Provide Summary**: Describe your issue when prompted
3. **Email (Optional)**: Provide email or skip for auto-generated one
4. **Confirmation**: Receive ticket number and confirmation message

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

### **Agent Workflow**

#### **Receiving Tickets**

- New tickets appear in your Unthread dashboard
- Customer name shows as `[Telegram] GroupChatName`
- User information includes Telegram username and ID

#### **Responding to Customers**

- Reply to tickets in Unthread dashboard as normal
- Messages are automatically delivered to the original Telegram group
- Customers receive agent responses in real-time

#### **Ongoing Conversations**

- Customers can reply directly to agent messages in Telegram
- No special commands needed - natural conversation flow
- All replies are automatically sent back to Unthread
- **Status Updates**: Customers receive real-time notifications when tickets are closed (🔒) or reopened (📂)
- **Reply Status**: Message reactions show reply status (⏳ sending → ✅ sent successfully / ❌ error)
- Status notifications include clear messaging about next steps and reply to original ticket messages

### **Group Chat Setup**

#### **Adding the Bot**

1. Add your bot to the desired customer/partner Telegram group chat
2. Ensure the bot has permission to read and send messages
3. Group chat title should ideally include customer company name

#### **Best Practices**

- Use descriptive group chat names (e.g., "Acme Corp Support", "ClientName x YourCompany")
- The bot automatically extracts customer names from chat titles
- Only group members can create support tickets (private chats are blocked)
- Recommended for dedicated customer/partner support channels, not public community groups

### **Admin Features**

#### **Customer Management**

- Customers are automatically created from group chat names
- Duplicate prevention ensures one customer per chat
- Customer names are prefixed with `[Telegram]` for easy identification

#### **Conversation Tracking**

- Each ticket maintains complete conversation history
- Reply chains preserve context across platforms
- Message metadata includes user information and timestamps

## 📦 Manual Installation

### **Prerequisites**

- **Node.js 20+** (ES6 modules support required)
- **Yarn 1.22.22+** (package manager - npm not supported)
- **PostgreSQL 12+** (primary database)
- **Redis 6+** (optional, for enhanced performance)

> **⚠️ Package Manager Notice:** This project enforces the use of Yarn and will prevent npm installation attempts. If you try to use `npm install`, you'll receive an error message with instructions to use Yarn instead.

### **Step-by-Step Installation**

#### **1. Clone Repository**

```bash
git clone https://github.com/wgtechlabs/unthread-telegram-bot.git
cd unthread-telegram-bot
```

#### **2. Install Dependencies**

```bash
# Use Yarn only (npm not supported)
yarn install
```

#### **3. Create Telegram Bot**

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Create new bot with `/newbot` command
3. Save the bot token for environment configuration

#### **4. Setup Unthread Integration**

1. Log into your Unthread dashboard
2. Navigate to Settings → API Keys
3. Generate a new API key
4. Find your channel ID in the dashboard URL

#### **5. Database Setup**

```bash
# PostgreSQL (required)
createdb unthread_telegram_bot

# Redis (optional - for enhanced performance)
# Install Redis locally or use cloud service
```

#### **6. Environment Configuration**

```bash
# Copy example environment file
cp .env.example .env

# For Docker Compose deployment, use the Docker-specific template:
# cp .env.docker .env

# Edit .env with your configuration
nano .env
```

Required environment variables:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
POSTGRES_URL=postgresql://user:password@localhost:5432/unthread_telegram_bot
UNTHREAD_API_KEY=your_unthread_api_key
UNTHREAD_CHANNEL_ID=your_unthread_channel_id
```

Optional environment variables:

```bash
WEBHOOK_REDIS_URL=redis://localhost:6379
PLATFORM_REDIS_URL=redis://localhost:6379
COMPANY_NAME=YourCompanyName
WEBHOOK_POLL_INTERVAL=1000
```

#### **7. Start the Bot**

```bash
# Development mode (with auto-restart)
yarn dev

# Production mode
yarn start
```

### **Verification**

#### **Check Bot Status**

1. Look for successful startup logs:

   ```text
   [INFO] Database initialized successfully
   [INFO] BotsStore initialized successfully  
   [INFO] Bot initialized successfully
   [INFO] Bot is running and listening for messages...
   ```

2. Test basic functionality:
   - Add bot to a test group
   - Send `/start` command
   - Try creating a support ticket with `/support`

#### **Troubleshooting**

**Common Issues:**

- **Import errors**: Ensure you're using Yarn, not npm
- **Database connection**: Verify PostgreSQL is running and connection string is correct
- **Bot not responding**: Check bot token and ensure bot is added to group with proper permissions
- **Webhook issues**: Verify Redis connection if using webhook features

**Debug Mode:**

```bash
# Enable detailed logging
NODE_ENV=development yarn start
```

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

For security vulnerabilities, please do not report them publicly. Follow the guidelines in our [security policy](./security.md) to responsibly disclose security issues.

Your contributions to improving this project are greatly appreciated! 🙏✨

## 🎯 Contributing

Contributions are welcome, create a pull request to this repo and I will review your code. Please consider to submit your pull request to the `dev` branch. Thank you!

Read the project's [contributing guide](./contributing.md) for more info.

## 💖 Sponsors

Like this project? **Leave a star**! ⭐⭐⭐⭐⭐

There are several ways you can support this project:

- [Become a sponsor](https://github.com/sponsors/wgtechlabs) and get some perks! 💖
- [Buy me a coffee](https://buymeacoffee.com/wgtechlabs) if you just love what I do! ☕
- Deploy using the [Railway Template](https://railway.com/template/nVHIjj?referralCode=dTwT-i) which directly supports the ongoing development! 🛠️

## ⭐ GitHub Star Nomination

Found this project helpful? Consider nominating me **(@warengonzaga)** for the [GitHub Star program](https://stars.github.com/nominate/)! This recognition supports ongoing development of this project and [my other open-source projects](https://github.com/warengonzaga?tab=repositories). GitHub Stars are recognized for their significant contributions to the developer community - your nomination makes a difference and encourages continued innovation!

## 📋 Code of Conduct

I'm committed to providing a welcoming and inclusive environment for all contributors and users. Please review the project's [Code of Conduct](./code_of_conduct.md) to understand the community standards and expectations for participation.

## 📃 License

This project is licensed under the [GNU General Public License v3.0](https://opensource.org/licenses/GPL-3.0). This license ensures that the software remains free and open source, requiring that any redistributed versions also remain under the same license. See the [LICENSE](LICENSE) file for the full license text.

## 📝 Author

This project is created by **[Waren Gonzaga](https://github.com/warengonzaga)** under [WG Technology Labs](https://github.com/wgtechlabs), with the help of awesome [contributors](https://github.com/wgtechlabs/unthread-telegram-bot/graphs/contributors).

[![contributors](https://contrib.rocks/image?repo=wgtechlabs/unthread-telegram-bot)](https://github.com/wgtechlabs/unthread-telegram-bot/graphs/contributors)

---

💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏

<!-- GitAds-Verify: SKBGYTYZU867TO8VU9UB6VRLMN1V8RXA -->
