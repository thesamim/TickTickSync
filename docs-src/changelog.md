# Changelog
!!! tip "If TickTickSync provides value."
    <a href='https://ko-fi.com/O0C12398ZK' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

## Notable Changes

### 1.1.7 → 2.0.1 { #2.0.1 }

- Complete re-architecture for better cross-device handling
- General performance improvements
- **Recurrence processing** 
- **Task display visibility controls** — custom rendering for TickTick tasks in reading & edit mode 
- **Granular link hiding** for TickTick tasks in reading & edit mode
- **Sync journal persisted to Dexie**, with modal viewer 
- **Device identity & tracking** — mobile device ID capture, device naming in settings
- **Project preservation** — follow TickTick project folder structure
- **Orphan task detection** modal, **found duplicate tasks** modal
- **Conflict resolution** logging 
- **Access control / SSO 2FA login** improvements
- **Soft-delete task lifecycle** — auto-cleanup of deleted tasks after configurable retention period (default 7 days), manual permanent deletion, recovery, 
- **Tag handling overhaul** — case-sensitivity respected, sub-tags handled correctly.
- **Case-insensitive project matching** (via normalized dashes)
- **Task file stickiness on sync** — tasks stay associated with their source file across syncs

### 1.1.15 → 1.1.16 — Note Handling Improvements { #1.1.16 }

- Notes can now contain checklist items and TickTick task links
- To start a new note, just indent the line after the task by two spaces — no need to type delimiters

### 1.1.11 → 1.1.14 — Desktop SSO / 2FA Login { #1.1.14 }

- Desktop users with SSO or 2FA can now log in via a web browser
- Mobile still requires regular login, but can use the session authenticated from desktop

### 1.1.9 → 1.1.10 — Several Enhancements { #1.1.10 }

- Tasks created in a file stay in that file when updated from TickTick (fixes duplicate task issues)
- Backup settings moved to Manual Operations section
- Note separator is now configurable (custom delimiter or none)
- New note separator option for DataView compatibility

### 1.1.7 → 1.1.8 — Configurable Task Links { #1.1.8 }

- Links between Obsidian and TickTick can now be configured: **No Link**, **Link in Task**, or **Link in Description**

### 1.1.1 → 1.1.7 — Note & Default Project Settings { #1.1.7 }

- Note synchronization is now optional (toggle in settings)
- Default project settings fixed: updates from TickTick no longer misplace tasks in files without project associations

### 1.0.40 → 1.1.1 — Note Synchronization { #1.1.1 }

- Notes are now synchronized between TickTick and Obsidian
- Markdown formatting is preserved

### 1.0.36 → 1.0.40 — New Date/Time Handling { #1.0.40 }

- Start/Scheduled date, Due date, Creation date, Completed date, and Cancelled date are all treated as distinct fields
- Date times are now preserved across syncs
- Old date formats are converted automatically on next sync
- Time representation uses `[hh:mm]` syntax in task lines

### Prior to 1.0.36 — New Task Limiting Rules { #1.0.36 }

- Introduced AND/OR limiting rules for tag + project combinations
- Tasks tagged `#ticktick` always upload to TickTick
- Limiting project and/or tag control which tasks sync from TickTick to Obsidian

