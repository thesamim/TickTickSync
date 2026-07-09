# Task Format

## Syntax Reference

| Component | Description | Example |
|-----------|-------------|---------|
| `#ticktick` | Required tag to enable syncing | `- [ ] task #ticktick` |
| `📅 YYYY-MM-DD` | Due date | `- [ ] task 📅 2025-02-05 #ticktick` |
| `🛫 YYYY-MM-DD` | Start / Scheduled date | `- [ ] task 🛫 2025-02-01 📅 2025-02-05 #ticktick` |
| `#projectTag` | Assigns task to a TickTick project/list | `- [ ] task #work #ticktick` |
| Priority emoji | See priority table below | `- [ ] task ⏫ #ticktick` |

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
