# Moving Tasks

## Moving a Task in TickTick

Drag and drop the task between projects/lists.

- If the target project is assigned to a default file, the task moves to that file in your vault
- If the target project has no file assignment, the task moves to the global default file

## Moving a Task in Obsidian

Cut and paste the task between files.

- If the target file has a default project, the task moves to that project in TickTick
- If the target file has no default project, the task moves to the global default project
- If neither is assigned, the task moves to **Inbox**

## Changing Task Hierarchy

Move tasks between parent-child relationships (e.g., converting a task to a sub-task or vice versa). All hierarchy changes are reflected after the next synchronization cycle.

## Override Project with Tags

You can override a task's project by adding a tag whose name matches a TickTick project. This takes priority over the file's default project.

**Underscores as spaces:** If the project name contains spaces, use underscores in the tag. For example, `#well_this_is_new` targets the project **Well this is new**.

**Hierarchy tags:** Dashes in tags (`-`) are treated as hierarchy separators. To match a project with spaces, always use underscores, not dashes.

**How it works:**
- **New tasks:** The tag is detected during creation, and the task is created directly in the matched TickTick project.
- **Existing tasks:** Adding or changing a project-matching tag on an existing task triggers a project move on TickTick. The vault file is *not* moved — the task stays in its current file. A subsequent sync will not move it either (stickiness).

**Example:** A task with `- [ ] Pick up groceries #this_is_really_FUBAR #ticktick` targets the **This is really FUBAR** project.

## Set a Default Project Per File

You can assign a specific TickTick project to each file:

1. Open the command palette
2. Run the **Set Default Project** command
3. Choose the project from the modal

The current file's default project is shown in the status bar at the bottom right corner.
