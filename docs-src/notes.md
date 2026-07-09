# Notes

Notes attached to tasks are synchronized automatically between TickTick and Obsidian.

## Note Rules

1. A note starts on the line following its containing task
2. The note content is indented **two spaces** more than the task
3. A separator line appears above and below the note content (configurable)
4. If a task has items, items follow the note

### Examples

**Task with just a note:**

```markdown
- [ ] Task with a Note #ticktick
  -------------------------------------------------------------
  # A Note
  This is the note content.
  -------------------------------------------------------------
```

**Task with items and a note:**

```markdown
- [ ] Task with Items and a Note #ticktick
  -------------------------------------------------------------
  With items, the note appears before them.
  -------------------------------------------------------------
    - [ ] First Item
    - [ ] Second Item
```

## Note Separator

The note separator (the line of dashes) is configurable in settings. You can choose your own delimiter string or disable it entirely.

!!! tip "Starting a new note"
    You can start a note simply by indenting the next line after a task by two spaces — you don't need to type the delimiter manually.

## Note Synchronization

Note synchronization is **enabled by default**. To disable it, go to **Settings → Notes** and toggle it off.

!!! note
    Markdown is supported in TickTick, but TickTick's markdown implementation differs from Obsidian's. TickTickSync sends and receives text as-is without attempting to reconcile differences.
