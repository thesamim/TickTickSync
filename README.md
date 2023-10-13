# Ultimate ticktick Sync for Obsidian

> [!important]
> This plugin is based on [Ultimate Todoist Sync for Obsidian](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian)
> as of 2023-09-28 this is a work in progress, guarantied to fail. Just saving progress at this point.

The Ultimate ticktick Sync plugin automatically creates tasks in ticktick and synchronizes task state between Obsidian and ticktick.


## Demo

### Usage
![Alt Text](/attachment/demo.gif)

### Settings page
<img src="/attachment/settings.png" width="500">


## Features 

### 
| Feature                 | Sync from Obsidian to ticktick | Sync from ticktick to Obsidian | Description |
|-------------------------|-------------------------------|-------------------------------|-------------|
| Add task                | ✅                            | 🔜                           |             |
| Delete task             | ✅                            | 🔜                           |             |
| Modify task content     | ✅                            | ✅                           |             |
| Modify task due date    | ✅                            | ✅                           |             |
| Modify task description | 🔜                            | 🔜                           |             |
| Modify task labels/tags | ✅                            | 🔜                           |             |
| Mark task as completed  | ✅                            | ✅                           |             |
| Mark task as uncompleted| ✅                            | ✅                           |             |
| Modify project          | 🔜                            | 🔜                           |             |
| Modify section          | 🔜                            | 🔜                           |             |
| Modify priority         | ✅                            | 🔜                           |  Currently, task priority only support one-way synchronization from ticktick to Obsidian.           |
| Add reminder            | 🔜                            | 🔜                           |             |
| Move tasks between files| 🔜                            | 🔜                           |             |
| Added-at date           | 🔜                            | 🔜                           |             |
| Completed-at date       | 🔜                            | 🔜                           |             |
| Task notes              | 🔜                            | ✅                           |   Currently, task notes/comments only support one-way synchronization from ticktick to Obsidian.          |


## Installation

### From within Obsidian

From Obsidian v1.3.5+, you can activate this plugin within Obsidian by doing the following:

1. Open Obsidian's `Settings` window
2. Select the `Community plugins` tab on the left
3. Make sure `Restricted mode` is **off**
4. Click `Browse` next to `Community Plugins`
5. Search for and click on `Ultimate ticktick Sync`
6. Click `Install`
7. Once installed, close the `Community Plugins` window
8. Under `Installed Plugins`, activate the `Ultimate ticktick Sync` plugin

You can update the plugin following the same procedure, clicking `Update` instead of `Install`

### Manually

If you would rather install the plugin manually, you can do the following:

1. Download the latest release of the plugin from the [Releases](https://github.com/thesamim/ultimate-ticktick-sync-for-obsidian/releases) page.
2. Extract the downloaded zip file and copy the entire folder to your Obsidian plugins directory.
3. Enable the plugin in the Obsidian settings.


## Configuration

1. Open Obsidian's `Settings` window
2. Select the `Community plugins` tab on the left
3. Under `Installed plugins`, click the gear icon next to the `Ultimate ticktick Sync` plugin
4. Enter your ticktick API token


## Settings
1. Automatic synchronization interval time
The time interval for automatic synchronization is set to 300 seconds by default, which means it runs every 5 minutes. You can modify it yourself.
2. Default project
New tasks will be added to the default project, and you can change the default project in the settings. 
3. Full vault sync
By enabling this option, the plugin will automatically add `#ticktick` to all tasks, which will modify all files in the vault.


## Usage

### Task format

| Syntax | Description | Example |
| --- | --- | --- |
|#ticktick|Tasks marked with `#ticktick` will be added to ticktick, while tasks without the `#ticktick` tag will not be processed.If you have enabled Full vault sync in the settings, `#ticktick` will be added automatically.| `- [ ] task #ticktick`|
| 📅YYYY-MM-DD | The date format is 📅YYYY-MM-DD, indicating the due date of a task. | `- [ ] task content 📅2025-02-05 #ticktick`   <br>Supports the following calendar emojis.📅📆🗓🗓️|
| #projectTag | New tasks will be added to the default project(For example,  inbox .), and you can change the default project in the settings or use a tag with the same name to specify a particular project. | `- [ ] taskA #ticktick` will be added to inbox.<br>`- [ ] taskB #tag #testProject #ticktick` will be added to testProject.|
| #tag | Note that all tags without a project of the same name are treated as normal tags | `- [ ] task #tagA #tagB #tagC #ticktick` |
|   `!!<number>` | The priority of the task (a number between 1 and 4, 4 for very urgent and 1 for natural).<br>**Note**: Keep in mind that very urgent is the priority 1 on clients. So, the priority 1 in the client corresponds to the number 4 here (Because that's how the official API of ticktick is designed.). | `- [ ] task !!4 #ticktick` |

###  Set a default project for each file separately

The default project in the setting applies to all files. You can set a separate default project for each file using command. 

<img src="/attachment/command-set-default-project-for-file.png" width="500">
<img src="/attachment/default-project-for-file-modal.png" width="500">

You can see the current file's default project in the status bar at the bottom right corner.
<img src="/attachment/statusBar.png" width="500">


## Disclaimer

This plugin is for learning purposes only. The author makes no representations or warranties of any kind, express or implied, about the accuracy, completeness, or usefulness of this plugin and shall not be liable for any losses or damages resulting from the use of this plugin.

The author shall not be responsible for any loss or damage, including but not limited to data loss, system crashes, computer damage, or any other form of loss arising from software problems or errors. Users assume all risks and are solely responsible for any consequences resulting from the use of this product.

By using this plugin, you agree to be bound by all the terms of this disclaimer. If you have any questions, please contact the author.


## Contributing

Contributions are welcome! If you'd like to contribute to the plugin, please feel free to submit a pull request.


## License

This plugin is released under the [GNU GPLv3 License](/LICENSE.md).

