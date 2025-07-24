# 🎯 Contribute to Unthread Telegram Bot

Any contributions are welcome, encouraged, and valued. See the following information below for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for the maintainer and smooth out the experience for all involved. The community looks forward to your contributions. 🎉✌✨

## 📋 Code of Conduct

This project and everyone participating in it is governed by the project's [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to <opensource@wgtechlabs.com>.

## 💖 How to Contribute

There are many ways to contribute to this open source project. All contributions are welcome and appreciated. Be sure to read the details of each section to get started.

### 🧬 Development

If you can write code, create a pull request to this repository and I will review your code. Please consider submitting your pull request to the `dev` branch. Pull requests to the `main` branch will be automatically rejected.

#### 🔧 Development Setup

To get started with development:

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/your-username/unthread-telegram-bot.git
   cd unthread-telegram-bot
   ```

2. **Install dependencies**

   ```bash
   yarn install
   ```

   > ⚠️ **Important**: This project enforces the use of Yarn. npm install will be blocked automatically.

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Fill in the required information as described below

   ```bash
   cp .env.example .env
   ```

4. **Start PostgreSQL and Redis**

   ```bash
   # Choose one option based on your setup
   
   # Local PostgreSQL
   brew services start postgresql     # macOS
   sudo systemctl start postgresql   # Linux
   
   # Local Redis  
   redis-server                      # Local installation
   brew services start redis         # macOS
   sudo systemctl start redis-server # Linux
   
   # Docker (recommended for development)
   docker run -d -p 5432:5432 -e POSTGRES_DB=unthread_telegram_bot -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres postgres:15-alpine
   docker run -d -p 6379:6379 redis:alpine
   ```

5. **Create Telegram Bot**
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Create new bot with `/newbot` command
   - Save the bot token for environment configuration

6. **Setup Unthread Integration**
   - Log into your Unthread dashboard
   - Navigate to Settings → API Keys
   - Generate a new API key
   - Find your channel ID in the dashboard URL

7. **Start the project in development mode**

   ```bash
   yarn dev
   ```

#### 🏗️ Development Commands

```bash
# Development with auto-reload
yarn dev

# Build for production
yarn build

# Type checking only
yarn type-check

# Clean build artifacts
yarn clean

# Start production build
yarn start

# Docker commands
yarn docker:build                    # Build Docker image
yarn docker:build:secure            # Build with security updates
yarn docker:build:sbom              # Build with SBOM generation
yarn docker:run                     # Run Docker container
yarn sbom:generate                  # Generate SBOM locally
```

#### 🏛️ Project Structure

```text
src/
├── index.ts                    # Main application entry point
├── bot.ts                      # Telegram bot initialization
├── commands/                   # Bot command handlers
│   └── index.ts
├── config/                     # Configuration files
│   └── env.ts                  # Environment configuration
├── database/                   # Database layer
│   ├── connection.ts           # PostgreSQL connection
│   └── schema.sql              # Database schema
├── events/                     # Bot event handlers
│   └── message.ts              # Message event handling
├── handlers/                   # Business logic handlers
│   └── webhookMessage.ts       # Webhook message processing
├── sdk/                        # SDK modules
│   ├── types.ts                # Shared type definitions
│   ├── bots-brain/             # Bot intelligence layer
│   │   ├── BotsStore.ts        # Bot state management
│   │   ├── index.ts
│   │   └── UnifiedStorage.ts   # Multi-layer storage
│   └── unthread-webhook/       # Webhook processing
│       ├── EventValidator.ts    # Event validation
│       ├── index.ts
│       └── WebhookConsumer.ts   # Webhook consumption
├── services/                   # External service integrations
│   └── unthread.ts             # Unthread API service
└── types/                      # TypeScript type definitions
    └── index.ts
```

#### 🎯 Development Guidelines

- **TypeScript First**: All code must be written in TypeScript with strict type checking
- **Structured Logging**: Use `@wgtechlabs/log-engine` for all logging with built-in PII protection and security features
- **Error Handling**: Implement comprehensive error handling with detailed logging
- **Package Manager**: Use Yarn exclusively (enforced via preinstall script)
- **Code Style**: Follow existing patterns and maintain consistency
- **Environment**: Use Node.js 20+ for development
- **Database**: PostgreSQL 12+ required, Redis 6+ optional but recommended
- **Multi-layer Storage**: Utilize Memory → Redis → PostgreSQL architecture
- **Webhook Integration**: Ensure compatibility with [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server)

#### 🧪 Testing Guidelines

While this project doesn't currently have a comprehensive test suite, when contributing:

- Test your changes manually with a real Telegram bot
- Verify database connectivity and schema creation
- Test Redis integration if applicable
- Ensure webhook message processing works correctly
- Test ticket creation and bidirectional communication
- Verify proper error handling for edge cases
- Test Docker deployment locally

#### 🔍 Code Review Process

1. **Pre-submission checks**:
   - [ ] Code builds without errors (`yarn build`)
   - [ ] TypeScript type checking passes (`yarn type-check`)
   - [ ] Development server starts successfully (`yarn dev`)
   - [ ] Database connection works properly
   - [ ] Bot responds to basic commands (`/start`, `/help`)
   - [ ] Ticket creation flow works end-to-end
   - [ ] Error handling is comprehensive

2. **Pull Request Requirements**:
   - [ ] Target the `dev` branch (PRs to `main` will be rejected)
   - [ ] Include clear description of changes
   - [ ] Follow existing code patterns
   - [ ] Update documentation if needed
   - [ ] Test bot functionality manually
   - [ ] Ensure Docker build succeeds

## 🏗️ Architecture & Technical Details

### 🔄 How the System Works

The **Official Unthread Telegram Bot** creates a seamless bridge between your customer/partner Telegram chats and Unthread's ticket management system through a sophisticated multi-layer architecture.

#### **📥 Ticket Creation Flow**

1. Customer uses `/support` command in dedicated group chat
2. Bot guides through interactive conversation to collect issue details
3. Bot extracts customer company name from group chat title
4. Ticket is created in Unthread with proper customer and user association
5. Confirmation message sent to user with ticket number

#### **🔄 Bidirectional Communication Architecture**

```text
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Unthread      │    │   Webhook       │    │   Redis         │    │   Telegram      │
│   Dashboard     │───▶│   Server        │───▶│   Queue         │───▶│  Bot (Official) │
│                 │    │ (wgtechlabs/    │    │ unthread-events │    │                 │
│   Agent Reply   │    │  unthread-      │    │                 │    │ Customer gets   │
│                 │    │  webhook-server)│    │                 │    │ agent message   │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Event Flow:**

1. **Agent responds** in Unthread dashboard to a ticket
2. **Unthread webhook** fires and sends event to the webhook server
3. **Webhook server** processes the event and queues it in Redis with proper formatting
4. **Telegram bot** polls the Redis queue and delivers the message to the appropriate group chat
5. **User replies** in Telegram, and the bot sends it back to Unthread API
6. **Status changes** (ticket closed/reopened) trigger real-time notifications to users

#### **💾 Multi-Layer Storage System**

```text
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Memory    │───▶│    Redis    │───▶│ PostgreSQL  │
│   (24h)     │    │   (3 days)  │    │ (permanent) │
│             │    │             │    │             │
│ Fast access │    │ Intermediate│    │ Long-term   │
│ Active conv │    │ caching     │    │ storage     │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Storage Layers:**

- **Memory Layer** (24h): Fast access for active conversations
- **Redis Layer** (3 days): Intermediate caching for recent activity  
- **PostgreSQL** (permanent): Long-term storage with full conversation history

### 🏢 Smart Customer Management

- Automatically extracts customer company names from group chat titles (e.g., "Company X Support" → "Company X")
- Creates customers in Unthread with `[Telegram]` prefix for platform identification
- Maps Telegram users to Unthread user profiles with fallback email generation
- Duplicate prevention ensures one customer per chat

### ⚙️ Configuration Requirements

#### **Required Environment Variables**

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Database Configuration  
POSTGRES_URL=postgresql://user:password@host:port/database

# Unthread API Configuration
UNTHREAD_API_KEY=your_unthread_api_key
UNTHREAD_SLACK_CHANNEL_ID=your_unthread_slack_channel_id
UNTHREAD_WEBHOOK_SECRET=your_unthread_webhook_secret
```

#### **Optional Environment Variables**

```bash
# Webhook Configuration (for real-time agent responses)
# Requires wgtechlabs/unthread-webhook-server to be deployed and configured
WEBHOOK_REDIS_URL=redis://user:password@host:port
WEBHOOK_POLL_INTERVAL=1000

# Platform Redis (for advanced caching)
PLATFORM_REDIS_URL=redis://user:password@host:port

# Company Configuration
COMPANY_NAME=YourCompany

# Development/Production
NODE_ENV=development

# SSL Configuration (see SSL Configuration Logic section below for details)
# DATABASE_SSL_VALIDATE=full    # Disable SSL completely (for Docker without SSL)
# DATABASE_SSL_VALIDATE=true    # SSL enabled, no certificate validation (dev)
# DATABASE_SSL_VALIDATE=false   # SSL enabled with certificate validation (secure)
# DATABASE_SSL_VALIDATE=        # Default: SSL enabled with certificate validation (secure)
DATABASE_SSL_VALIDATE=full
```

#### **Environment Notes**

- **Local Development**: Use `localhost` for database and Redis URLs
- **Docker Deployment**: Update URLs to use service names:
  - Database: `postgres-platform:5432`
  - Platform Redis: `redis-platform:6379`  
  - Webhook Redis: `redis-webhook:6379`
- **Production**: Set `NODE_ENV=production` and use secure connection strings
- **Enterprise**: The same `.env` file works seamlessly across all deployment methods

#### **Railway SSL Configuration**

Railway's managed PostgreSQL uses self-signed SSL certificates. The bot automatically handles this:

**Automatic Detection:**

- The bot detects Railway environment by checking for `railway.internal` in service URLs (`PLATFORM_REDIS_URL`, `WEBHOOK_REDIS_URL`, or `POSTGRES_URL`)
- When Railway is detected, SSL encryption is maintained but certificate validation is relaxed
- No manual configuration needed - works out-of-the-box

**SSL Configuration Logic:**

The SSL configuration follows this priority order:

```typescript
// 1. DATABASE_SSL_VALIDATE setting (highest priority - applies to ALL environments)
if (sslValidate === 'full') {
    return false; // Disable SSL completely + adds ?sslmode=disable
}

// 2. Railway environment detection
if (isRailwayEnvironment()) {
    return { rejectUnauthorized: false }; // Accept Railway's self-signed certs
}

// 3. Production environment  
if (isProduction) {
    return { rejectUnauthorized: true }; // Strict SSL validation
}

// 4. Development environment specific settings
if (sslValidate === 'true') {
    return { rejectUnauthorized: false }; // SSL enabled, no cert validation
}
if (sslValidate === 'false') {
    return { rejectUnauthorized: true }; // SSL enabled with cert validation
}

// 5. Default (secure by default)
return { rejectUnauthorized: true }; // SSL enabled with cert validation
```

**DATABASE_SSL_VALIDATE Options:**

| Setting | Description | Use Case |
|---------|-------------|----------|
| `full` | **Disables SSL completely** + adds `?sslmode=disable` | Local Docker, PostgreSQL without SSL |
| `true` | SSL enabled, **no certificate validation** | Development with SSL-enabled DB |
| `false` | SSL enabled, **with certificate validation** | Production with valid SSL certificates |
| *undefined* | **Secure default**: SSL enabled with validation | Production environments |

**Environment-Specific Behavior:**

- **Railway**: Always uses `{ rejectUnauthorized: false }` (unless `DATABASE_SSL_VALIDATE=full`)
- **Production**: Default to strict SSL validation (`{ rejectUnauthorized: true }`)
- **Development**: Respects `DATABASE_SSL_VALIDATE` setting, defaults to secure
- **Docker**: Use `DATABASE_SSL_VALIDATE=full` for PostgreSQL containers without SSL

**Security Notes:**

- ✅ **Secure by default**: SSL certificate validation is enabled when not explicitly configured
- ✅ **Railway compatible**: Automatically handles Railway's self-signed certificates
- ✅ **Docker friendly**: `DATABASE_SSL_VALIDATE=full` automatically adds `?sslmode=disable`
- ✅ **Production ready**: Strict SSL validation in production environments

### 🔗 Webhook Server Integration

This bot works in conjunction with the [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server) to enable real-time bidirectional communication.

#### **Integration Requirements**

- **Webhook Server**: Included in Docker Compose setup using [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server)
- **Shared Redis**: The `redis-webhook` service is shared between webhook server and bot
- **Queue Names**: Both webhook server and bot use the standard queue name `unthread-events`
- **Network**: All services communicate via `unthread-integration-network`

For standalone webhook server setup, see the [`wgtechlabs/unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server) repository.

### 🔗 Webhook Server Integration Requirements

This bot works in close integration with the [`unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server). When modifying user-related functionality, developers **must** consider the webhook server's platform detection logic.

#### **Critical Integration Points:**

**Username Format Validation:**

- The webhook server uses `event.data.botName` for platform detection
- Names starting with `@` are classified as **Telegram platform**
- Names without `@` are classified as **Dashboard origin**

**Required Format Compatibility:**

```typescript
// ✅ CORRECT - Detected as Telegram platform
"Waren Gonzaga (@warengonzaga)"
"@warengonzaga"  

// ✅ ACCEPTABLE - Detected as Dashboard origin
"Waren Gonzaga"
"User 123456"

// ❌ AVOID - May cause misclassification
"waren.user"
"Waren-@-warengonzaga"
```

**Implementation Reference:**

- **Bot Code**: `src/services/unthread.ts` → `createUserDisplayName()` function
- **Webhook Server**: [`src/services/webhookService.ts#L118-L144`](https://github.com/wgtechlabs/unthread-webhook-server/blob/main/src/services/webhookService.ts#L118-L144)

**Testing Requirements:**

When modifying username-related code, verify:

1. ✅ Username formats pass webhook server validation
2. ✅ Platform detection works correctly  
3. ✅ Analytics and monitoring remain accurate
4. ✅ Event routing functions properly

## 🏗️ Installation & Deployment

### 📦 Manual Installation

#### **Prerequisites**

- **Node.js 20+** (ES6 modules support required)
- **Yarn 1.22.22+** (package manager - npm not supported)
- **PostgreSQL 12+** (primary database)
- **Redis 6+** (optional, for enhanced performance)

> **⚠️ Package Manager Notice:** This project enforces the use of Yarn and will prevent npm installation attempts. If you try to use `npm install`, you'll receive an error message with instructions to use Yarn instead.

#### **Step-by-Step Installation**

1. **Clone Repository**

   ```bash
   git clone https://github.com/wgtechlabs/unthread-telegram-bot.git
   cd unthread-telegram-bot
   ```

2. **Install Dependencies**

   ```bash
   # Use Yarn only (npm not supported)
   yarn install
   ```

3. **Database Setup**

   ```bash
   # PostgreSQL (required)
   createdb unthread_telegram_bot

   # Redis (optional - for enhanced performance)
   # Install Redis locally or use cloud service
   ```

4. **Environment Configuration**

   ```bash
   # Copy example environment file
   cp .env.example .env

   # Edit .env with your configuration
   nano .env
   ```

5. **Start the Bot**

   ```bash
   # Development mode (with auto-restart)
   yarn dev

   # Production mode
   yarn start
   ```

#### **Verification**

1. **Check Bot Status**
   Look for successful startup logs:

   ```text
   [INFO] Database initialized successfully
   [INFO] BotsStore initialized successfully  
   [INFO] Bot initialized successfully
   [INFO] Bot is running and listening for messages...
   ```

2. **Test Basic Functionality**
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

### 🐳 Docker Deployment

The bot includes a production-ready Docker setup that uses the same `.env` configuration as local development.

#### **Docker Prerequisites**

- Docker installed on your system
- Docker Compose (comes with Docker Desktop)
- Copy `.env.example` to `.env` and configure your environment variables

#### **Environment Configuration**

Before building the Docker image, create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit the `.env` file and configure the required variables as described in the environment configuration section above.

#### **Building and Running**

##### Method 1: Using Docker Compose (Recommended)

Start your application with all dependencies:

```bash
docker compose up -d
```

This will build and start:

- **Bot server** (`server`) - The main Telegram bot application
- **Webhook server** (`unthread-webhook-server`) - Handles Unthread webhooks on port 3000
- **PostgreSQL** (`postgres-platform`) - Database for the bot on port 5432  
- **Redis Platform** (`redis-platform`) - Redis for bot operations on port 6379
- **Redis Webhook** (`redis-webhook`) - Shared Redis for webhook communication on port 6380

All services run on the `unthread-integration-network` for seamless communication.

##### Method 2: Using Docker Commands

Build the Docker image:

```bash
docker build -t unthread-telegram-bot .
# or use the yarn script
yarn docker:build
```

Run the container:

```bash
docker run --env-file .env unthread-telegram-bot
# or use the yarn script
yarn docker:run
```

#### **Production Deployment**

##### Building for Different Architectures

If deploying to a different CPU architecture (e.g., from Mac M1 to Linux amd64):

```bash
docker build --platform=linux/amd64 -t unthread-telegram-bot .
```

##### Pushing to Registry

Tag and push your image to a container registry:

```bash
docker tag unthread-telegram-bot your-registry.com/unthread-telegram-bot:latest
docker push your-registry.com/unthread-telegram-bot:latest
```

#### **Docker Features**

- **Multi-stage build** for optimized image size (217MB)
- **Non-root user** for enhanced security  
- **Alpine Linux** base for minimal attack surface
- **Build caching** for faster subsequent builds
- **Enterprise-ready** with best practices
- **SBOM generation** for supply chain security

#### **Docker Troubleshooting**

- Ensure all required environment variables are set in your `.env` file
- Check service logs: `docker-compose logs <service-name>`
  - Bot: `docker-compose logs server`
  - Webhook: `docker-compose logs unthread-webhook-server`
  - Database: `docker-compose logs postgres-platform`
  - Redis: `docker-compose logs redis-platform redis-webhook`
- Verify your Telegram bot token is valid
- Test webhook server health: `curl http://localhost:3000/health`
- Ensure the `unthread-integration-network` exists: `docker network ls`

## � Advanced Logging Security with Log Engine

This project uses [`@wgtechlabs/log-engine`](https://github.com/wgtechlabs/log-engine) for enterprise-grade logging with built-in security features and comprehensive PII protection.

### 🔒 **Automatic Security Features**

**Zero Configuration PII Protection:**

- **Automatic Redaction**: Passwords, tokens, emails, API keys, and 50+ sensitive patterns are automatically protected
- **Deep Object Scanning**: Recursively scans nested objects and arrays for sensitive data
- **Content Truncation**: Large payloads are automatically truncated to prevent log bloat
- **Environment-Based Control**: Security automatically adapts based on NODE_ENV settings

**Built-in Patterns Protected:**

- **Authentication**: `password`, `token`, `apiKey`, `secret`, `jwt`, `auth`, `sessionId`
- **Personal Info**: `email`, `phone`, `ssn`, `firstName`, `lastName`, `address`
- **Financial**: `creditCard`, `cvv`, `bankAccount`, `routingNumber`
- **System**: `clientSecret`, `privateKey`, `webhookSecret`, `telegramToken`

### 🛡️ **Advanced Security Configuration**

**Custom Enterprise Protection:**

```javascript
import { LogEngine } from '@wgtechlabs/log-engine';

// Add custom patterns for enterprise-specific data
LogEngine.addCustomRedactionPatterns([
  /internal.*/i,        // Matches any field starting with "internal"
  /company.*/i,         // Matches any field starting with "company"
  /telegram.*/i,        // Matches telegram-specific fields
  /unthread.*/i         // Matches unthread-specific fields
]);

// Add dynamic sensitive field names
LogEngine.addSensitiveFields([
  'webhookSecret', 
  'telegramBotToken', 
  'unthreadApiKey',
  'redisPassword'
]);
```

**Secure Logging Examples:**

```javascript
// ✅ Automatic protection - no configuration needed
LogEngine.info('Bot authentication', {
  botId: '123456789',           // ✅ Visible
  botToken: 'bot123:secret',    // ❌ [REDACTED]
  webhookUrl: 'https://...',    // ✅ Visible
  webhookSecret: 'secret123'    // ❌ [REDACTED]
});

// ✅ Customer data protection
LogEngine.info('Ticket creation', {
  ticketId: 'TKT-001',          // ✅ Visible
  customerId: 'customer123',    // ✅ Visible
  customerEmail: 'user@co.com', // ❌ [REDACTED]
  issueTitle: 'Login problem',  // ✅ Visible
  apiKey: 'key_123'            // ❌ [REDACTED]
});

// ✅ Webhook processing security
LogEngine.info('Webhook received', {
  eventType: 'message.reply',   // ✅ Visible
  signature: 'sha256=...',      // ❌ [REDACTED]
  payload: { /* large data */ } // Automatically truncated
});
```

### ⚙️ **Environment Configuration**

**Production Security (Recommended):**

```bash
NODE_ENV=production           # Full PII protection enabled
LOG_REDACTION_TEXT="[SECURE]" # Custom redaction text
LOG_MAX_CONTENT_LENGTH=150    # Truncate large content
```

**Development Debugging:**

```bash
NODE_ENV=development          # Redaction disabled for debugging
LOG_REDACTION_DISABLED=true   # Explicit disable
DEBUG_FULL_PAYLOADS=true      # Show complete data
```

**Custom Security Configuration:**

```bash
# Custom sensitive fields (comma-separated)
LOG_SENSITIVE_FIELDS="telegramToken,unthreadSecret,redisPassword"

# Custom redaction patterns (JSON array)
LOG_CUSTOM_PATTERNS='["/internal.*/i", "/company.*/i"]'

# Truncation settings
LOG_MAX_CONTENT_LENGTH=200
LOG_TRUNCATION_TEXT="... [CONFIDENTIAL_TRUNCATED]"
```

### 🔧 **Development & Debugging**

**Raw Logging for Development:**

```javascript
// ⚠️ Use with caution - bypasses all redaction
LogEngine.debugRaw('Full webhook payload', {
  password: 'visible',          // ⚠️ Visible (not redacted)
  apiKey: 'full-key-visible'    // ⚠️ Visible (not redacted)
});

// Temporary redaction bypass
LogEngine.withoutRedaction().info('Debug mode', sensitiveData);

// Test field redaction
const isRedacted = LogEngine.testFieldRedaction('telegramToken'); // true
const currentConfig = LogEngine.getRedactionConfig();
```

### 📊 **Logging Benefits for This Bot**

**Security Compliance:**

- **GDPR Ready**: Automatic PII protection for European compliance
- **Data Minimization**: Only necessary data is logged
- **Audit Trails**: Complete security event logging with timestamps
- **Incident Response**: Quick identification of security events

**Operational Benefits:**

- **Color-Coded Output**: Easy visual identification of log levels (🔵 INFO, 🟡 WARN, 🔴 ERROR)
- **Structured Logging**: Consistent format across all bot components
- **Performance Optimized**: Minimal overhead with intelligent processing
- **TypeScript Support**: Full type safety and IDE integration

## �🛡️ Supply Chain Security

This project implements comprehensive supply chain security measures to ensure transparency and security compliance.

### 🔒 What We've Implemented

#### **1. SBOM Generation in CI/CD**

Our GitHub Actions workflows automatically generate Software Bills of Materials (SBOMs):

**Development builds** (`.github/workflows/build.yml`):

- Generates SBOM in SPDX format
- Creates build provenance attestations
- Attaches metadata to container images

**Production releases** (`.github/workflows/release.yml`):

- Full SBOM generation for multi-architecture builds
- Enhanced provenance with build environment details
- Vulnerability scanning with Trivy

#### **2. Docker Build Configuration**

Updated Docker builds include:

```yaml
sbom: true                 # Generate Software Bill of Materials
provenance: mode=max       # Maximum provenance attestation details
```

#### **3. Local SBOM Generation**

For development and security audits:

```bash
# Generate SBOM for local builds
yarn sbom:generate

# Build with SBOM locally
yarn docker:build:sbom
```

#### **4. Security Scanning**

Integrated Trivy vulnerability scanner:

- Scans container images for known vulnerabilities
- Uploads results to GitHub Security tab
- Provides SARIF output for analysis

### 🔍 Verification

#### **Inspect Image Attestations**

```bash
# View all attestations
docker buildx imagetools inspect wgtechlabs/unthread-telegram-bot:latest

# View SBOM specifically
docker buildx imagetools inspect wgtechlabs/unthread-telegram-bot:latest \
  --format "{{ json .SBOM.SPDX }}"

# View provenance
docker buildx imagetools inspect wgtechlabs/unthread-telegram-bot:latest \
  --format "{{ json .Provenance }}"
```

#### **Using Cosign (Optional)**

For additional verification with Cosign:

```bash
# Install cosign
curl -O -L "https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64"
sudo mv cosign-linux-amd64 /usr/local/bin/cosign
sudo chmod +x /usr/local/bin/cosign

# Verify attestations
cosign verify-attestation --type spdx wgtechlabs/unthread-telegram-bot:latest
```

### 📋 SBOM Contents

Our SBOM includes:

**Base Image Components:**

- **Alpine Linux 3.21** packages and security updates
- System libraries and utilities
- Certificate authorities

**Runtime Dependencies:**

- **Node.js 22 LTS** runtime
- Production npm packages (see `package.json`)
- Transitive dependencies with version pinning

**Build Dependencies:**

- TypeScript compiler and toolchain
- Development dependencies (excluded from final image)
- Build-time utilities

**Application Code:**

- Source code fingerprints
- License information (GPL-3.0)
- Authorship and contribution details

### 🎯 Benefits

**For Security Teams:**

- **Vulnerability tracking**: Know exactly what's in your containers
- **License compliance**: Automatic license detection and reporting
- **Supply chain visibility**: Complete dependency graph
- **Incident response**: Quick identification of affected components

**For DevOps Teams:**

- **Automated generation**: No manual SBOM creation required
- **CI/CD integration**: Built into existing workflows
- **Multi-format support**: SPDX, CycloneDX compatibility
- **Registry integration**: Attestations stored with images

**For Compliance:**

- **NIST guidance compliance**: Follows NIST SP 800-218 recommendations
- **Executive Order 14028**: Meets federal SBOM requirements
- **Industry standards**: SPDX 2.3 and SLSA provenance
- **Audit trail**: Complete build and dependency history

### 🔧 Troubleshooting Supply Chain Security

**SBOM Not Found:**

```bash
# Check if buildx supports SBOM
docker buildx version

# Ensure BuildKit backend
export DOCKER_BUILDKIT=1

# Rebuild with explicit SBOM flag
docker build --sbom=true -t unthread-telegram-bot .
```

**Missing Attestations:**

```bash
# Check registry support
docker buildx imagetools inspect <image> --format "{{ json . }}"

# Use GitHub Container Registry (better attestation support)
docker pull ghcr.io/wgtechlabs/unthread-telegram-bot:latest
```

**CI/CD Issues:**

- Ensure secrets are configured: `DOCKER_HUB_USERNAME`, `DOCKER_HUB_ACCESS_TOKEN`
- Check BuildKit version in GitHub Actions
- Verify registry supports attestations

### 📚 Resources

- [NIST SP 800-218: Secure Software Development Framework](https://csrc.nist.gov/Publications/detail/sp/800-218/final)
- [SPDX Specification](https://spdx.github.io/spdx-spec/)
- [SLSA Provenance](https://slsa.dev/provenance/)
- [Docker Scout Documentation](https://docs.docker.com/scout/)
- [BuildKit SBOM Support](https://docs.docker.com/build/attestations/sbom/)

### 📖 Documentation

Improvements to documentation are always welcome! This includes:

- README updates
- Code comments
- API documentation
- Configuration examples
- Troubleshooting guides
- Fixing typos or clarifying existing documentation

### 🐞 Reporting Bugs

For any security bugs or issues, please create a private security advisory through GitHub's security advisory feature or follow the guidelines in our [security policy](./SECURITY.md).

For other bugs, please create an issue with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node.js version, PostgreSQL version, Redis version, OS)
- Relevant logs or error messages
- Bot configuration (without sensitive information)

### 💡 Feature Requests

We welcome suggestions for new features! Please create an issue with:

- Clear description of the feature
- Use case and benefits
- Any implementation considerations
- Examples or mockups if applicable
- Integration considerations with Unthread API

---

💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com), [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏
