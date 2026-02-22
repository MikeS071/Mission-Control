---
title: "Connection Wizard"
description: "8-step guided wizard to connect your OpenClaw gateway, AI providers, and configure agents."
---

# Connection Wizard

The Connection Wizard configures your Mission Control workspace in 8 guided steps. It handles everything from gateway connection to AI provider keys to agent role assignment.

Access it at **Settings → Connect** or navigate to `/dashboard/connect`.

## Step 1: Welcome

An overview of what you're about to configure. No input required.

## Step 2: Gateway

Connects Mission Control to your local OpenClaw gateway, the bridge between your agents and the cloud dashboard.

**Gateway URL**: typically `http://localhost:18789` if running locally. Enter the full URL including port.

Mission Control sends a ping to verify the connection before you can proceed. If the ping fails:
- Check that the gateway is running: `openclaw gateway status`
- Ensure the URL is reachable from the browser (same machine or network)
- Check firewall rules if running on a remote server

## Step 3: AI Provider Keys

Add API keys for the providers you want to use. At least one key is required to enable AI routing.

| Provider | Where to get a key | Notes |
|----------|-------------------|-------|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Required for gpt-4o and gpt-4o-mini |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | Required for Claude Haiku, Sonnet, Opus |
| Google Gemini | [aistudio.google.com](https://aistudio.google.com) | Free tier available |
| xAI (Grok) | [console.x.ai](https://console.x.ai) | Optional |
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | Routes to 200+ models |
| MiniMax | [minimax.io](https://minimax.io) | Optional |
| Kimi (Moonshot) | [moonshot.cn](https://www.moonshot.cn) | Optional |

Keys are stored in AiPipe's isolated per-tenant store and never logged or exposed to other tenants.

**Recommendation:** start with OpenAI + Anthropic. This gives AiPipe two providers to route between, unlocking the full cheap-vs-quality routing profile. Add Gemini for the cheapest possible tier on simple tasks.

## Step 4: Smart Routing

Enables AiPipe, the routing layer that automatically selects the best model per request.

Toggle **Enable Smart Routing** to on. This:
- Activates the AiPipe proxy for all AI calls through Mission Control
- Syncs your provider keys from Step 3 to AiPipe's routing store
- Enables per-tenant cost tracking

When smart routing is off, Mission Control uses a single configured model for all requests. When on, routing is automatic and adaptive.

[Learn how routing works →](/docs/features/ai-routing)

## Step 5: AI Team

Assign agents to your workspace. Each agent entry has:
- **Name**: how this agent appears in the dashboard
- **Role**: architect, coder, reviewer, etc. (used for display only in this step)
- **Description**: optional notes

Agents don't need to be listed here to connect, any agent with a valid gateway token can connect. This step is for labelling and organising the agents you expect to use.

## Step 6: Agent Roles

Assigns a specific LLM model to each navi-ops agent role. AiPipe uses these assignments when a request includes a role header.

Default assignments (pre-filled):

| Role | Default model |
|------|--------------|
| architect | claude-sonnet-4-5 |
| planner | claude-sonnet-4-5 |
| code-agent | gpt-5.3-codex |
| tdd-guide | gpt-5.3-codex |
| code-reviewer | claude-opus-4-5 |
| security-reviewer | claude-sonnet-4-5 |
| build-error-resolver | gpt-5.3-codex |
| doc-updater | claude-opus-4-5 |
| e2e-runner | claude-sonnet-4-5 |
| refactor-cleaner | gpt-5.3-codex |

Override any assignment using the dropdown. Changes take effect immediately, no restart required.

## Step 7: Notifications

Connects Telegram for push notifications when tasks change state.

**Bot token**: create a bot via [@BotFather](https://t.me/BotFather) on Telegram and paste the token here.

**Chat ID**: your Telegram user ID or group chat ID. Send `/start` to [@userinfobot](https://t.me/userinfobot) to find your user ID.

Once configured, Mission Control sends a message to your chat when:
- A task is created
- A task moves to Review or Done
- A task is deleted
- A critical task is created

Test the connection with the **Send test notification** button before saving.

## Step 8: Done

Review your configuration summary and click **Activate**. All settings are saved to your tenant profile.

You can return to the wizard at any time to update keys, change models, or reconfigure notifications. Changes to provider keys in Step 3 automatically sync to AiPipe within 60 seconds.

## Updating settings later

All wizard settings are also available at **Settings** in the main dashboard navigation. You don't need to re-run the full wizard to change a single setting.
