import { App, Notice, TFile } from 'obsidian';
import TickTickSync from "../main";
import { ITask } from 'ticktick-api-lvt/dist/types/Task';

export class FileOperation {
    app: App;
    plugin: TickTickSync;


    constructor(app: App, plugin: TickTickSync) {
        //super(app,settings);
        this.app = app;
        this.plugin = plugin;

    }


    //Complete a task and mark it as completed
    async completeTaskInTheFile(taskId: string) {
        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)
        const filepath = currentTask.path

        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
                lines[i] = line.replace('[ ]', '[x]')
                modified = true
                break
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            await this.app.vault.modify(file, newContent)
        }
    }

    // uncheck completed tasks,
    async uncompleteTaskInTheFile(taskId: string) {
        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)
        const filepath = currentTask.path

        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
                lines[i] = line.replace(/- \[(x|X)\]/g, '- [ ]');
                modified = true
                break
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            await this.app.vault.modify(file, newContent)
        }
    }

    //add #TickTick at the end of task line, if full vault sync enabled
    async addTickTickTagToFile(filepath: string) {
        // console.log("addTickTickTagToFile")
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)

        const content = await this.app.vault.read(file)
        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (!this.plugin.taskParser?.isMarkdownTask(line)) {
                //console.log(line)
                //console.log("It is not a markdown task.")
                continue;
            }
            //if content is empty
            if (this.plugin.taskParser?.getTaskContentFromLineText(line) == "") {
                //console.log("Line content is empty")
                continue;
            }
            if (!this.plugin.taskParser?.hasTickTickId(line) && !this.plugin.taskParser?.hasTickTickTag(line)) {
                //console.log(line)
                //console.log('prepare to add TickTick tag')
                const newLine = this.plugin.taskParser?.addTickTickTag(line);
                //console.log(newLine)
                lines[i] = newLine
                modified = true
            }
        }

        if (modified) {
            // console.log(`New task found in files ${filepath}`)
            const newContent = lines.join('\n')
            //console.log(newContent)
            await this.app.vault.modify(file, newContent)

            //update filemetadate
            const metadata = await this.plugin.cacheOperation?.getFileMetadata(filepath)
            if (!metadata) {
                throw new Error(`File Metadata creation failed for file ${filepath}`);
            }

        }
    }



    //add TickTick at the line
    async addTickTickLinkToFile(filepath: string) {
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (this.plugin.taskParser?.hasTickTickId(line) && this.plugin.taskParser?.hasTickTickTag(line)) {
                if (this.plugin.taskParser?.hasTickTickLink(line)) {
                    return
                }
                // console.log("addTickTickLinkToFile", line)
                //console.log('prepare to add TickTick link')
                const taskID = this.plugin.taskParser?.getTickTickIdFromLineText(line)
                const taskObject = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskID)
                const newLine = this.plugin.taskParser?.addTickTickLink(line, taskObject.id)
                // console.log(newLine)
                lines[i] = newLine
                modified = true
            } else {
                continue
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            //console.log(newContent)
            await this.app.vault.modify(file, newContent)



        }
    }

    // sync updated task content to file
    async addTasksToFile(tasks: ITask[]): Promise<Boolean> {
        //sort by project id and task id
        tasks.sort((taskA, taskB) => (taskA.projectId.localeCompare(taskB.projectId) ||
            taskA.id.localeCompare(taskB.id)));
        //try not overwrite files while downloading a whole bunch of tasks. Create them first, then do the addtask mambo
        const projectIds = [...new Set(tasks.map(task => task.projectId))];
        for (const projectId of projectIds) {
            let taskFile = await this.plugin.cacheOperation?.getFilepathForProjectId(projectId);
            let metaData;
            if (taskFile) {
                metaData = await this.plugin.cacheOperation?.getFileMetadata(taskFile, projectId);
                if (!metaData) {
                    throw new Error(`File Metadata creation failed for project Id: ${projectId} and file ${taskFile}`);
                }

                var file = this.app.vault.getAbstractFileByPath(taskFile);
                if (!(file instanceof TFile)) {
                    //the file doesn't exist. Create it.
                    //TODO: Deal with Folders and sections in the fullness of time.
                    new Notice(`Creating new file: ${taskFile}`);
                    let whoAdded = `${this.plugin.manifest.name} -- ${this.plugin.manifest.version}`;
                    file = await this.app.vault.create(taskFile, `== Added by ${whoAdded} == `)
                }
            }
            let projectTasks = tasks.filter(task => task.projectId === projectId);
            //make sure top level tasks are first
            projectTasks.sort((left, right) => {
                if (!left.parentId && right.parentId) {
                    return -1;
                } else if (left.parentId && !right.parentId) {
                    return 1;
                } else {
                    return 0;
                }
            });

            let result = await this.addProjectTasksToFile(file, projectTasks, metaData);
            // Sleep for 1 second
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (this.plugin.settings.debugMode) {
                console.log(result ? "Completed add task." : "Failed add task")
            }
        }
		return true;
    }


    private async addProjectTasksToFile(file: TFile, tasks: ITask[],
        metaData: any): Promise<boolean> {
        try {
            const content = await this.app.vault.read(file);

            let lines = content.split('\n');

            let modified = false;


            let lastTaskLine = 0;

            let lastLineInFile = lines.length;
            let lastLineId = "";
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (this.plugin.taskParser?.hasTickTickTag(line)) {
                    lastTaskLine = i;
                    lastLineId = this.plugin.taskParser?.getTickTickIdFromLineText(line);
                }
            }
            let lineToInsert: number;


            if (lastTaskLine > 0) {
                lineToInsert = lastTaskLine + 1;
                if (lastLineId)
                {
                    let lastTask: ITask = await this.plugin.cacheOperation?.loadTaskFromCacheID(lastLineId);
                    if (lastTask) {
						if (lastTask.items) {
							lineToInsert = lineToInsert + lastTask.items.length;
						}
						if (lastTask.childIds) {
							lineToInsert = lineToInsert + lastTask.childIds.length;
						}
                    }

                }
            } else {
                lineToInsert = lastLineInFile;
            }
            let oldLineCount = lines.length;
            lines = await this.writeLines(tasks, lineToInsert, lines, file);
            let newLineCount = lines.length
            if (oldLineCount < newLineCount) {
                const newContent = lines.join('\n');
                await this.app.vault.modify(file, newContent);
                this.plugin.lastLines.set(file.name, lines.length);
            }
            return true;
        } catch (error) {
            console.error(`Could not add Tasks to file ${filePath} \n Error: ${error}`);
            return false;
        }
    }

    private async writeLines(tasks: ITask[], lineToInsert: number, lines: string[], file: TFile): Promise<string[]> {
		const addedTask: string[] = [];
        for (const task of tasks) {
            let itemCount = 0;

            let lineText = await this.plugin.taskParser?.convertTaskObjectToTaskLine(task);
            if (task.parentId) {
                let parentIndex = lines.indexOf(lines.find(line => line.includes(task.parentId)))
                if (parentIndex < 0) {
                    //TODO: Determine how to handle
                    console.error("Parent ID Not found in file.")
                }
                let parentLine = lines[parentIndex];
                if (parentLine) {
                    const regex = /^[^-.]*/;
                    let parentTabs = parentLine.match(regex)[0];
                    if (parentTabs) {
                        parentTabs = parentTabs + "\t";
                    } else {
                        parentTabs = "\t"
                    }
					//We found a parent. If the parent has just been added Its items are going to be
					//one on Line entry. If the parent already existed, we need to get the item count.
					if (addedTask.indexOf(task.parentId) < 0) {
						//it's an existing task quickest way to get its items:
						const parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(task.parentId);
						if (parentTask && parentTask.items) {
							parentIndex = parentIndex + parentTask.items.length;
						}
					}
                    lineText = parentTabs + lineText
					console.log("task: ", task.title, "parent Tabs: ", parentTabs,length)
                    if (lineText.includes("\n")) { // are there items?
                        // console.log("child task")
                        lineText = lineText.replace(/\n/g, "\n" + parentTabs + "\t");
                        itemCount = (lineText.match(/\n/g) || []).length;
                    }
                    lines.splice(parentIndex + 1, 0, lineText);
                } else {
                    console.error("Parent not found, inserting at: ", lineToInsert)
                    lineText = "\t" + lineText
                    if (lineText.includes("\n")) { // are there items?
                        // console.log("Orphaned child")
                        lineText = lineText.replace(/\n/g, "\n" + "\t\t");
                        itemCount = (lineText.match(/\n/g) || []).length;
                    }
                    lines.splice(lineToInsert, 0, lineText);
                }
            } else {
                if (lineText.includes("\n")) { // are there items?
                    lineText = lineText.replace(/\n/g, "\n" + "\t");
                    itemCount = (lineText.match(/\n/g) || []).length;
                }
                lines.splice(lineToInsert, 0, lineText);
            }

            await this.plugin.cacheOperation?.appendTaskToCache(task, file.name);
            //We just add the ticktick tag, update it on ticktick now.
            let tags = this.plugin.taskParser?.getAllTagsFromLineText(lineText);
            if (tags) {
                task.tags = tags;
            }
            let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(file.name)
            if (taskURL) {
                task.title = task.title + " " + taskURL;
            }
            let updatedTask = await this.plugin.tickTickRestAPI?.UpdateTask(task)
			//keep track of added Tasks because item count is affected

			addedTask.push(task.id);
            lineToInsert = lineToInsert + 1 + itemCount;
        }
		return lines;
    }

    // update task content to file
    async updateTaskInFile(task: ITask) {
        const taskId = task.id
        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)
        const filepath = currentTask.path

        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
                let newTaskContent = await this.plugin.taskParser?.convertTaskObjectToTaskLine(task);
				//get tabs for current task
                let taskToBeReplaced = await this.plugin.taskParser?.taskFromLine(line, filepath);
                let parentTabs = taskToBeReplaced?.indentation;
				let itemCount = 0;
                if (newTaskContent.includes("\n")) { // are there items?
                    newTaskContent = newTaskContent.replace(/\n/g, "\n" + parentTabs + '\t');
					itemCount = (newTaskContent.match(/\n/g) || []).length;
                }
				if (currentTask.items && currentTask.items.length > 0 ) {
					lines.splice(i+1,currentTask.items.length)
				}
                lines[i] = parentTabs + line.replace(line, newTaskContent)

                // if (task.items && task.items.length > 0 ) {
                //     console.log(`new Task has ${currentTask.items.length}`)
                // }
                modified = true
                break
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            await this.app.vault.modify(file, newContent)
        }

    }
    // delete task from file
    async deleteTaskFromSpecificFile(filePath: string, taskId: string) {
        // Get the file object and update the content
		console.error("Task being deleted from file: ", taskId, filePath)
        const file = this.app.vault.getAbstractFileByPath(filePath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
                lines.splice(i, 1);
                modified = true
                break
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            //console.log(newContent)
            await this.app.vault.modify(file, newContent)
        }


    }
    async deleteTaskFromFile(task: ITask) {
		console.error("Task being deleted from file : ", task.id)
        const taskId = task.id
        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)
		//TODO: It is redundant to have a path attribute AND filemetadata. Need to pick one or the other.
		if (currentTask.path) {
			const filepath = currentTask.path
			await this.deleteTaskFromSpecificFile(filepath, task.id)
		}
    }

    // sync updated task content to file
    async syncUpdatedTaskContentToTheFile(evt: Object) {
        const taskId = evt.object_id
        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)
        const filepath = currentTask.path

        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
                const oldTaskContent = this.plugin.taskParser?.getTaskContentFromLineText(line)
                const newTaskContent = evt.extra_data.content

                lines[i] = line.replace(oldTaskContent, newTaskContent)
                modified = true
                break
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            await this.app.vault.modify(file, newContent)
        }

    }


    //search TickTick_id by content
    async searchTickTickIdFromFilePath(filepath: string, searchTerm: string): Promise<string | null> {
        const file = this.app.vault.getAbstractFileByPath(filepath)
        const fileContent = await this.app.vault.read(file)
        const fileLines = fileContent.split('\n');
        let TickTickId: string | null = null;

        for (let i = 0; i < fileLines.length; i++) {
            const line = fileLines[i];

            if (line.includes(searchTerm)) {
                const regexResult = /\[ticktick_id::\s*(\w+)\]/.exec(line);

                if (regexResult) {
                    TickTickId = regexResult[1];
                }

                break;
            }
        }

        return TickTickId;
    }

    //get all files in the vault
    async getAllFilesInTheVault() {
        const files = this.app.vault.getFiles()
        return (files)
    }

    //search filepath by taskid in vault
    async searchFilepathsByTaskidInVault(taskId: string) {
        // console.log(`preprare to search task ${taskId}`)
        const files = await this.getAllFilesInTheVault()
        //console.log(files)
        const tasks = files.map(async (file) => {
            if (!this.isMarkdownFile(file.path)) {
                return;
            }
            const fileContent = await this.app.vault.cachedRead(file);
            if (fileContent.includes(taskId)) {
                return file.path;
            }
        });

        const results = await Promise.all(tasks);
        const filePaths = results.filter((filePath) => filePath !== undefined);
        return filePaths[0] || null;
        //return filePaths || null
    }


    isMarkdownFile(filename: string) {
        // Get the extension of the file name
        let extension = filename.split('.').pop();

        //Convert the extension to lowercase (the extension of Markdown files is usually .md)
        extension = extension.toLowerCase();

        // Determine whether the extension is .md
        if (extension === 'md') {
            return true;
        } else {
            return false;
        }
    }





}
