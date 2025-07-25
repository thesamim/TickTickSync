## CHANGELOG

### 1.1.12

FIX: case where syncNotes and taskLinksInNote conflicted
Chore: Add syncnotes settings to debug dump
Chore: alter tab-content setting because thino messes it up.
closes 281

### 1.1.11

Fix list rename bug.
Add settings improvements.

### 1.1.10

Handle TickTick list rename.
Add Custom seperators for Notes
Add Save Location for backup files.

### 1.1.9

Improve default project ID handling
Refactor task file and synchronization logic. 

### 1.1.8

Feature: Configure Links addition settings.

### 1.1.7

Fix default project handling.

### 1.1.6

Feature: allow disabling of Notes Sync
Feature: Shiny new tabbed interface for settings

### 1.1.5

Fix Due Date update

### 1.1.4

Fix incorrect detection of 1200 time in 24 hour format

### 1.1.3

Full Vault sync Fixes.

### 1.1.2

Fix issue with invalid line detection.

### 1.1.1

Note Synchronization introduced.

### 1.0.41

Fix issue with Mobile Login
Fix issue with Hash checking on Mobile

### 1.0.40
See [New Date/Time handling](https://github.com/thesamim/TickTickSync/wiki/Notable-Changes#changes-from-1036-to-1040----new-datetime-handling) for details.
Slight performance improvement.

### 1.0.36
Keep forgetting to update the change log. Here's everything since the last update. 
**Full Changelog**: https://github.com/thesamim/TickTickSync/compare/1.0.20...1.0.36

### Beta six \[1.0.20\]

1. Fix API headers in requests per TickTick protocol change.
2. Improve first login experience to prevent default folder/project issues

### Beta five \[1.0.18\] -- \[1.0.19\]

1. TickTickSync is now mobile compatible
2. Remove dependency on ticktick-api-lvt, migrate all API code to TickTickSync source tree
3. Fix issue with non en-US date/time representation causing parsing errors
4. Prevent unwanted task moves between files
5. Prevent duplication of tasks
6. Warn on duplicate tasks. Prevent syncing if there are any
7. Correct status checking
8. Correct status changing
9. Prevent task deletion on false positive of content disappearing.
10. Rationalize error handling.


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

### Beta two \[1.0.7\]

Further Review Change requests implemented. No funtionality change.

### Beta one \[1.0.6\]

Review change requests implemented. No funtionality change.

### Beta one \[1.0.5\]

Fixed:

1.  Projects were only being synced on start up
2.  If a task in a new project was created in TickTic, File Metadata was not being updated correctly.
3.  Task open/close update was unduly delayed.
4.  Mark as a destktop only app.

### Beta one \[1.0.4\]

First announcement. Functionality implemented.  
See Readme file for known issues.

### prelease \[1.0.3\] - 2023-11-09

Initial Beta.

TickTick API implemented.  
See Readme file for known issues.
