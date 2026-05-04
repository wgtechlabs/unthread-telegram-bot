# 🔄 Migration Guide

> **Upgrading from Beta to v1.0.0 (Major Release)**

If you're upgrading from an earlier beta version, there are **important breaking changes** that require environment configuration updates. This guide will help you migrate smoothly to the stable major release.

## ⚠️ Breaking Changes Summary

### **New Required Environment Variables:**

- `ADMIN_USERS` - Telegram user IDs for bot administration (CRITICAL)

### **Variable Changes:**

- `COMPANY_NAME` → `MY_COMPANY_NAME` (renamed)
- Enhanced validation prevents placeholder values

## 📋 Pre-Migration Checklist

Before starting the migration, gather these details:

1. **Get Your Telegram User ID** *(NEW REQUIREMENT)*
   - Message [@userinfobot](https://t.me/userinfobot) on Telegram
   - Copy your numeric user ID (e.g., `123456789`)
   - **CRITICAL**: Without this, you cannot configure bot groups!

2. **Get Your Bot Username** *(OPTIONAL - Performance Boost)*
   - Check your bot's profile or @BotFather settings
   - Copy the username without @ symbol (e.g., `mycompanybot`)
   - **BENEFIT**: Eliminates 200+ API calls, makes deep links instant

3. **Backup Current Configuration**

   ```bash
   # Backup your current .env file
   cp .env .env.backup
   ```

## 🚀 Migration Steps

### Step 1: Update Environment Variables

Add these **required** variables to your existing `.env` file:

```bash
# 🚨 CRITICAL - Add this NEW REQUIRED variable:
ADMIN_USERS=123456789,987654321  # Your Telegram user ID(s) from @userinfobot

# 🚀 OPTIONAL - Performance optimization:
BOT_USERNAME=your_bot_username  # Your bot's username (without @)

# 🔄 RENAME - Update existing variable:
MY_COMPANY_NAME=Your Company Name  # Was previously COMPANY_NAME

# ✨ NEW OPTIONAL - Email domain configuration:
DUMMY_EMAIL_DOMAIN=telegram.user  # Default email domain for auto-generated emails
```

### Step 2: Remove Old Variables

```bash
# Remove this old variable (now renamed):
# COMPANY_NAME=...  # Remove this line
```

### Step 3: Validate Configuration

The new version includes enhanced validation. Ensure no placeholder values remain:

```bash
# ❌ These will be REJECTED:
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMIN_USERS=your_telegram_user_id_here
MY_COMPANY_NAME=your_company_name_here

# ✅ Use actual values:
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
ADMIN_USERS=123456789,987654321
MY_COMPANY_NAME=Acme Corporation
```

## 🐳 Docker & Railway Specific Migration

### **For Docker Users:**

```bash
# Ensure Redis services are running:
PLATFORM_REDIS_URL=redis://redis-platform:6379
WEBHOOK_REDIS_URL=redis://redis-webhook:6379

# Update docker-compose if needed
docker-compose down
docker-compose up -d
```

### **For Railway Users:**

```bash
# Update Railway environment variables:
ADMIN_USERS=123456789,987654321
BOT_USERNAME=your_bot_username
MY_COMPANY_NAME=Your Company Name
PLATFORM_REDIS_URL="redis://redis-platform:6379"  # For BotsStore
WEBHOOK_REDIS_URL="redis://redis-webhook:6379"  # For webhook consumer
```

## 🧪 Testing Your Migration

### Step 1: Test Bot Startup

```bash
# Check if bot starts without errors:
bun run start

# Look for these success messages:
# ✅ Environment configuration validated successfully
# ✅ Configured 1 bot administrator(s)
# 🚀 Running in production mode
```

### Step 2: Test Admin Access

1. Start a private chat with your bot
2. Send `/activate` command
3. Should receive: "✅ Admin privileges activated!"

### Step 3: Test Group Setup

1. Add bot to a test group
2. Run `/setup` command in the group
3. Complete setup in private DM

### Step 4: Test Support Flow

1. Create a test ticket with `/support`
2. Verify email collection works
3. Check agent response delivery

## ❌ Common Migration Issues

### Issue 1: Bot Won't Start

```bash
Error: Missing required environment variables: ADMIN_USERS
```

**Solution**: Add your Telegram user ID to `ADMIN_USERS`

### Issue 2: Placeholder Values Detected

```bash
Error: ADMIN_USERS contains placeholder values
```

**Solution**: Replace with actual numeric user IDs

### Issue 3: Agent Responses Not Working

```bash
Error: Redis connection failed
```

**Solution**: Ensure Redis is running and both URLs are configured correctly

### Issue 4: Admin Commands Not Working

```bash
Error: Insufficient permissions
```

**Solution**: Use `/activate` command in private chat first

## 🔧 Rollback Plan

If migration fails, you can quickly rollback:

```bash
# Restore backup configuration:
cp .env.backup .env

# Or use git to revert to previous version:
# List available version tags:
git tag --list
# Then checkout your previous version, e.g.:
git checkout v0.9.x
```

## ✨ New Features After Migration

Once successfully migrated, you'll have access to:

- **🛡️ Enhanced Security**: Admin-only bot configuration
- **⚡ Performance Boost**: 200x faster with BOT_USERNAME
- **📧 Email Management**: User email preferences with `/viewemail` and `/setemail`
- **🎨 Template System**: Customizable message templates
- **📊 Advanced Logging**: Enterprise-grade logging with PII redaction

## 🆘 Need Help?

If you encounter issues during migration:

1. **Check Common Issues** section above
2. **Review the logs** with `LOG_LEVEL=debug`
3. **Join our community**: [GitHub Discussions](https://github.com/wgtechlabs/unthread-telegram-bot/discussions)
4. **Create an issue**: [Report a Bug](https://github.com/wgtechlabs/unthread-telegram-bot/issues/new/choose)

---

💻 **Migration Guide** by [WG Technology Labs](https://wgtechlabs.com) 🚀