# Troubleshooting

## 🔧 Common Issues & Solutions

### **Bot Not Responding:**

- Verify `TELEGRAM_BOT_TOKEN` is correct and active
- Check bot permissions in group chat (send messages, read messages)
- Ensure bot is not blocked or removed from the chat

### **Database Connection Issues:**

- Check `POSTGRES_URL` format and credentials
- For local development, set `DATABASE_SSL_VALIDATE=false`
- Verify PostgreSQL service is running

### **Webhook/Agent Response Issues:**

- Verify `WEBHOOK_REDIS_URL` is accessible (critical for agent responses)
- Check `UNTHREAD_WEBHOOK_SECRET` matches Unthread dashboard
- Ensure webhook server is running and accessible

### **Redis Connection Problems:**

- Verify both `PLATFORM_REDIS_URL` and `WEBHOOK_REDIS_URL` are correct
- Check Redis services are running (both required)
- For Docker: ensure Redis containers are started

### **Debug Mode:**
Enable detailed logging for troubleshooting:

```bash
LOG_LEVEL=debug
VERBOSE_LOGGING=true
```

### **Admin Access Issues:**

- Verify your Telegram user ID is in `ADMIN_USERS` environment variable
- Get your user ID from [@userinfobot](https://t.me/userinfobot)
- Use `/activate` command in private chat to enable admin features