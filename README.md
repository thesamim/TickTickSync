# TickTickSync

The TickTickSync plugin automatically creates tasks in TickTick and synchronizes task state between Obsidian and TickTick.

**TickTickSync is Mobile Compatible!**

The plugin works best when the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin is installed.

## Features

- Bidirectional synchronization of Tasks and Notes.
- Date/Time compatibility with the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin.   
- Mobile Compatible.

## Documentation

Please see [Documentation](https://github.com/thesamim/TickTickSync/wiki/Documentation) in the Wiki.

## Known Issues

1. The plugin only works with the [Tasks emoji formats](https://publish.obsidian.md/tasks/Reference/Task+Formats/About+Task+Formats). 
2. Because Tags can't have spaces, at this time it is not possible to add a task to a project with a name that contains spaces. As a workaround `#folder_with_a_space` will be converted to `folder with a space` in TickTick
3. If a file has a default project association (see [settings](https://github.com/thesamim/TickTickSync/wiki/Documentation#sync-control)), it is possible to create a task with a project tag other than the default project. The Task will be correctly synced to TickTick in the correct project. However, if the Task is then updated with subtasks, from TickTick, the subtasks will be synced to the project's default file rather than the file where the original parent task was created. **Additionally, the subtask will become the child of the last Task in that file.**

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




## Acknowledgements

This plugin is based on [Ultimate Todoist Sync for Obsidian](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian).  
There have been significant changes due to the difference between TickTick and ToDoist task handling. I am grateful for the work that [HeroBlackInk](https://github.com/HeroBlackInk/ultimate-todoist-sync-for-obsidian/commits?author=HeroBlackInk) put it in to the original plugin.

The [TickTick api wrapper](https://github.com/thesamim/ticktick-api-lvt) used here is forked from https://github.com/lucasvtiradentes/ticktick-api-lvt. Thanks to [Lucas](https://github.com/lucasvtiradentes) for his support.

Thanks to [quanru](https://github.com/quanru) for his work in enabling Dida support in [TickTick api wrapper](https://github.com/thesamim/ticktick-api-lvt) and for helping with Dida testing.

Thanks to [anschein](https://github.com/anschein) for helping with Dida testing.

Thanks to [Yusuf](https://github.com/akseron) for help debugging timezone issues.

Thanks to [LemurTech](https://github.com/LemurTech) and [zarb1n](https://github.com/zarb1n) for continuous support and help with debugging API moving target!

Thanks to [jee-ee](https://github.com/jee-ee) for pointing out the change in Device ID processing.

Thanks to [coneos](https://github.com/coneos) for pointing out the language disparity issue on mobile login.

Thanks to [gsdstr](https://github.com/gsdstr) for the MAJOR refactor that will enhance TickTickSync future development.

Thanks to [mProjectsCode](https://github.com/mProjectsCode) for his contribution to the Svelte documentation!

## Disclaimer

This plugin was built with the author's specific use cases in mind. Additional use cases can and will be considered.

The author makes no representations or warranties of any kind, express or implied, about the accuracy, completeness, or usefulness of this plugin and shall not be liable for any losses or damages resulting from the use of this plugin.

The author shall not be responsible for any loss or damage, including but not limited to data loss, system crashes, computer damage, or any other form of loss arising from software problems or errors. Users assume all risks and are solely responsible for any consequences resulting from the use of this product.

By using this plugin, you agree to be bound by all the terms of this disclaimer. If you have any questions, please contact the author.

## Contributing

Contributions are welcome! If you'd like to contribute to the plugin, please feel free to submit a pull request.

## License

This plugin is released under the [GNU GPLv3 License](/LICENSE.md).
