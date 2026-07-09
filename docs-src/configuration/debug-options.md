# Debug Options

The **Debug Options** tab provides tools for diagnosing sync issues.

## Debug Mode

Enable verbose logging to capture detailed plugin activity. Configure the log level to control verbosity. Optionally skip backups on reload during debugging sessions.

## Sync Journal

The sync journal records a chronological log of every sync operation — pulls, pushes, conflicts, and errors. This is a **troubleshooting-only tool** intended for diagnosing unexpected behavior.

| Feature | Description |
|---------|-------------|
| **Journal Retention** | Set how many days to keep journal entries (1–7, default 3). Older entries are automatically pruned. |
| **View Journal** | Open a modal to browse all entries, sorted newest first |
| **Export Journal** | Download the journal as a JSON file for sharing or offline analysis |
| **Clear Journal** | Delete all journal entries to start fresh |
