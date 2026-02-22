---
title: "AI Provider Management"
description: "Authentication providers — Google OAuth and credentials-based sign-in for Mission Control."
---

# AI Provider Management

Connect your AI provider API keys to Archon and let the smart router pick the best model for every job, automatically.

## Supported Providers

| Provider | Models | Best for |
|---|---|---|
| **OpenAI** | GPT-4o, GPT-4o mini, GPT-5 Codex | Coding, general tasks |
| **Anthropic** | Claude Haiku, Sonnet, Opus | Research, writing, analysis |
| **xAI (Grok)** | Grok 4, Grok 4 Fast | Fast reasoning |
| **OpenRouter** | 200+ models via one key | Multi-model fallback |
| **MiniMax** | ABAB 6.5s | Cost-efficient tasks |
| **Kimi (Moonshot AI)** | Moonshot v1 8k/32k | Long-context tasks |
| **Gemini** | Gemini 2.0 Flash, Pro | Multimodal, large context |

All providers are optional. Add as many or as few as you need. The smart router only picks from providers you've configured.

## Adding Providers (Setup Wizard)

The easiest way is to run through the setup wizard at `/dashboard/connect`.

**Step 3, Add your AI keys:**
1. Paste your API key for each provider you want to use
2. Keys can be left blank to skip a provider
3. At least one key required to continue
4. Click **Save & continue**

Keys are saved securely in your account settings and synced to the on-device AiPipe smart router immediately.

**Getting your keys:**
- OpenAI → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Anthropic → [console.anthropic.com](https://console.anthropic.com)
- xAI → [console.x.ai](https://console.x.ai)
- OpenRouter → [openrouter.ai/keys](https://openrouter.ai/keys)
- MiniMax → [api.minimax.chat](https://api.minimax.chat)
- Kimi → [platform.moonshot.cn](https://platform.moonshot.cn)
- Gemini → [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

## Configuring Agent Roles (Setup Wizard Step 6)

Each navi-ops agent role has a pre-configured default model. You can override any role to use a different model from your connected providers.

**Step 6, Configure your AI team:**

| Role | Default | What it does |
|---|---|---|
| Architect | claude-sonnet-4-6 | System design & planning |
| Planner | claude-sonnet-4-6 | Story breakdown & specs |
| Code Agent | gpt-5.3-codex | Implementation work |
| TDD Guide | gpt-5.3-codex | Test writing & red-green-refactor |
| Code Reviewer | claude-opus-4 | Pre-merge review |
| Security Reviewer | claude-sonnet-4-6 | Auth, tenant & input security |
| Build Error Resolver | gpt-5.3-codex | Fix build & type failures |
| Doc Updater | claude-opus-4 | Phase 5 docs gate |
| E2E Runner | claude-sonnet-4-6 | Regression & smoke tests |
| Refactor Cleaner | gpt-5.3-codex | Post-feature cleanup |

Your selections are saved to your account and used by the autonomous dev loop.

## Updating Keys Later

Go to `/dashboard/connect` and run through the wizard again, or update individual keys directly. Any change to provider keys is synced to the smart router immediately.

## Cost Tracking

Once your keys are connected and requests flow through AiPipe, the **⚡ Router** tab on your dashboard shows:
- Total requests routed
- Cost per provider and model
- Estimated savings vs routing everything to GPT-4o
- Your personal stats (isolated from other users)

## Privacy

Your API keys are stored encrypted at rest in Archon's database and synced only to the AiPipe instance running on your server. They are never shared, logged in plaintext, or sent to third parties beyond the AI providers themselves.
