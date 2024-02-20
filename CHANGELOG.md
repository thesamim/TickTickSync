## CHANGELOG

### prelease \[1.0.3\] - 2023-11-09

Initial Beta.

TickTick API implemented.  
See Readme file for known issues.

### Beta one \[1.0.4\]

First announcement. Functionality implemented.  
See Readme file for known issues.

### Beta one \[1.0.5\]

Fixed:

1.  Projects were only being synced on start up
2.  If a task in a new project was created in TickTic, File Metadata was not being updated correctly.
3.  Task open/close update was unduly delayed.
4.  Mark as a destktop only app.

### Beta one \[1.0.6\]

Review change requests implemented. No funtionality change.

### Beta two \[1.0.7\]

Further Review Change requests implemented. No funtionality change.

### Beta three \[1.0.8\]

1.  TickTick Task description will no longer be over-written
2.  Obsidian URL added to Task Title instead of over-writing description
3.  Bi-Directional sync of Task Items
4.  Accommodate ALL versions of Task markdown.
5.  Bug Fix: ALL TickTick side modifications will sync.
6.  Only allow a Project to be default for one single file. (limitation of current task sync)
7.  Confirm ALL Task Deletes!
8.  Introduce Login flow because TickTick periodically requires a captcha login.
9.  Credentials no longer stored in data file.

### Beta four \[1.0.9\] -- \[1.0.17\]

1. Introduce support for dida365.com
2. Do not over-write Content and Items
3. Allow for Item synchronization
4. Allow limiting of synchronization to a particular project or tag
5. Allow defining a default folder for task files
6. Allow for UTF-16 characters in folders and files.
7. Clean up task deletion. Get user acknowledgement before deleting any tasks.
8. Use TickTick backup format instead of JSON
9. Place due date at end of line to allow for Dataview and Tasks querying.
10. Allow Scheduled date to be the Due Date.
11. Preserve TickTick Inbox ID
12. Allow default project to be removed from file
13. Add Project and Parent move functionality
14. Fix backlinks being removed from task
