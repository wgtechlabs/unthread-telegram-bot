# Technical Architecture

## 🔍 Advanced Logging & Security

### **Powered by @wgtechlabs/log-engine**

The bot includes enterprise-grade logging with advanced security features:

- **🔒 PII Redaction** - Automatically redacts sensitive information from logs
- **📊 Structured Logging** - JSON-structured logs for better analysis
- **🛡️ SBOM Generation** - Software Bill of Materials for supply chain transparency
- **📋 Build Provenance** - Attestations for build security and verification

### **Environment Variables for Debugging**

```bash
# Enable debug logging
LOG_LEVEL=debug

# Enable verbose logging for detailed troubleshooting
VERBOSE_LOGGING=true

# Production logging (default)
LOG_LEVEL=info
```

### **SBOM Generation**

Generate Software Bill of Materials for security analysis:

```bash
# Generate SBOM locally
bun run sbom:generate

# Docker build with SBOM and provenance
bun run docker:build:sbom
```

## 🔗 System Architecture & Integration

### **Webhook Server Integration**

This bot works in conjunction with the [`unthread-webhook-server`](https://github.com/wgtechlabs/unthread-webhook-server) for complete bidirectional communication:

- **Webhook Server**: Receives events from Unthread dashboard and routes them to the bot
- **Bot Service**: Handles Telegram interactions and creates tickets in Unthread
- **Platform Detection**: Smart username formatting ensures proper event classification

### **Username Format Compatibility**

The bot implements a sophisticated username format that ensures seamless integration:

```typescript
// Format Priority for Unthread Dashboard Display:
"Waren (@warengonzaga)"    // ✅ Best UX - detected as Telegram platform
"@warengonzaga"            // ✅ Minimal - detected as Telegram platform  
"Waren Gonzaga"            // ✅ Fallback - detected as Dashboard origin
"User 784879963"           // ✅ Legacy - detected as Dashboard origin
```

**Integration Benefits:**

- ✅ **Proper Analytics**: Webhook server correctly classifies events by platform
- ✅ **Enhanced Monitoring**: Clear distinction between bot vs dashboard activities
- ✅ **Audit Compliance**: Complete traceability of user interactions
- ✅ **Event Routing**: Accurate downstream processing and workflow automation

**Technical Reference:** [Webhook Server Platform Detection Logic](https://github.com/wgtechlabs/unthread-webhook-server/blob/main/src/services/webhookService.ts#L118-L144)

## 🛡️ Security & Supply Chain

This project implements comprehensive supply chain security measures including:

- **SBOM generation** for all container images
- **Build provenance attestations** for transparency
- **Automated vulnerability scanning** with Trivy
- **Multi-layer security** from development to production

For complete security documentation, see the [Contributing Guide](../CONTRIBUTING.md#-supply-chain-security).