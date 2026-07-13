# Maintenance

The **Maintenance** tab provides tools for managing and troubleshooting your sync.

| Feature | Description |
|---------|-------------|
| **Manual Sync** | Force an immediate synchronization cycle |
| **Check Database** | Scan for synchronization errors or inconsistencies |
| **Backup TickTick Data** | Export all TickTick data as a CSV file |
| **Manage Deleted Tasks** | View, permanently remove, or recover deleted task records |

## Backup

Back up your TickTick data as a CSV file compatible with TickTick's **Import Backup** feature.

### Backup Folder

Choose which folder in your vault stores backup files. By default, backups are saved to the vault root.

### Skip Backup on Startup

When enabled, the plugin skips the automatic backup that normally runs when Obsidian loads.

!!! note
    TickTick limits backups to **4 per day** through the API. Use judiciously.

## Deleted Task Management

When tasks are deleted (from Obsidian or TickTick), the plugin retains a record rather than removing them immediately. This provides a safety net against accidental deletions.

### Deleted Task Retention

Set how many days to keep deleted task records before automatic cleanup (1–31, default 7).

### Permanently Delete Tasks

View all soft-deleted task records and permanently remove selected ones from the database. This cannot be undone.

### Recover Deleted Tasks

Restore deleted tasks back to their original file or a different file in your vault. Opens a modal where you can select which tasks to recover and where to place them.
