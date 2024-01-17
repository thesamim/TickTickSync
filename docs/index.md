# TickTickSync Documentation
## Configuration

1.  Open Obsidian's `Settings` window
2.  Select the `Community plugins` tab on the left
3.  Under `Installed plugins`, click the gear icon next to the `TickTickSync` plugin
4.  Enter your TickTick user ID and Password.

## Settings
### Access Control
1. TickTick/Dida: Choose your home server
2. Login: on changing the home server, or if you are notified to login:
   1. Click on the Login button
   2. In the browser window: Login to your home server
   3. Close the browser window

### Sync Control

1. Default folder location:  
    By default, TickTickSync saves files created to hold Ticktick tasks to the root folder ("/"). To choose an alternative directory, search for or type in the new folder name. 
2. Default project:  
    New tasks will be added to the default project, and you can change the default project in the settings.

#### Limit Synchronization
To limit the tasks TickTickSync will synchronize from TickTick to Obsidian you can select a tag or project(list). If a tag is entered, only tasks with that tag will be  synchronized. If a project(list) is selected, only tasks in that project will be synchronized. If  both are chosen only tasks with that tag in that project will be synchronized.")

When limiting Tag or limiting project are chosen, any Task created in Obsidian with the tag #TickTick in any folder will be added to TickTick. the task can only be updated from Obsidian.

Examples:


| Limiting Tag | Limiting Project |   Task Tagged with | Task Location | Result |
|--------------|------------------|--------------------|---------------|--------|
|              |                  |#ticktick|N/A|Tasks can be updated from Obsidian or TickTick|
|              |                  |||||
| #onlySync    |               |#ticktick|N/A|Task can only be updated from Obsidian. |
| #onlySync    |               |#ticktick #onlySync |N/A|Task can be updated from Obsidian and TickTick|
|              |                  |||||
|              | ThisListOnly     |#ticktick |File who's default project is ThisListOnly|Task can be updated from Obsidian and TickTick|
|              | ThisListOnly     |#ticktick | Any other file |Task can only be updated from Obsidian. |
|              |                  |||||
| #onlySync    | ThisListOnly     |#ticktick #onlySync|File that has default project of ThisListOnly|Task can be updated from Obsidian and TickTick|
| #onlySync    | ThisListOnly     |#ticktick|Any other file|Task can only be updated from Obsidian. |
| #onlySync    | ThisListOnly     |#ticktick #onlySync| Any other file |Task can only be updated from Obsidian. |

1. Project:   
    The Project/List containing tasks in order to be synchronized
2. Tag:  
    The tag tasks must have in order to be synchronized. 
3. Automatic synchronization interval time:   
    The time interval for automatic synchronization is set to 300 seconds by default, which means it runs every 5 minutes. You can modify it yourself.

4. Full vault sync  
    By enabling this option, the plugin will automatically add `#ticktick` to all tasks, which will modify all files in the vault. **NOTE: This includes all tasks that are currently Items of a task.**

## Usage

### Task format

Please see [Task Examples](#task-examples)

| Syntax                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                          | Example                                         |
| ----------------------------------------------------------------------- |--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| ----------------------------------------------- |
| #ticktick                                                               | Tasks marked with #ticktick will be synced to TickTick. Tasks without the #ticktick tag, but are one line below a #ticktick task and indented will be treated as Task Items (See Example Below). If you have enabled Full vault sync in the settings, #ticktick will be added automatically to **ALL** Tasks. UnTagged Tasks are ignored. Please see [Task Examples](#task-examples) | `- [ ] task #ticktick`                          |
| 📅YYYY-MM-DD | The date format is 📅YYYY-MM-DD, indicating the due date of a task. | `- [ ] task content 📅2025-02-05 #ticktick`   <br>Supports the following calendar emojis.📅📆🗓🗓️|                                                                                                                                                                                                                                                                                                                  | `- [ ] task content 📅2025-02-05 #ticktick`     |
| #projectTag | New tasks will be added to the default project(For example, inbox .), and you can change the default project in the settings or use a tag with the same name to specify a particular project.  | `- [ ] taskA #ticktick` will be added to inbox.<br>`- [ ] taskB #tag #testProject #ticktick` will be added to testProject.|
| #tag                                                                    | Note that all tags without a project of the same name are treated as normal tags                                                                                                                                                                                                                                                                                                     | `- [ ] task #tagA #tagB #tagC #ticktick`        |
| Priority  |    <p>TickTick only has three priority levels. They are mapped as follows.</p><table><thead><tr><th>TickTick</th><th>Obsidian</th></tr></thead><tbody><tr><td>0</td><td>null</td></tr><tr><td>0</td><td>&#39;⏬&#39;</td></tr><tr><td>1</td><td>&#39;🔽&#39;</td></tr><tr><td>3</td><td>&#39;🔼&#39;</td></tr><tr><td>5</td><td>&#39;⏫&#39;</td></tr><tr><td>5</td><td>&#39;🔺&#39;</td></tr></tbody></table>    | `- [ ] task ⏫ #ticktick` |

### Task examples
<table>
<tr>
<th> Task with Sub Tasks </th>
<th> Task with Items </th>
<th> Task ignored</th>
</tr>
<tr>
<td>

- [ ] Task with Sub Tasks #ticktick
	- [ ] Sub Task 1 #ticktick
	- [ ] Sub Task 2 #ticktick

</td>
<td>

- [ ] Task with Items #ticktick
	- [ ] Item 1
	- [ ] Item 2

</td>
<td>


- [ ] This task will be ignored. It does not have a ticktick tag.


</td>
</tr>
</table>


### Set a default project for each file separately

The default project in the setting applies to all files. You can set a separate default project for each file using command.

![](/attachment/command-set-default-project-for-file.png) ![](/attachment/default-project-for-file-modal.png)

You can see the current file's default project in the status bar at the bottom right corner.  
![](/attachment/statusBar.png)
