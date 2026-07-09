# Getting Started

## Configuration

1. Open Obsidian **Settings**
2. Go to **Community plugins** → **Installed plugins**
3. Click the gear icon next to **TickTickSync**
4. Click **Login** to authorize with your TickTick or Dida account

## First Sync

Once logged in:

1. The plugin will automatically start syncing tasks marked with `#ticktick`
2. TickTick lists (projects) will appear as `.md` files in your vault
3. Tasks from those lists will be downloaded into their respective files

## Your First Synced Task

Create a task anywhere in your vault:

```markdown
- [ ] Buy groceries #ticktick
```

After the sync interval elapses (or you trigger manual sync), this task will appear in your TickTick Inbox.

## Key Concepts

- **`#ticktick`** — Tasks must have this tag to be synced
- **Projects** — TickTick lists are called "Projects" in the plugin
- **Default Folder** — Where synced task files are stored (configurable in settings)
- **Default Project** — Where tasks go if no project is specified

## Things to Know

- TickTick only has four priority levels (High, Medium, Low, None). See [Task Format](task-format.md) for the mapping.
- Deleting a task file in Obsidian while the plugin is active will delete those tasks from TickTick (with confirmation).
- The plugin automatically creates `.md` files for each TickTick project/list.
