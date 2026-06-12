import { App, Modal, Setting, TFile } from 'obsidian';
import TickTickSync from '@/main';
import log from '@/utils/logger';
import type { ITask } from '@/api/types/Task';

export interface DuplicateSelection {
    taskId: string;
    taskTitle?: string;
    filePath: string;
    selected: boolean;
}

export class FoundDuplicateTasksModal extends Modal {
    private resolvePromise: (value: boolean) => void;
    private selections: DuplicateSelection[] = [];
    private sortColumn: 'title' | 'file' | null = null;
    private sortDirection: 'asc' | 'desc' = 'asc';
    private tableBody: HTMLTableSectionElement;

    constructor(
        app: App,
        private plugin: TickTickSync,
        private duplicates: Record<string, string[]>,
        private taskIds: Record<string, string>
    ) {
        super(app);
        this.titleEl.setText('Duplicate Tasks Found');

        // Initialize selections: for each taskId, we have the original file and the duplicate files
        for (const taskId in duplicates) {
            const originalFile = taskIds[taskId];
            const duplicateFiles = duplicates[taskId];

            this.selections.push({ taskId, filePath: originalFile, selected: false });
            duplicateFiles.forEach(file => {
                this.selections.push({ taskId, filePath: file, selected: false });
            });
        }
    }

    async onOpen() {
        const { contentEl, titleEl } = this;

        titleEl.setText('Duplicate Tasks Found');

        // Fetch task titles for all unique task IDs
        const uniqueTaskIds = [...new Set(this.selections.map(s => s.taskId))];
        const taskMap = new Map<string, string>();
        await Promise.all(uniqueTaskIds.map(async (id) => {
            const task = await this.plugin.taskRepository.loadTaskById(id);
            taskMap.set(id, task?.title);
        }));

        this.selections.forEach((item) => {
            item.taskTitle = taskMap.get(item.taskId);
        });

        contentEl.createEl('p', { 
            text: 'The following tasks were found in multiple files in your metadata. This causes unpredictable sync results. Select which instances to REMOVE from your files and metadata, or cancel to handle it manually.' 
        });

        const table = contentEl.createEl('table', { cls: 'projects-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Remove?' });

        const titleHeader = headerRow.createEl('th', { cls: 'sortable-header' });
        titleHeader.style.cursor = 'pointer';
        titleHeader.style.userSelect = 'none';
        titleHeader.setText('Task Title ⇅');
        titleHeader.addEventListener('click', () => this.sortBy('title', titleHeader));

        const fileHeader = headerRow.createEl('th', { cls: 'sortable-header' });
        fileHeader.style.cursor = 'pointer';
        fileHeader.style.userSelect = 'none';
        fileHeader.setText('File Path ⇅');
        fileHeader.addEventListener('click', () => this.sortBy('file', fileHeader));

        this.tableBody = table.createEl('tbody');
        this.renderTableRows();

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Cancel & Abort Sync')
                .onClick(() => {
                    this.close();
                    this.resolvePromise(false);
                }))
            .addButton(btn => btn
                .setButtonText('Apply & Continue Sync')
                .setCta()
                .onClick(async () => {
                    await this.performDeletions();
                    this.close();
                    this.resolvePromise(true);
                }));
    }

    private renderTableRows() {
        this.tableBody.empty();

        this.selections.forEach((item) => {
            const row = this.tableBody.createEl('tr');

            const checkCell = row.createEl('td', { cls: 'project-table-border' });
            const checkbox = checkCell.createEl('input', { type: 'checkbox' });
            checkbox.checked = item.selected;
            checkbox.addEventListener('change', () => {
                item.selected = checkbox.checked;
            });

            const title = item.taskTitle || item.taskId;
            const displayTitle = title.length > 20 ? title.substring(0, 20) + '...' : title;
            row.createEl('td', { cls: 'project-table-border', text: displayTitle });
            row.createEl('td', { cls: 'project-table-border', text: item.filePath });
        });
    }

    private sortBy(column: 'title' | 'file', headerEl: HTMLTableCellElement) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        this.selections.sort((a, b) => {
            let compareA: string;
            let compareB: string;

            if (column === 'title') {
                compareA = (a.taskTitle || a.taskId).toLowerCase();
                compareB = (b.taskTitle || b.taskId).toLowerCase();
            } else {
                compareA = a.filePath.toLowerCase();
                compareB = b.filePath.toLowerCase();
            }

            const comparison = compareA.localeCompare(compareB);
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });

        // Update header text with sort indicator
        const arrow = this.sortDirection === 'asc' ? '↑' : '↓';
        const label = column === 'title' ? 'Task Title' : 'File Path';
        headerEl.setText(`${label} ${arrow}`);

        this.renderTableRows();
    }

    private async performDeletions() {
        const toDelete = this.selections.filter(s => s.selected);
        
        // Group by filePath to minimize file operations
        const groupedDeletions: Record<string, string[]> = {};
        for (const item of toDelete) {
            if (!groupedDeletions[item.filePath]) {
                groupedDeletions[item.filePath] = [];
            }
            groupedDeletions[item.filePath].push(item.taskId);
        }

        for (const filePath in groupedDeletions) {
            const taskIds = groupedDeletions[filePath];
            log.info(`Removing ${taskIds.length} duplicate task references from metadata and file ${filePath}`);
            
            for (const taskId of taskIds) {
                await this.plugin.fileMetadataService.removeTaskFromFile(filePath, taskId);
            }

            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                // We use fake ITask objects as only 'id' is required by deleteTasksFromSpecificFile
                const dummyTasks = taskIds.map(id => ({ id } as ITask));
                await this.plugin.fileOperation.deleteTasksFromSpecificFile(file, dummyTasks, false);
            }
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    public showModal(): Promise<boolean> {
        this.open();
        return new Promise(resolve => {
            this.resolvePromise = resolve;
        });
    }
}
