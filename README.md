# Unthread Telegram Bot 🎫🤖 [![made by](https://img.shields.io/badge/made%20by-WG%20Tech%20Labs-0060a0.svg?logo=github&longCache=true&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs) [![official](https://img.shields.io/badge/official-Unthread%20Extension-FF5241.svg?logo=telegram&logoColor=white&labelColor=181717&style=flat-square)](https://unthread.com)

[![release workflow](https://img.shields.io/github/actions/workflow/status/wgtechlabs/unthread-telegram-bot/release.yml?style=flat-square&logo=github&label=release&labelColor=181717)](https://github.com/wgtechlabs/unthread-telegram-bot/actions/workflows/release.yml) [![build workflow](https://img.shields.io/github/actions/workflow/status/wgtechlabs/unthread-telegram-bot/build.yml?branch=dev&style=flat-square&logo=github&labelColor=181717&label=build)](https://github.com/wgtechlabs/unthread-telegram-bot/actions/workflows/build.yml) [![sponsors](https://img.shields.io/badge/sponsor-%E2%9D%A4-%23db61a2.svg?&logo=github&logoColor=white&labelColor=181717&style=flat-square)](https://github.com/sponsors/wgtechlabs) [![version](https://img.shields.io/github/release/wgtechlabs/unthread-telegram-bot.svg?logo=github&labelColor=181717&color=default&style=flat-square&label=version)](https://github.com/wgtechlabs/unthread-telegram-bot/releases) [![star](https://img.shields.io/github/stars/wgtechlabs/unthread-telegram-bot.svg?&logo=github&labelColor=181717&color=yellow&style=flat-square)](https://github.com/wgtechlabs/unthread-telegram-bot/stargazers) [![license](https://img.shields.io/github/license/wgtechlabs/unthread-telegram-bot.svg?&logo=github&labelColor=181717&style=flat-square)](https://github.com/wgtechlabs/unthread-telegram-bot/blob/main/license)

[![banner](https://raw.githubusercontent.com/wgtechlabs/unthread-telegram-bot/main/.github/assets/repo_banner.jpg)](https://github.com/wgtechlabs/unthread-telegram-bot)

**Official Unthread Extension** - The Unthread Telegram Bot is the official integration that connects your customer and partner Telegram chats with Unthread's comprehensive ticket management system. Create and manage support tickets directly within dedicated Telegram groups, with real-time bidirectional communication between your team and clients.

This bot is designed for businesses managing customer support through private Telegram groups or dedicated partner channels - optimized for professional support workflows rather than public community groups.

> **🔄 Upgrading from v1.0.0-beta.x?** Check our comprehensive [Migration Guide](./MIGRATION.md) for step-by-step instructions on breaking changes and new features.

## 📖 Documentation

Comprehensive documentation is organized into focused guides:

- **[📋 Overview](./docs/overview.md)** - How It Works & Key Features
- **[🚀 Installation Guide](./docs/installation.md)** - Complete Setup Guide with deployment options
- **[🕹️ Usage Guide](./docs/usage.md)** - User Guide, Commands & Workflows
- **[🔧 Troubleshooting](./docs/troubleshooting.md)** - Common Issues & Solutions
- **[🏗️ Architecture](./docs/architecture.md)** - Technical Details & System Architecture
- **[🛡️ Security & Supply Chain](./docs/security.md)** - Security Features & Best Practices

## 🚀 Quick Start

Ready to get started? Here's the fastest way to deploy your bot:

1. **Get Bot Token**: Message [@BotFather](https://t.me/botfather) → `/newbot`
2. **Get User ID**: Message [@userinfobot](https://t.me/userinfobot) (required for admin access)
3. **[One-Click Deploy on Railway](https://railway.com/deploy/unthread-telegram-bot?referralCode=dTwT-i)** 
4. **Configure Environment**: Add your tokens and user ID to the Railway environment
   > ⚠️ **Important**: While Railway provides one-click deployment, you must supply the required environment variables (bot token, user ID, API keys) to make the bot functional.
5. **Test**: Add bot to a group and try `/support`

For detailed setup instructions, Docker deployment, and manual installation, see the complete [Installation Guide](./docs/installation.md).

## 🤗 Special Thanks

### 🤝 Partner Organizations

These outstanding organizations partner with us to support our open-source work:

<!-- markdownlint-disable MD033 -->
| <div align="center">💎 Platinum Sponsor</div> |
|:-------------------------------------------:|
| <a href="https://unthread.com"><img src="https://raw.githubusercontent.com/wgtechlabs/unthread-discord-bot/main/.github/assets/sponsors/platinum_unthread.png" width="250" alt="Unthread"></a> |
| <div align="center"><a href="https://unthread.com" target="_blank"><b>Unthread</b></a><br/>Streamlined support ticketing for modern teams.</div> |
<!-- markdownlint-enable MD033 -->

## 💬 Community Discussions

Join our community discussions to get help, share ideas, and connect with other users:

- 📣 **[Announcements](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/announcements)**: Official updates from the maintainer
- 📸 **[Showcase](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/showcase)**: Show and tell your implementation
- 💖 **[Wall of Love](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/wall-of-love)**: Share your experience with the bot
- 🛟 **[Help & Support](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/help-support)**: Get assistance from the community
- 🧠 **[Ideas](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/ideas)**: Suggest new features and improvements

## 🛟 Help & Support

Need help? Check our [Help & Support](https://github.com/wgtechlabs/unthread-telegram-bot/discussions/categories/help-support) discussions, review the [Documentation](./docs/), or [create a new issue](https://github.com/wgtechlabs/unthread-telegram-bot/issues/new/choose).

For security vulnerabilities, follow our [security policy](./SECURITY.md).

## 🎯 Contributing

**Important**: All pull requests must be submitted to the `dev` branch. PRs to `main` will be automatically rejected.

Contributions are welcome! Your code must pass `yarn build` and `yarn type-check` before merging.

For detailed setup instructions, development guidelines, and security practices, see our comprehensive [Contributing Guide](./CONTRIBUTING.md).


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
