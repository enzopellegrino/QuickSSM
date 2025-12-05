# QuickSSM 🚀

<p align="center">
  <img src="src/logo.png" alt="QuickSSM Logo" width="200"/>
</p>

<p align="center">
  <strong>Fast and Beautiful AWS Session Manager for EC2 Instances</strong>
</p>

---

## ✨ Features

- 🖥️ **Multi-Instance Management**: Connect to multiple EC2 instances simultaneously
- 🔍 **Smart Search**: Quickly find instances by name or ID
- 📋 **Bulk Operations**: Select multiple instances and connect with one click  
- 🎨 **Beautiful UI**: Dark mode with modern design
- ⚡ **Fast & Lightweight**: Built with Electron for native performance
- 🔐 **AWS SSO Support**: Full integration with AWS SSO and IAM profiles
- 📊 **Profile Management**: Easy AWS profile discovery and configuration

## 📋 Requirements

- **macOS**: 10.15 (Catalina) or later
- **AWS CLI v2**: Required for SSM sessions
- **AWS Account**: With proper IAM permissions for SSM

## 🔧 Installation

### 1. Install AWS CLI v2

```bash
# Using Homebrew
brew install awscli

# Verify installation
aws --version
```

### 2. Install QuickSSM

Download the latest `QuickSSM.dmg` from [Releases](https://github.com/enzopellegrino/QuickSSM/releases)

## 🚀 Quick Start

1. Configure AWS SSO: `aws configure sso`
2. Launch QuickSSM
3. Select profile and region
4. Connect to your instances!

## 📖 Full Documentation

See [DISTRIBUTION.md](DISTRIBUTION.md) for build and distribution details.

## 👤 Author

**Enzo Pellegrino**  
Created at Footage IT @ Hudl

## 📝 License

MIT License

---

<p align="center">Made with ❤️ by Enzo Pellegrino</p>
