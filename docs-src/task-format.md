# Task Format

## Syntax Reference

| Component | Description | Example |
|-----------|-------------|---------|
| `#ticktick` | Required tag to enable syncing | `- [ ] task #ticktick` |
| `📅 YYYY-MM-DD` | Due date | `- [ ] task 📅 2025-02-05 #ticktick` |
| `🛫 YYYY-MM-DD` | Start / Scheduled date | `- [ ] task 🛫 2025-02-01 📅 2025-02-05 #ticktick` |
| `#projectTag` | Assigns task to a TickTick project/list | `- [ ] task #work #ticktick` |
| Priority emoji | See priority table below | `- [ ] task ⏫ #ticktick` |
| `⏰ relative` | Reminder relative to the task time (see [Reminders](#reminders)) | `- [ ] task ⏰ 30m #ticktick` |

### Supported Calendar Emojis

Due dates support the following emojis: `📅` `📆` `🗓` `🗓️`

## Priority Mapping

TickTick has three priority levels, mapped to the [Obsidian Tasks](https://publish.obsidian.md/tasks/) format as follows:

| TickTick | Obsidian |
|----------|----------|
| None (0) | (none) / `⏬` |
| Low (1) | `🔽` |
| Medium (3) | `🔼` |
| High (5) | `⏫` / `🔺` |

## Project Tags

New tasks are added to the **Inbox** by default. To assign a task to a specific TickTick project, use a tag matching the project name:

```markdown
- [ ] Task in default project #ticktick
- [ ] Task in Work project #Work #ticktick
- [ ] Task in Personal project #Personal #ticktick
```

!!! tip "Projects with spaces"
    Tags can't contain spaces. Use underscores: `#folder_with_a_space` will be converted to `folder with a space` in TickTick.

## Task Examples

### Task with Sub-tasks

```markdown
- [ ] Parent Task #ticktick
    - [ ] Sub Task 1 #ticktick
    - [ ] Sub Task 2 #ticktick
```

### Task with Items

```markdown
- [ ] Parent Task #ticktick
    - Item 1
    - Item 2
```

### Task Ignored

```markdown
- [ ] This task will not sync — it has no #ticktick tag
```

## Date/Time Handling

### Time Representation

When a task has a due date or start date with a time:

**Single date with time:**
```markdown
- [ ] [10:00] Task text [link] #ticktick 📅 2024-12-02
```

**Two dates (start + due) with times:**
```markdown
- [ ] [10:00 - 11:00] Task text [link] #ticktick 📅 2024-12-05 🛫 2024-12-02
```

!!! note
    TickTick only has a **Start Date** field (not separate Start and Scheduled dates). If you use both, the Start Date takes priority for TickTick's field. The Scheduled Date is preserved but not reflected in TickTick.

### Editing Times

You can edit either the time in brackets or directly after the date:

```markdown
- [ ] [10:00 - 17:00] Task text #ticktick 📅 2024-12-05 🛫 2024-12-02
```

After sync, the task will reflect the new time.

## Recurrence

Recurrence follows the [Obsidian Tasks Plugin](https://publish.obsidian.md/tasks/) format using the `🔁` emoji:

```markdown
- [ ] Water plants 🔁 every week on Monday #ticktick
- [ ] Pay rent 🔁 every month on the 1st when done #ticktick
```

These are converted to and from TickTick's RRULE format automatically.

!!! warning "TickTick proprietary features"
    TickTick supports custom recurrence properties (e.g., `TT_SKIP=WEEKEND` for skipping weekends) that have no equivalent in the Obsidian Tasks format. These are silently stripped during sync since they can't be represented in markdown.

## Reminders

Reminders are set with the `⏰` (alarm clock) emoji followed by a relative duration — relative to the task's time. They are converted to and from TickTick's reminder format automatically.

```markdown
- [ ] Call the dentist ⏰ 30m #ticktick
- [ ] Pay rent ⏰ 1d #ticktick
- [ ] Ship report ⏰ 0m #ticktick
- [ ] Multiple reminders ⏰ 1h ⏰ 1d #ticktick
```

### Duration Shorthand

| Shorthand | Meaning |
|-----------|---------|
| `0m` | On time (fires when the task is due) |
| `30m` | 30 minutes before |
| `1h30m` | 1 hour 30 minutes before |
| `1d` | 1 day before |
| `1w` | 1 week before |

ISO 8601 durations (e.g., `⏰ PT30M`) are also accepted on input, but lines are rewritten to the shorthand above when TickTick data is written back to the vault.

### Rules

- **Relative to the task time only** — absolute clock times (e.g., `⏰ 09:00`) are not supported. When the task has no time, the reminder is relative to the due date.
- **Multiple `⏰` tokens** add multiple reminders.
- **`⏰ off` clears all reminders** for the task (written to TickTick as an empty reminder list).
- **No `⏰` at all means "leave reminders as-is"** — existing TickTick reminders are preserved, so editing the task text in Obsidian won't wipe reminders you set in the app.
- Absolute date-time reminder triggers (e.g., a specific timestamp set in the TickTick app) have no markdown equivalent and are omitted from the line.
- **Placement** — `⏰` is written *before* the priority, recurrence, and date emojis. The Obsidian Tasks plugin reads a task line from the end backwards and stops at unrecognized text, so trailing custom emojis would make the signifier emojis unreadable:
  ```markdown
  - [ ] Call the dentist ⏰ 30m ⏫ 📅 2026-08-15 #ticktick
  ```

!!! warning "All-day tasks and the TickTick web interface"
    TickTick's web interface silently deletes reminders on all-day tasks when you edit them. Reminders you set in Obsidian will be lost if the task is later edited in the web UI — even if the edit has nothing to do with reminders. The TickTick mobile and desktop apps do not have this issue.


