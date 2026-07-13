# Notes

## Note Synchronization

Note synchronization is **enabled by default**. To disable it, go to **Settings → Notes** and toggle it off.

!!! warning "Link limitation"
    When note sync is **disabled**, task links can only be added to the task text itself or not at all — the **Link in Description** option becomes unavailable.

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

The note separator (the line of dashes) is configurable in settings. You can choose any delimiter string or disable it entirely.

!!! warning "Obsidian parsing"
    The separator is rendered by Obsidian's markdown parser. Depending on what you choose, Obsidian may interpret it differently. For example, three or more dashes (`---`) are treated as a [horizontal rule](https://obsidian.md/help/syntax#Horizontal+rule). Choose a delimiter that avoids unintended rendering in your notes.

!!! tip "Tasks plugin compatibility"
    If you use the [Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks), the separator affects how notes are displayed in reading mode. See [this discussion](https://github.com/obsidian-tasks-group/obsidian-tasks/issues/2061) for details on how different separators behave.

!!! tip "Starting a new note"
    You can start a note simply by indenting the next line after a task by two spaces — you don't need to type the delimiter manually.

!!! note
    Markdown is supported in TickTick, but TickTick's markdown implementation differs from Obsidian's. TickTickSync sends and receives text as-is without attempting to reconcile differences.

## Reset Tasks


The **Reset Tasks** button performs a full synchronization pass to update Tasks to conform to new settings.

!!! warning
    This operation can take some time depending on the number of tasks. Use only when you suspect the sync state has become inconsistent.
