---
title: "Notifications"
---

# Notifications

Mission Control sends push notifications to Telegram when tasks change state. You stay informed without watching the dashboard.

---

## Setup

1. **Create a Telegram bot**: open [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts. BotFather gives you a token like `8525328702:AAHaHTU...`

2. **Find your chat ID**: send `/start` to [@userinfobot](https://t.me/userinfobot) on Telegram. It replies with your numeric user ID (e.g. `1556514337`).

3. **Enter both in the wizard**: go to the Connection Wizard → Step 7, paste your bot token and chat ID, and click **Save**.

4. **Test**: click **Send test notification**. You should receive a message in Telegram within a few seconds.

---

## What triggers a notification

| Event | Notification |
|-------|-------------|
| Task created (critical priority) | ✅ Yes |
| Task created (high/medium/low) | ✅ Yes |
| Task moved to Review | ✅ Yes |
| Task moved to Done | ✅ Yes |
| Task deleted | ✅ Yes |
| Task updated (title, description) | ❌ No (too noisy) |
| Agent connected | ❌ No |

---

## Notification format

Each message includes:
- Event type (Created / Status changed / Deleted)
- Task title
- Priority level
- New status (where applicable)
- Timestamp

Example:
```
✅ Task moved to Done
"Implement rate limiting on /api/tasks"
Priority: High
archonhq.ai/dashboard
```

---

## Group chats

You can send notifications to a Telegram group rather than a DM. Add your bot to the group, then use the group's chat ID (starts with `-100...`) instead of your personal ID.

Find a group chat ID by adding [@userinfobot](https://t.me/userinfobot) to the group and sending `/start`.

---

## Disabling notifications

Toggle notifications off in **Settings → Notifications** or clear the bot token field and save. No messages will be sent until you re-configure.

---

## Troubleshooting

**No test message received:**
- Verify the bot token is correct (no extra spaces)
- Confirm you've started a conversation with your bot (send it `/start` directly)
- Check the chat ID is correct, user IDs are positive numbers, group IDs start with `-100`

**Messages stop arriving:**
- Telegram bots can be blocked if the user blocks the bot. Unblock via Telegram settings
- The bot token may have been revoked, generate a new one via BotFather
