# HudlOps

HudlOps is an internal Electron-based desktop application designed to simplify cloud access for HUDL infrastructure engineers.

Its main purpose is to launch and manage secure AWS SSM sessions with EC2 instances, without using SSH or key pairs.

---

## Features

- 🔐 SSO login with AWS IAM Identity Center
- 💻 Launch SSM sessions to EC2 without SSH keys
- 🖥️ Integrated terminal with multi-tab support
- 🧠 AWS profile and instance discovery
- ☁️ Ready to be extended with additional AWS service support (e.g. ECS, RDS)

---

## Use Case

HudlOps was built to support internal HUDL teams managing video capture infrastructure deployed on AWS.  
It allows quick access to EC2 instances running in production, test, or local environments — without the need for key-based SSH.

---

## Requirements

- AWS CLI v2 configured with SSO
- IAM Identity Center enabled profiles
- Node.js + npm + Electron