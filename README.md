# TickTickSync

The TickTickSync plugin automatically creates tasks in ticktick and synchronizes task state between Obsidian and ticktick.

The plugin works best when the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin is installed.

## Features

- Any task created in Obsidian and taged with #ticktick will be synchronized with TickTick
- Any task created in TickTick will be synchronized to Obisidian.
- Updates are bi-directional
- Tasks added or updated from Obsidian are synched to TickTick immediately.
- Tasks added or updated from TickTick are synched on a configurable time interval.

## Notes

1. **All Task Deletion operations must be confirmed.** In the fullness of time, when we get out of Beta, this might be a preference item. For now it's compulsory.
2. TickTick lists are referred to as Projects in the plugin, and throughout documentation.
3. TickTick only has four priorities (High, Medium, Low, None). Please see Priority in [Task Format](#task-format) for Task mapping of priority
4. **Warning:** TickTickSync automatically creates .md files corresponding with the lists/projects created in TickTick and downloads all tasks to them.  
   If the files are deleted in Obsidian while the TickTickSync plugin is active, those tasks will be deleted. If you accidentally confirm that deletion: 
   To recover those tasks, go to the "Trash" menu item on the TickTick interface and recover deleted tasks from there.
5. TickTickSync now supports Task Items and will **NOT** delete Task Content. However, as of now, it will not allow management of Task Content.
6. A link to the containing file in Obsidian is added to the Task Title in TickTick, but the content field is not mangled. In the fullness of time content will be manageable in TickTickSync. Please watch this [issue](https://github.com/thesamim/TickTickSync/issues/10) for progress. 
7. Relatively confident that Time Zone difference issues are resolved. If not: Please open an issue with details.

## Known Issues

1. Apparently TickTick has changed sign in procedures. TickTick sometimes requires the user login with a captcha. A temporary work-around: You will have to login manually from settings. Theoretically, this take takes care of the issue.
2. Currently, ALL TickTick tasks are synched. This [issue](https://github.com/thesamim/TickTickSync/issues/7) tracks the resolution: If tagged with #obisidian a task will be synched. If not, it will be ignored.
3. The plugin only works with the [Tasks emoji formats](https://publish.obsidian.md/tasks/Reference/Task+Formats/About+Task+Formats). It will **not** work with the Dataview format. In the fullness of time, this plugin will be refactored to use Tasks functionality to support both.
4. Due Date:
   1. On the Obsidian side: if no time is provided, the start time will default to 08:00
   2. On the TickTick side: if not time is provided, the start time will be 00:00
   3. The [Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks) queries will not find TickTickSync Tasks because the dates are not positioned per [Tasks Format](https://publish.obsidian.md/tasks/Editing/Auto-Suggest#What+do+I+need+to+know+about+the+order+of+items+in+a+task%3F)  
5. Parent/Child tasks are supported bi-directionally. However, changes to the parent/child relationship are not handled. Yet.
6. Moving tasks between Projects/Lists is **NOT** supported at this time.
7. Because Tags can't have spaces, at this time it is not possible to add a task to a project with name that contains spaces. In the fullness of time, will implement some kind of workaround (eg: `#folder_with_a_space` will be converted to `folder with a space`)
8. If a file has a default project association (see settings), it is possible to create a task with project tag other than the default project. The Task will be correctly synched to TickTick in the correct folder. However, if the Task is then updated with subtasks, from TickTick, the subtasks will be synched to the project's default file rather than the file where the original parent task was created.

## Installation

### From within Obsidian

From Obsidian v1.3.5+, you can activate this plugin within Obsidian by doing the following:

1.  Open Obsidian's `Settings` window
2.  Select the `Community plugins` tab on the left
3.  Make sure `Restricted mode` is **off**
4.  Click `Browse` next to `Community Plugins`
5.  Search for and click on `TickTickSync`
6.  Click `Install`
7.  Once installed, close the `Community Plugins` window
8.  Under `Installed Plugins`, activate the `TickTickSync` plugin

You can update the plugin following the same procedure, clicking `Update` instead of `Install`

### BRAT

1.  Install from Community Plugins [Obsidian42 - BRAT](https://obsidian.md/plugins?id=obsidian42-brat) (latest)
    - See [their readme](https://github.com/TfTHacker/obsidian42-brat#readme).
2.  Follow the instructions to add the plugin from: https://github.com/thesamim/TickTickSync

### Manually

If you would rather install the plugin manually, you can do the following:

1.  Download the latest release of the plugin from the [Releases](https://github.com/thesamim/TickTickSync/releases) page.
2.  Extract the downloaded zip file and copy the entire folder to your Obsidian plugins directory.
3.  Enable the plugin in the Obsidian settings.

## Configuration

1.  Open Obsidian's `Settings` window
2.  Select the `Community plugins` tab on the left
3.  Under `Installed plugins`, click the gear icon next to the `TickTickSync` plugin
4.  Enter your TickTick user ID and Password.

## Settings

1.  Automatic synchronization interval time  
    The time interval for automatic synchronization is set to 300 seconds by default, which means it runs every 5 minutes. You can modify it yourself.
2.  Default project  
    New tasks will be added to the default project, and you can change the default project in the settings.
3.  Full vault sync  
    By enabling this option, the plugin will automatically add `#ticktick` to all tasks, which will modify all files in the vault.

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

- [ ] This task will not be ignored. It does not have a ticktick tag.

</td>
</tr>
</table>


### Set a default project for each file separately

The default project in the setting applies to all files. You can set a separate default project for each file using command.

![](/attachment/command-set-default-project-for-file.png) ![](/attachment/default-project-for-file-modal.png)

You can see the current file's default project in the status bar at the bottom right corner.  
![](/attachment/statusBar.png)

## Acknowledgements

This plugin is based on [Ultimate Todoist Sync for Obsidian](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian).  
There have been significant changes due to the difference between TickTick and ToDoist task handling. I am grateful for the work that [HeroBlackInk](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian/commits?author=HeroBlackInk) put it in to the original plugin.

The [TickTick api wrapper](https://github.com/thesamim/ticktick-api-lvt) used here is forked from https://github.com/lucasvtiradentes/ticktick-api-lvt. Thanks to [Lucas](https://github.com/lucasvtiradentes) for his support.

## Disclaimer

This plugin was built with the author's specific use cases in mind. Additional use cases can and will be considered.

The author makes no representations or warranties of any kind, express or implied, about the accuracy, completeness, or usefulness of this plugin and shall not be liable for any losses or damages resulting from the use of this plugin.

The author shall not be responsible for any loss or damage, including but not limited to data loss, system crashes, computer damage, or any other form of loss arising from software problems or errors. Users assume all risks and are solely responsible for any consequences resulting from the use of this product.

By using this plugin, you agree to be bound by all the terms of this disclaimer. If you have any questions, please contact the author.

## Contributing

Contributions are welcome! If you'd like to contribute to the plugin, please feel free to submit a pull request.

## License

This plugin is released under the [GNU GPLv3 License](/LICENSE.md).
