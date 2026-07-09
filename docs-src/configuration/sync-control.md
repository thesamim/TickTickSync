# Sync Control

## Default Folder

By default, TickTickSync saves task files to the vault root (`/`). To change this, type or browse to a different folder path in settings.

## Default Project

Tasks are added to the default project associated with a file. If a file has no project association and no global default is set, tasks go to **Inbox**.

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
