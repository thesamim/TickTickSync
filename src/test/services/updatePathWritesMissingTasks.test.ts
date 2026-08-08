/**
 * Regression tests for #369.
 *
 * A task the database places in a file, but which is not actually in that file,
 * used to be skipped silently by the update path and then recorded as synced.
 * The next scan read it back as deleted-from-the-vault and offered to delete it
 * from TickTick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ITask } from '@/api/types/Task';
import type { LocalTask } from '@/db/schema';

const notices: string[] = [];

vi.mock('obsidian', () => ({
	App: vi.fn(),
	AbstractInputSuggest: class {},
	Modal: vi.fn(),
	Notice: vi.fn(function (msg: string) { notices.push(msg); }),
	Plugin: vi.fn(),
	PluginSettingTab: vi.fn(),
	TFile: vi.fn(),
	TFolder: vi.fn(),
	MarkdownView: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
	default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), trace: vi.fn() },
}));

const tasksInFile: LocalTask[] = [];

// fileOperation.ts imports TickTickSync from '@/main' as a value, which drags in
// the whole plugin (and Svelte) — stub it out.
vi.mock('@/main', () => ({ default: class {} }));

vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			where: vi.fn(() => ({
				equals: () => ({
					toArray: async () => tasksInFile,
					first: async () => tasksInFile[0],
					count: async () => tasksInFile.length,
				}),
			})),
			update: vi.fn(),
			toArray: vi.fn(async () => tasksInFile),
		},
	},
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({ enableFullVaultSync: false })),
	getDefaultFolder: vi.fn(() => ''),
}));

import { TFile } from 'obsidian';
import { NewFileMap } from '@/services/NewFileMap';
import { TaskDeletionHandler } from '@/services/TaskDeletionHandler';

const STUB = '== Added by TickTickSync -- 2.0.1 == ';
const TASK_LINE = '- [ ] a task #ticktick %%[ticktick_id:: task-1]%%';

const taskParser = {
	isMarkdownTask: (line: string) => /^\s*[-*+] \[[x ]\]/i.test(line),
	getTickTickId: (line: string) => line.match(/%%\[ticktick_id::\s*(\S+?)\]%%/)?.[1] ?? null,
	getNumTabs: () => 0,
	getTabs: (line: string) => (line.match(/^\s*/)?.[0] ?? ''),
};

function makeFileMap(content: string) {
	return new NewFileMap(
		{ metadataCache: { getFileCache: () => ({ listItems: [] }) } } as never,
		{ taskParser } as never,
		Object.assign(Object.create(TFile.prototype), { path: 'TODO/Work.md' }) as never
	);
}

const aTask = { id: 'task-1', projectId: 'proj-a', title: 'a task' } as ITask;

describe('NewFileMap.updateTask', () => {
	it('reports failure and writes nothing when the task is not in the file', async () => {
		const fileMap = makeFileMap(STUB);
		await fileMap.init(STUB);

		const before = fileMap.getFileLines();
		const written = fileMap.updateTask(aTask, TASK_LINE);

		expect(written).toBe(false);
		expect(fileMap.getFileLines()).toBe(before);
	});

	it('reports success and rewrites the line when the task is in the file', async () => {
		const fileMap = makeFileMap(`${STUB}\n${TASK_LINE}`);
		await fileMap.init(`${STUB}\n${TASK_LINE}`);

		const written = fileMap.updateTask(aTask, '- [x] a task #ticktick %%[ticktick_id:: task-1]%%');

		expect(written).toBe(true);
		expect(fileMap.getFileLines()).toContain('- [x] a task');
	});
});

describe('persistToFile: a task marked for update but missing from the file', () => {
	it('is added to the file instead of being silently skipped', async () => {
		const { FileOperation } = await import('@/fileOperation');

		let written = '';
		const file = Object.assign(Object.create(TFile.prototype), { path: 'TODO/Work.md' });

		const app = {
			workspace: { getActiveFile: () => null, activeEditor: null },
			vault: {
				getAbstractFileByPath: () => file,
				read: async () => STUB,
				cachedRead: async () => STUB,
				process: async (_f: unknown, cb: (d: string) => string) => { written = cb(STUB); },
			},
			metadataCache: { getFileCache: () => ({ listItems: [] }) },
		};

		const upsertTask = vi.fn(async (..._args: unknown[]) => {});
		const plugin = {
			app,
			taskParser: {
				...taskParser,
				convertTaskToLine: async () => TASK_LINE,
				isProjectIdChanged: async () => false,
				isParentIdChanged: () => false,
				getNoteString: () => '',
				getLineHash: async () => 'hash',
				getLinkLocation: () => ({ taskURL: null, noteURL: null }),
			},
			dateMan: { addDateHolderToTask: () => {} },
			taskRepository: { loadTaskById: async () => aTask, upsertTask },
			fileTaskQueries: {
				getDefaultProjectIdForFilepath: async () => 'proj-a',
				filepathHasDefaultProjectID: async () => true,
			},
			tickTickRestAPI: { updateTask: async (t: ITask) => t },
			lastLines: new Map<string, number>(),
		};

		const fileOperation = new FileOperation(app as never, plugin as never);
		(plugin as unknown as { fileOperation: unknown }).fileOperation = fileOperation;

		await fileOperation.synchronizeToVault('TODO/Work.md', [aTask], true);

		// the line was actually written to the file...
		expect(written).toContain('ticktick_id:: task-1');

		// ...so recording a vault sync for it is now truthful
		expect(upsertTask).toHaveBeenCalledTimes(1);
		const [taskArg, pathArg, timestampArg] = upsertTask.mock.calls[0];
		expect((taskArg as ITask).id).toBe('task-1');
		expect(pathArg).toBe('TODO/Work.md');
		expect(typeof timestampArg).toBe('number');
	});
});

describe('TaskDeletionHandler on an unreadable file', () => {
	beforeEach(() => {
		notices.length = 0;
		tasksInFile.length = 0;
		tasksInFile.push({
			localId: 'tt:task-1', taskId: 'task-1', task: aTask,
			updatedAt: 1, file: 'TODO/Work.md', source: 'ticktick',
		});
	});

	it('does not treat empty content as "every task deleted", and tells the user', async () => {
		const file = Object.assign(Object.create(TFile.prototype), { path: 'TODO/Work.md' });
		const deleteTasksByIds = vi.fn(async () => []);

		const handler = new TaskDeletionHandler(
			{ vault: { getAbstractFileByPath: () => file, getMarkdownFiles: () => [] } } as never,
			{ fileOperation: { readFileContent: async () => '' } } as never
		);
		(handler as unknown as { deleteTasksByIds: unknown }).deleteTasksByIds = deleteTasksByIds;

		await handler.checkFileForDeletedTasks('TODO/Work.md');

		expect(deleteTasksByIds).not.toHaveBeenCalled();
		expect(notices.some(n => n.includes('could not read'))).toBe(true);
	});

	it('still detects a genuine deletion when the file is readable', async () => {
		const file = Object.assign(Object.create(TFile.prototype), { path: 'TODO/Work.md' });
		const deleteTasksByIds = vi.fn(async () => []);

		const handler = new TaskDeletionHandler(
			{ vault: { getAbstractFileByPath: () => file, getMarkdownFiles: () => [] } } as never,
			{ fileOperation: { readFileContent: async () => '- [ ] some other task\n' } } as never
		);
		(handler as unknown as { deleteTasksByIds: unknown }).deleteTasksByIds = deleteTasksByIds;

		await handler.checkFileForDeletedTasks('TODO/Work.md');

		expect(deleteTasksByIds).toHaveBeenCalledWith(['task-1']);
	});
});
