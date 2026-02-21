---
title: "Getting Started"
---

# Getting Started

Get Mission Control running in under 10 minutes.

---

## 1. Create your account

Go to [archonhq.ai](https://archonhq.ai) and sign in with Google. Your account is created automatically on first sign-in.

---

## 2. Run the Connection Wizard

After signing in, you'll land on the dashboard. Click **Connect** in the sidebar (or navigate to `/dashboard/connect`) to open the Connection Wizard.

The wizard walks you through 8 steps:

| Step | What you set up |
|------|----------------|
| 1 | Welcome, overview of what you're connecting |
| 2 | Gateway, connect your local OpenClaw gateway |
| 3 | AI provider keys, OpenAI, Anthropic, and others |
| 4 | Smart routing, enable AiPipe for automatic model selection |
| 5 | AI team, assign agents to your workspace |
| 6 | Agent roles, configure which model each agent role uses |
| 7 | Notifications, connect Telegram for alerts |
| 8 | Done, review and activate |

You can skip steps and return later. The wizard saves progress as you go.

---

## 3. Connect the gateway

The gateway is a lightweight process that runs on your machine (or server) and relays agent activity to the Mission Control dashboard.

If you're using OpenClaw, the gateway is already running. Check its status:

```bash
openclaw gateway status
```

In Step 2 of the wizard, enter your gateway URL (typically `http://localhost:18789`). Mission Control will verify the connection before proceeding.

---

## 4. Add at least one AI provider key

In Step 3 of the wizard, add an API key for at least one provider:

- **OpenAI**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic**: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- **Google Gemini**: [aistudio.google.com](https://aistudio.google.com) (free tier available)
- **xAI (Grok)**: **OpenRouter**: **MiniMax**: **Kimi**: optional

Keys are stored per-tenant and never shared between accounts.

---

## 5. Enable smart routing

In Step 4, toggle **Enable Smart Routing**. This activates AiPipe, which automatically routes each request to the most cost-effective model capable of handling it.

With a single OpenAI key, AiPipe routes simple tasks to `gpt-4o-mini` and complex tasks to `gpt-4o`. With both OpenAI and Anthropic keys, it also routes high-complexity reasoning tasks to Claude Sonnet when it offers better quality per dollar.

[Learn how routing works →](/docs/features/aipipe-routing-benchmark)

---

## 6. Create your first task

Click the **+** button on the kanban board or use the keyboard shortcut `N`. Give the task a title, set a priority, and optionally assign it to an agent or goal.

The task appears in the **Backlog** column. Drag it to **In Progress** when work starts.

---

## 7. Set up notifications (optional)

In Step 7 of the wizard, enter your Telegram chat ID and bot token to receive alerts when:
- A task is created or changes status
- A critical task becomes blocked
- An agent encounters an error

[Set up Telegram notifications →](/docs/features/notifications)

---

## You're done

Your dashboard is live. Agents connected to the gateway will appear in the Agents tab. Tasks they create via the API show up on the board automatically.

---

## What's next

- [Day-to-day workflow →](/docs/guides/how-to-use)
- [Kanban board features →](/docs/features/kanban-board)
- [AI routing deep-dive →](/docs/features/aipipe-routing-benchmark)
- [API reference →](/docs/api-reference/overview)
