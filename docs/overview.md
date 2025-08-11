# Overview

## 🤔 How It Works

The **Official Unthread Telegram Bot** creates a seamless bridge between your customer/partner Telegram chats and Unthread's ticket management system.

### **📥 Ticket Creation**

- Customers and partners in dedicated group chats can create support tickets using the `/support` command
- The bot guides them through a simple conversation to collect issue summary and email (optional)
- Tickets are automatically created in Unthread with proper customer and user association

### **🔄 Bidirectional Communication**

- **Agent → Customer**: When agents respond via the Unthread dashboard, messages are delivered to Telegram in real-time
- **Customer → Agent**: Customers can simply reply to agent messages naturally - no special commands needed
- **📎 Image Attachments**: Bidirectional image sharing support (up to 10MB)
  - Send images from Telegram directly to agents (JPEG, PNG, GIF, WebP, etc.)
  - Receive agent images automatically in Telegram with proper formatting
  - Smart image processing with thumbnail generation and format validation
- **Status Notifications**: Receive real-time notifications when ticket status changes with clear messaging and emoji indicators
- **Conversation Flow**: Maintains complete conversation history across both platforms

### **🏢 Smart Customer Management**

- Automatically extracts customer company names from group chat titles (e.g., "Company X Support" → "Company X")
- Creates customers in Unthread with `[Telegram]` prefix for platform identification
- Maps Telegram users to Unthread user profiles with fallback email generation

## ✨ Key Features

- **🎫 Ticket Management** - Create tickets with `/support` • **👤 Email Setup** - One-time email collection
- **💬 Real-Time Messaging** - Bidirectional communication • **📎 Image Attachments** - Share images up to 10MB
- **🏢 Smart Detection** - Auto-extract customer names • **✅ Status Alerts** - Real-time notifications
- **🔒 Enterprise Security** - Advanced logging & PII redaction • **⚡ Easy Deploy** - Docker & Railway ready
- **🛠️ Template System** - Customizable messaging • **🛡️ Supply Chain** - SBOM & provenance tracking