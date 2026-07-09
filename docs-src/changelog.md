# Changelog

## Notable Changes

### 1.1.15 → 1.1.6 — Note Handling Improvements

- Notes can now contain checklist items and TickTick task links
- To start a new note, just indent the line after the task by two spaces — no need to type delimiters

### 1.1.11 → 1.1.4 — Desktop SSO / 2FA Login

- Desktop users with SSO or 2FA can now log in via a web browser
- Mobile still requires regular login, but can use the session authenticated from desktop

### 1.1.9 → 1.1.10 — Several Enhancements

- Tasks created in a file stay in that file when updated from TickTick (fixes duplicate task issues)
- Backup settings moved to Manual Operations section
- Note separator is now configurable (custom delimiter or none)
- New note separator option for DataView compatibility

### 1.1.7 → 1.1.8 — Configurable Task Links

- Links between Obsidian and TickTick can now be configured: **No Link**, **Link in Task**, or **Link in Description**

### 1.1.1 → 1.1.7 — Note & Default Project Settings

- Note synchronization is now optional (toggle in settings)
- Default project settings fixed: updates from TickTick no longer misplace tasks in files without project associations

### 1.0.40 → 1.1.1 — Note Synchronization

- Notes are now synchronized between TickTick and Obsidian
- Markdown formatting is preserved

### 1.0.36 → 1.0.40 — New Date/Time Handling

- Start/Scheduled date, Due date, Creation date, Completed date, and Cancelled date are all treated as distinct fields
- Date times are now preserved across syncs
- Old date formats are converted automatically on next sync
- Time representation uses `[hh:mm]` syntax in task lines

### Prior to 1.0.36 — New Task Limiting Rules

- Introduced AND/OR limiting rules for tag + project combinations
- Tasks tagged `#ticktick` always upload to TickTick
- Limiting project and/or tag control which tasks sync from TickTick to Obsidian
