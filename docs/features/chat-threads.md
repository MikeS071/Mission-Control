---
title: "Chat Threads"
description: "Multiple chat threads per tenant with a thread picker in the Mission Control chat panel."
---

# Chat Threads

Mission Control supports multiple chat threads per tenant. Threads let you keep separate conversations (e.g. “Sprint planning”, “Bug triage”, “Provisioning”) without losing context.

## How it works

- Each tenant has one or more **threads**.
- The Chat panel shows a **thread picker** at the top.
- Switching threads swaps the message history and live stream to that thread.

## UI controls

In the Chat panel header:

- **Dropdown**: select an existing thread
- **+**: create a new thread and auto-select it
- **Rename**: rename the current thread
- **Delete**: delete the current thread (with confirmation)

If a tenant has no threads, Mission Control creates a default thread named **“Main”**.

## Real-time behavior

- New messages are delivered over the chat WebSocket.
- The UI de-dupes messages so you don’t see duplicates if the WebSocket delivers a message before the HTTP response returns.
- After sending a message, the UI will auto-scroll to the assistant reply unless you scroll up while waiting.
