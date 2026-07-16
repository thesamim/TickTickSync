# Debug Options

The **Debug Options** tab provides tools for diagnosing sync issues.

## Debug Mode

Enable verbose logging to capture detailed plugin activity. Configure the log level to control verbosity.

## Generate Debug Info

Click **Generate** to create a snapshot of the current plugin state as a formatted JSON block. This includes:

- Plugin version, server URL, and feature toggles
- File metadata and project counts
- Sync control settings (limiting project/tag, AND/OR mode)
- Note settings

Use the copy button to copy the output to your clipboard. Include this information when [reporting a problem](https://github.com/thesamim/TickTickSync/issues) to help diagnose the issue.

## Sync Journal

The sync journal records a chronological log of every sync operation — pulls, pushes, conflicts, and errors. This is a **troubleshooting-only tool** intended for diagnosing unexpected behavior.

| Feature | Description |
|---------|-------------|
| **Journal Retention** | Set how many days to keep journal entries (1–7, default 3). Older entries are automatically pruned. |
| **View Journal** | Open a modal to browse all entries, sorted newest first |
| **Export Journal** | Download the journal as a JSON file for sharing or offline analysis |
| **Clear Journal** | Delete all journal entries to start fresh |
