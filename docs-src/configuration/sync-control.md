# Sync Control

## Device Identity

The **Device Identity** section shows all devices that have been used with this vault, including the current device's label and unique ID.

You can set a custom label for the current device to easily identify it. This is particularly useful when **debugging cross-device sync issues** — checking that each device has a distinct identity helps track down conflicts or unexpected behavior across desktop and mobile.

## Defaults

### Default Folder

By default, TickTickSync saves task files to the vault root (`/`). To change this, type or browse to a different folder path in settings.

When you change the default folder, a **Move Existing Files** button appears. Clicking it scans all plugin-managed files and moves those containing tasks to the new location. Only files with tasks are moved — empty or unrelated files are left in place.

If **Organize tasks by TickTick folders** is enabled (in [Task Settings](task-settings.md)), files are organized into subfolders matching your TickTick group structure.

The modal shows which files will be moved before applying changes.

### Default Project

Tasks are added to the default project associated with a file. If a file has no project association and no global default is set, tasks go to **Inbox**.

If a default project is selected here, tasks in files with no project association go to the selected project instead of Inbox.

## Limit Synchronization

Control which tasks sync between TickTick and Obsidian using a limiting **Tag** and/or **Project**.

When a limiting **Project** is set, only tasks in that project's file will be synchronized from TickTick. When a limiting **Tag** is set, only tasks with that tag (in addition to `#ticktick`) will be synchronized from TickTick.

### AND / OR Rules

Given a limiting project **LimitProject** and a limiting tag **LimitTag**:

| Project | Tag | Mode | Result |
|---------|-----|------|--------|
| LimitProject | — | — | Only tasks in LimitProject sync bi-directionally |
| — | LimitTag | — | Only tasks with LimitTag sync bi-directionally |
| LimitProject | LimitTag | AND | Only tasks **both** in LimitProject **and** tagged LimitTag sync bi-directionally |
| LimitProject | LimitTag | OR | All tasks in LimitProject **or** tagged LimitTag sync bi-directionally |

## Automatic Sync Interval

The sync interval defaults to **300 seconds** (5 minutes). Adjust this in settings as needed.

## Full Vault Sync

When enabled, the plugin automatically adds `#ticktick` to **all** tasks in your vault. This modifies every file.

!!! warning
    Full vault sync includes all task items (sub-tasks). Use with caution.
