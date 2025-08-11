# Installation Guide

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
   # Prerequisites: Node.js >=20.0.0 and Yarn >=1.22.22
   node --version  # Should be v20.0.0 or higher
   yarn --version  # Should be 1.22.22 or higher

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

## 📋 Required Configuration

The `.env` setup is seamless across local development, Docker, and production environments, with consistent service name conventions for Docker.

Edit your `.env` file with these required values:

```bash
# Required - Get from BotFather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Required - Admin Users (CRITICAL for bot configuration)
ADMIN_USERS=123456789,987654321  # Your Telegram user ID(s) from @userinfobot

# Optional but HIGHLY RECOMMENDED - Your bot's username for 200x performance boost
BOT_USERNAME=your_bot_username  # Eliminates API calls for deep links and commands

# Required - Get from Unthread dashboard
UNTHREAD_API_KEY=your_unthread_api_key
UNTHREAD_SLACK_CHANNEL_ID=your_unthread_slack_channel_id
UNTHREAD_WEBHOOK_SECRET=your_unthread_webhook_secret
SLACK_TEAM_ID=your_slack_workspace_id  # Required for file attachment downloads

# Required - Database (Docker will handle this automatically)
POSTGRES_URL=postgresql://postgres:postgres@postgres-platform:5432/unthread_telegram_bot

# Required - Redis for bot operations (Docker will handle this automatically)
WEBHOOK_REDIS_URL=redis://redis-webhook:6379  # Critical for agent response delivery
PLATFORM_REDIS_URL=redis://redis-platform:6379  # Required for bot state management

# Optional - Company and email configuration
MY_COMPANY_NAME=Your Company Name  # Company name for ticket attribution
DUMMY_EMAIL_DOMAIN=telegram.user  # Default email domain for auto-generated emails

# Optional - Debug and logging configuration
LOG_LEVEL=info  # Set to 'debug' for detailed troubleshooting
VERBOSE_LOGGING=false  # Set to 'true' for verbose webhook logging

# Optional - Database SSL validation (set to false for local development)
DATABASE_SSL_VALIDATE=true  # Set to false for local PostgreSQL connections
```

> **⚠️ CRITICAL**: The `ADMIN_USERS` variable is required for bot configuration. Without it, no one can set up group chats or manage the bot. Get your Telegram user ID from [@userinfobot](https://t.me/userinfobot).
>
> **💡 Pro Tip**: The Docker setup includes PostgreSQL and Redis automatically - no separate installation needed!

## 🛤️ Railway Deployment

For detailed information about Railway's managed PostgreSQL and SSL handling, please refer to the Railway Deployment section.

- ✅ **Environment Override**: Railway detection takes precedence over all other SSL settings
- ✅ **No Configuration**: Works out-of-the-box without manual SSL setup

> **🔒 Security Note**: Railway's self-signed certificates are secure within their managed infrastructure. The bot maintains SSL encryption while accommodating Railway's certificate setup.