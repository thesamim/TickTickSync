import {App, Notice, TFile, TFolder} from 'obsidian';
import TickTickSync from "@/main";
import type {ITask} from './api/types/Task';
import {TaskDeletionModal} from "./modals/TaskDeletionModal";
import {getSettings} from "@/settings";


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
        const filepath = await this.plugin.cacheOperation?.getFilepathForTask(taskId)

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
			// console.error("Modified: ", file?.path, new Date().toISOString());
        }
    }

    // uncheck completed tasks,
    async uncompleteTaskInTheFile(taskId: string) {
        // Get the task file path
        const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)
        const filepath = await this.plugin.cacheOperation?.getFilepathForTask(taskId)

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
			// console.error("Modified: ", file?.path, new Date().toISOString());
        }
    }

    //add #TickTick at the end of task line, if full vault sync enabled
    async addTickTickTagToFile(filepath: string) {
        // console.log("addTickTickTagToFile")
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
		if ((file) && (file instanceof TFolder)) {
			//leave folders alone.
			return;
		}

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
                let newLine = this.plugin.taskParser?.addTickTickTag(line);
				//strip item id in case it was an item before
				newLine = this.plugin.taskParser?.stripLineItemId(newLine)
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
			new Notice("New Tasks will be added to TickTick on next Sync.")
			// console.error("Modified: ", file?.path, new Date().toISOString());
        }
    }



    //add TickTick at the line
    async addTickTickLinkToFile(filepath: string) {
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
		if ((file) && (file instanceof TFolder)) {
			//leave folders alone.
			return;
		}
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
                const newLine = this.plugin.taskParser?.addTickTickLink(line, taskObject.id, taskObject.projecId)
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
			// console.error("Modified: ", file?.path, new Date().toISOString());



        }
    }

    // sync updated task content to file
    async addTasksToFile(tasks: ITask[]): Promise<Boolean> {
        //sort by project id and task id
        tasks.sort((taskA, taskB) => (taskA.projectId.localeCompare(taskB.projectId) ||
            taskA.id.localeCompare(taskB.id)));
        //try not overwrite files while downloading a whole bunch of tasks. Create them first, then do the addtask mambo
		if (!tasks) {
			console.error("No tasks to add.")
			return false;
		}
        const projectIds = [...new Set(tasks.map(task => task.projectId))];
        for (const projectId of projectIds) {
            let taskFile = await this.plugin.cacheOperation?.getFilepathForProjectId(projectId);
			let file;
            if (taskFile) {
                file = this.app.vault.getAbstractFileByPath(taskFile);
                if (!(file instanceof TFile)) {
					file = await this.getOrCreateDefaultFile(taskFile);
				}
            }
            let projectTasks = tasks.filter(task => task.projectId === projectId);
            //make sure top level tasks are first

            // projectTasks.sort((left, right) => {
            //     if (!left.parentId && right.parentId) {
            //         return -1;
            //     } else if (left.parentId && !right.parentId) {
            //         return 1;
            //     } else {
            //         return 0;
            //     }
            // });
			projectTasks.sort((a, b) => this.compareTasks(a,b, 0, projectTasks))

            let result = await this.addProjectTasksToFile(file, projectTasks);
            // Sleep for 1 second
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (getSettings().debugMode) {
                console.log("===", projectTasks, result ? "Completed add task." : "Failed add task")
            }
        }
		return true;
    }


	async getOrCreateDefaultFile(taskFile: string) {
		let file;
		//the file doesn't exist. Create it.
		try {
			//TODO: Deal with Folders and sections in the fullness of time.
			const folderPath = getSettings().TickTickTasksFilePath;
			let folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) {
				console.warn(`Folder ${folderPath} does not exit. It will be created`);
				folder = await this.app.vault.createFolder(folderPath);
			}
			new Notice(`Creating new file: ${folder.path}/${taskFile}`);
			console.warn(`Creating new file: ${folder.path}/${taskFile}`);
			taskFile = `${folder.path}/${taskFile}`;
			let whoAdded = `${this.plugin.manifest.name} -- ${this.plugin.manifest.version}`;
			try {
				file = await this.app.vault.create(taskFile, `== Added by ${whoAdded} == `);
			} catch (error) {
				console.error('File creation failed: ', error);
				if (error.message.includes('File already exists')) {
					console.error('Attempting to find existing file');
					//this has happened when we've had duplicated lists in TickTick.
					//Until they fix it....
					file = this.app.vault.getAbstractFileByPath(taskFile);
					// if (file instanceof TFile) {
					// 	const projectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(projectId);
					// 	// await this.app.vault.append(file, `\n====== Project **${projectName}** is probably duplicated in TickTick Adding tasks from other project here.  `)
					// }
				}
			}
			return file;
		} catch (error) {
			console.error('Error on create file: ', error);
			throw new Error(error);
		}
	}

    private async addProjectTasksToFile(file: TFile, tasks: ITask[]): Promise<boolean> {
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
				// console.error("Modified: ", file?.path, new Date().toISOString());
                this.plugin.lastLines.set(file.path, lines.length);
            }
            return true;
        } catch (error) {
            console.error(`Could not add Tasks to file ${file.path} \n Error: ${error}`);
            return false;
        }
    }

    private async writeLines(tasks: ITask[], lineToInsert: number, lines: string[], file: TFile): Promise<string[]> {
		const addedTask: string[] = [];
        for (const task of tasks) {
            let itemCount = 0;
			//Tired of seeing duplicates because of Sync conflicts.
			if (lines.find(line => (line.includes(task.id)))) {
				//it's in the file, but not in cache. Just update it.
				await this.updateTaskInFile(task, lines)
				await this.plugin.cacheOperation?.updateTaskToCache(task, file.path)
				addedTask.push(task.id);
				continue;
			}
            let lineText = await this.plugin.taskParser?.convertTaskToLine(task, "TTAdd");

			//Trust either Task plugin or Ticktick to do the completion dates.
			// if (task.status != 0) {
			// 	//closed task, add completion time
			// 	lineText = this.plugin.taskParser?.addCompletionDate(lineText, task.completedTime);
			// }

			if (task.parentId) {
                let parentIndex = lines.indexOf(lines.find(line => line.includes(task.parentId)))
                if (parentIndex < 0) {
                    //TODO: Determine how to handle
                    console.error("Parent ID: ", task.parentId, " not found for: " + task.title)
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


            //We just add the ticktick tag, update it on ticktick now.
            let tags = this.plugin.taskParser?.getAllTagsFromLineText(lineText);
            if (tags) {
                task.tags = tags;
            }
            let taskURL = this.plugin.taskParser?.getObsidianUrlFromFilepath(file.path)
            if (taskURL) {
                task.title = task.title + " " + taskURL;
            }

			let updatedTask = await this.plugin.tickTickRestAPI?.UpdateTask(task)
			await this.plugin.cacheOperation?.appendTaskToCache(updatedTask, file.path);
			//keep track of added Tasks because item count is affected

			addedTask.push(task.id);
            lineToInsert = lineToInsert + 1 + itemCount;
        }
		return lines;
    }

    // update task content to file
    async updateTaskInFile(task: ITask, toBeProcessed: string[]) {
        const taskId = task.id
        // Get the task file path
        const currentTask: ITask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)

		this.plugin.dateMan?.addDateHolderToTask(task, currentTask);

		if (currentTask) {
			//Only check for Project/Parent change if task is in cache.
			const hasChildren = this.hasChildren(currentTask);
			// if (this.plugin.dateMan) {
			// 	this.plugin.dateMan.updateDates(currentTask, task);
			// }
			if ((this.plugin.taskParser?.isProjectIdChanged(currentTask, task)) || this.plugin.taskParser?.isParentIdChanged(currentTask, task)) {
				await this.handleTickTickStructureMove(task, currentTask, toBeProcessed);
				return;
			}
		}


		let filepath = await this.plugin.cacheOperation?.getFilepathForTask(taskId)
		if(!filepath) {
			filepath = await this.plugin.cacheOperation?.getFilepathForProjectId(task.projectId);
			if(!filepath) {
				throw new Error(`File not found for ${task.id}, ${task.title}`)
			}
		}
        // Get the file object and update the content
        const file = this.app.vault.getAbstractFileByPath(filepath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {
                let newTaskContent = await this.plugin.taskParser?.convertTaskToLine(task, "TTUpdate");

				//get tabs for current task
                let parentTabs = this.plugin.taskParser?.getTabs(line);
				let itemCount = 0;
                if (newTaskContent.includes("\n")) { // are there items?
                    newTaskContent = newTaskContent.replace(/\n/g, "\n" + parentTabs + '\t');
					itemCount = (newTaskContent.match(/\n/g) || []).length;
                }

				if (currentTask && currentTask.items && currentTask.items.length > 0 ) {
					lines.splice(i+1,currentTask.items.length)
				}
                lines[i] = parentTabs + line.replace(line, newTaskContent)

				//Trust either Task plugin or Ticktick to do the completion dates.
				// //always add completion date at end if the task is closed.
				// if (task.status != 0) {
				// 	//in an ideal world, we would triger Tasks to complete the task for us.
				// 	//but we're not there. Slap a completion date on the end of the line and be done
				// 	lines[i] = this.plugin.taskParser?.addCompletionDate(lines[i], task.completedTime);
				// }

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
			// console.error("Modified: ", file?.path, new Date().toISOString());
		}

    }

	async checkForDuplicates(fileMetadata, taskList: {} | undefined) {
		let taskIds = {};
		let duplicates = {};

		if (!fileMetadata) {
			return;
		}

		let fileName;
		try {

			for (const file in fileMetadata) {
				fileName = file;
				const currentFile = this.app.vault.getAbstractFileByPath(file)
				if ((!currentFile)) {
					console.log("Duplicate check Skipping ", file, " because it's not found.");
					continue
				}
				if ((currentFile) && (currentFile instanceof TFolder)) {
					console.log("Duplicate check Skipping ", file, " because it's a folder.");
					continue
				}
				try {
					const content = await this.app.vault.read(currentFile)
					for (let taskListKey in taskList) {
						if (content.includes(taskListKey)) {
							if (taskIds[taskListKey]) {
								if (!duplicates[taskListKey]) {
									duplicates[taskListKey] = [taskIds[taskListKey]];
								}
								duplicates[taskListKey].push(file);
							} else {
								taskIds[taskListKey] = file;
							}

						}
					}
				} catch {
					console.log("Duplicate check Skipping ", file, " because it's not readable.");
					continue
				}

			}
			return duplicates;
		} catch (Fail) {
			const errMsg = `File [${fileName}] not found, or is locked. If file exists, Please try again later.`
			console.error(Fail, errMsg)
			throw new Error(errMsg)
		}
	}

	//Yes, I know this belongs in taskParser, but I don't feel like messing with it right now.
	private hasChildren(currentTask: ITask) {

		if (currentTask.childIds) {
			return currentTask.childIds?.length > 0;
		} else {
			return false;
		}
	}

// delete task from file
    async deleteTaskFromSpecificFile(filePath: string, taskId: string, taskTitle: string, numItems: number, bConfirmDialog: boolean) {
        // Get the file object and update the content
	if (bConfirmDialog) {
			const bConfirm = await this.confirmDeletion(taskTitle + "in File: " + filePath);
			if (!bConfirm) {
				new Notice("Tasks will not be deleted. Please rectify the issue before the next sync.", 0)
				return [];
			}
		}
		console.info("Task being deleted from file: ", taskId, filePath)
        const file = this.app.vault.getAbstractFileByPath(filePath)
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser?.hasTickTickTag(line)) {

                lines.splice(i, numItems + 1);
                modified = true
                break
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            //console.log(newContent)
            await this.app.vault.modify(file, newContent)
			// console.error("Modified: ", file?.path, new Date().toISOString());
        }


    }

	async deleteTaskFromFile(task: ITask) {
		const taskId = task.id
		// Get the task file path
		const currentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(taskId)

		const filepath = await  this.plugin.cacheOperation?.getFilepathForTask(taskId)
		if (filepath) {
			await this.deleteTaskFromSpecificFile(filepath, task.id, task.title, currentTask.items.length, false)
		} else {
			throw new Error(`File not found for ${task.title}. File path found is ${filepath}`)
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

	//TODO: I think there are three versions of this!
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

	private async confirmDeletion(taskTitle: string) {
		const tasksTitles = [];
		tasksTitles.push(taskTitle)
		const reason: string = "task not found in local cache."
		const myModal = new TaskDeletionModal(this.app, tasksTitles, reason, (result) => {
			this.ret = result;
		});
		const bConfirmation = await myModal.showModal();

		return bConfirmation;
	}


	/*
	*Task has been moved in TickTick. Or it's parentage has changed.
	* Need to delete it from the old file.
	* Add it to the new project file.
	* This magically handles parentage as well.
	*/
	private async handleTickTickStructureMove(newTask: ITask, oldTask: ITask, toBeProcessed: string[]) {

		//TODO: this is Kludgy as hell. In the fulness of time, I want to get rid of all this and have something
		// like: if there are updates, and there's parent/child or project changes; build a linked list of the
		// parent child hierarchy, delete the old one and add the new one.

		// let filepath = await this.plugin.cacheOperation?.getFilepathForProjectId(oldTask.projectId);
		let filepath = await this.plugin.cacheOperation?.getFilepathForTask(oldTask.id);
		if (!filepath) {
			let errmsg = `File not found for moved newTask:  ${newTask.id}, ${newTask.title}`
			throw new Error(errmsg)
		}

		const oldProjectId: string = oldTask.projectId;
		const oldtaskItemNum: number = oldTask.items?.length;
		const oldTaskHasChildren: boolean = this.hasChildren(oldTask);
		const oldTaskId = oldTask.id;


		await this.moveTask(filepath, newTask, oldtaskItemNum, oldTaskId, oldProjectId);

		let saveTheChildren = false;
		//This was a child. It is now top level, don't delete it's children
		if (oldTask.parentId && !newTask.parentId) {
			saveTheChildren = true;
		}
		if (oldTaskHasChildren && !saveTheChildren){
			//get rid of the old children from file, but not from cache. we'll add them in later.
			for (const childId of oldTask.childIds) {
				const child = await this.plugin.cacheOperation?.loadTaskFromCacheID(childId);
				let numChildTaskItems = 0;
				if (child && child.items) {
					numChildTaskItems = child.items.length;
				}
				try {
					await this.deleteTaskFromSpecificFile(filepath, child.id, child.title, numChildTaskItems, false);
				} catch (error) {
					//assume parent child moved, child didn't. Further assume it will be taken care of on the next sync.
					console.log("Child ", childId," not found for parent: ", newTask.id)
					continue;
				}

			}
		}

		if (newTask.parentId || saveTheChildren) {
			//it's a child task. or new parent task. does it have children?
			const hasChildren = this.hasChildren(newTask);
			if (hasChildren) {
				await this.moveChildTasks(newTask, toBeProcessed, filepath);
			}
		}
	}


	private async moveChildTasks(newTask: ITask, toBeProcessed: string[], filepath: string) {
		for (const childId of newTask.childIds) {
			//Are they going to be processed later?
			if (toBeProcessed.includes(childId)) {
				//We'll deal with it in the downloaded list.
				continue;
			}
			//get it from cache
			const currentChild = await this.plugin.cacheOperation?.loadTaskFromCacheID(childId);
			if (currentChild) {
				currentChild.parentId = newTask.id;
				currentChild.projectId = newTask.projectId;
				const numChildTaskItems = currentChild.items?.length

				await this.moveTask(filepath, currentChild, numChildTaskItems, currentChild.id, currentChild.projectId);
				const currentChildHasChildren = this.hasChildren(currentChild);
				if (currentChildHasChildren) {
					const currentChild = await this.plugin.cacheOperation?.loadTaskFromCacheID(childId);
					await this.moveChildTasks(currentChild, toBeProcessed, filepath);
				}
			} else {
				//weird move. Don't break. Assume it will be taken care of on the next sync
				console.log("Child not found: ", childId)
			}

		}
	}

	private async moveTask(filepath: string, task: ITask, oldtaskItemNum: number, oldTaskId: string, oldProjectId: string) {
		await this.deleteTaskFromSpecificFile(filepath, task.id, task.title, oldtaskItemNum, false);
		await this.plugin.cacheOperation?.deleteTaskFromCache(oldTaskId);

		await this.addTasksToFile([task])
		const cleanTitle = this.plugin.taskParser?.stripOBSUrl(task.title);
		let message = "";
		if (task.projectId != oldProjectId) {
			const newProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(task.projectId)
			const oldProjectName = await this.plugin.cacheOperation?.getProjectNameByIdFromCache(oldProjectId)
			message = "Task Moved.\nTask: " + cleanTitle + "\nwas moved from\n " + oldProjectName + "\nto\n" + newProjectName;
		} else {
			if (task.parentId) {
				const parentTask = await this.plugin.cacheOperation?.loadTaskFromCacheID(task.parentId);
				const cleanParentTaskTitle = this.plugin.taskParser?.stripOBSUrl(parentTask.title)
				message = "Task has new Parent.\nTask: " + cleanTitle + "\nis now a child of\n " + cleanParentTaskTitle
			} else {
				message = "Task is now a top level task.\nTask: " + cleanTitle;
			}
		}

		new Notice(message, 0)
	}
	private compareTasks(a: ITask, b: ITask, depth = 0, tasks: ITask[]) {
		// Check for tasks with no parentId (parent tasks)
		if (!a.parentId && b.parentId) {
			return -1; // Parent task comes first
		} else if (a.parentId && !b.parentId) {
			return 1; // Task with parentId comes after
		} else if (!a.parentId && !b.parentId) {
			// No parent - sort by sortOrder
			return a.sortOrder - b.sortOrder;
		} else {
			// Use a set to track visited tasks to detect circular dependencies
			const visited = new Set();

			let currentA = a;
			while (currentA.parentId && depth < 100) { // Set a maximum depth limit (adjust as needed)
				if (visited.has(currentA.id)) {
					// Circular dependency detected - sort based on task id as a fallback
					return a.id.localeCompare(b.id);
				}
				visited.add(currentA.id);
				currentA = this.getParent(currentA.id, tasks);
			}

			let currentB = b;
			visited.clear(); // Clear visited set for task B
			while (currentB.parentId && depth < 100) {
				if (visited.has(currentB.id)) {
					// Circular dependency detected
					return a.id.localeCompare(b.id);
				}
				visited.add(currentB.id);
				currentB = this.getParent(currentB.id, tasks);
			}

			// If one stack is empty, remaining elements in the other are higher level parents
			return currentA ? -1 : 1;
		}
	}

	private getParent(taskId, tasks) {
		return tasks.find(task => task.id === taskId);
	}
}
