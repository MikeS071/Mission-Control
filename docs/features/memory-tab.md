---
title: "Memory Tab"
description: "Workspace file browser with live hot-reload, create, and delete for markdown files."
---

# Memory Tab

The Memory tab gives you direct access to workspace markdown files from inside Mission Control — view, edit, create, and delete without leaving the dashboard.

## Opening a file

Click any file in the left sidebar to open it. Markdown files (`.md`) open in a rich editor. JSON, YAML, and text files open as read-only with syntax-appropriate display.

## Live hot-reload

When a file is open, Mission Control polls the server every 3 seconds and updates the editor automatically.

- **● live** (green) — the file on disk matches what you're viewing; auto-refreshing
- **● unsaved** (amber) — you have local edits; the poll skips overwriting your changes until you save

Hitting **Save** writes your changes to disk and resets the indicator back to `● live`.

## Creating a file

1. Click **+ New file** at the top of the sidebar
2. Type a filename — `.md` is appended automatically if omitted
3. Press **Enter** to create (or **Escape** to cancel)

The new file is created with empty content, appears in the file tree, and opens immediately for editing.

Only `.md` files can be created. If the filename maps outside the workspace directory, the request is rejected.

## Deleting a file

1. Hover any `.md` file in the sidebar — an **×** button appears on the right
2. Click **×** — the row switches to an inline confirmation: *Delete filename.md? yes / no*
3. Click **yes** to delete permanently; **no** to dismiss

If the deleted file was open, the editor clears and the live-reload poll stops.

Non-`.md` files (JSON, YAML) cannot be deleted from the UI.

## Supported file types

| Extension | Editable | Deletable |
|---|---|---|
| `.md` | ✅ | ✅ |
| `.json` | Read-only | ❌ |
| `.yaml` / `.yml` | Read-only | ❌ |
| `.txt` | Read-only | ❌ |
