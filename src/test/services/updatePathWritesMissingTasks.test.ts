/**
 * Regression tests for #369.
 *
 * A task the database places in a file, but which is not actually in that file,
 * used to be skipped silently by the update path and then recorded as synced.
 * The next scan read it back as deleted-from-the-vault and offered to delete it
 * from TickTick.
 *
 * Also covers the follow-ups: the add path's "already in file" fallback, and
 * the update path when the task has no DB record -- in both cases a vault sync
 * must only be recorded when the line was actually written to the file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, TFile } from 'obsidian';
import type TickTickSync from '@/main';
import type { ITask } from '@/api/types/Task';
import type { LocalTask } from '@/db/schema';
import { FileOperation } from '@/fileOperation';
import { NewFileMap } from '@/services/NewFileMap';
import { TaskDeletionHandler } from '@/services/TaskDeletionHandler';

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

const STUB = '== Added by TickTickSync -- 2.0.1 == ';
const TASK_LINE = '- [ ] a task #ticktick %%[ticktick_id:: task-1]%%';

function makeTFile(path: string): TFile {
	return Object.assign(Object.create(TFile.prototype), { path }) as TFile;
}

const taskParserStub = {
	isMarkdownTask: (line: string): boolean => /^\s*[-*+] \[[x ]\]/i.test(line),
	getTickTickId: (line: string): string | null => line.match(/%%\[ticktick_id::\s*(\S+?)\]%%/)?.[1] ?? null,
	getNumTabs: (): number => 0,
	getTabs: (line: string): string => (line.match(/^\s*/)?.[0] ?? ''),
};

const aTask: ITask = { id: 'task-1', projectId: 'proj-a', title: 'a task' } as ITask;

function makeFileMap(content: string): NewFileMap {
	return new NewFileMap(
		{ metadataCache: { getFileCache: () => ({ listItems: [] }) } } as unknown as App,
		{
			taskParser: taskParserStub,
			fileOperation: { readFileContent: async () => content },
		} as unknown as TickTickSync,
		makeTFile('TODO/Work.md')
	);
}

interface FileOperationEnv {
	fileOperation: FileOperation;
	upsertTask: ReturnType<typeof vi.fn>;
	getWritten: () => string;
}

function makeFileOperationEnv(options: {
	fileContent: string;
	loadTaskById?: (id: string) => Promise<ITask | null>;
}): FileOperationEnv {
	let written = '';
	const file = makeTFile('TODO/Work.md');

	const app = {
		workspace: { getActiveFile: () => null, activeEditor: null },
		vault: {
			getAbstractFileByPath: () => file,
			read: async () => options.fileContent,
			cachedRead: async () => options.fileContent,
			process: async (_file: TFile, cb: (data: string) => string) => { written = cb(options.fileContent); },
		},
		metadataCache: { getFileCache: () => ({ listItems: [] }) },
	} as unknown as App;

	const upsertTask = vi.fn(async (_task: ITask, _file?: string, _timestamp?: number) => {});
	const plugin = {
		app,
		fileOperation: { readFileContent: async () => options.fileContent },
		taskParser: {
			...taskParserStub,
			convertTaskToLine: async () => TASK_LINE,
			isProjectIdChanged: async () => false,
			isParentIdChanged: () => false,
			getNoteString: () => '',
			getLineHash: async () => 'hash',
			getLinkLocation: () => ({ taskURL: null, noteURL: null }),
		},
		dateMan: { addDateHolderToTask: () => {} },
		taskRepository: {
			loadTaskById: options.loadTaskById ?? (async () => aTask),
			upsertTask,
		},
		fileTaskQueries: {
			getDefaultProjectIdForFilepath: async () => 'proj-a',
			filepathHasDefaultProjectID: async () => true,
		},
		tickTickRestAPI: { updateTask: async (t: ITask) => t },
		lastLines: new Map<string, number>(),
	} as unknown as TickTickSync;

	const fileOperation = new FileOperation(app, plugin);
	return { fileOperation, upsertTask, getWritten: () => written };
}

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
	it('is added to the file instead of being silently skipped, and records a vault sync', async () => {
		const { fileOperation, upsertTask, getWritten } = makeFileOperationEnv({ fileContent: STUB });

		await fileOperation.synchronizeToVault('TODO/Work.md', [aTask], true);

		// the line was actually written to the file...
		expect(getWritten()).toContain('ticktick_id:: task-1');

		// ...so recording a vault sync for it is now truthful
		expect(upsertTask).toHaveBeenCalledTimes(1);
		const [taskArg, pathArg, timestampArg] = upsertTask.mock.calls[0];
		expect(taskArg.id).toBe('task-1');
		expect(pathArg).toBe('TODO/Work.md');
		expect(typeof timestampArg).toBe('number');
	});

	it('records a vault sync when the add path finds the task already in the file', async () => {
		const { fileOperation, upsertTask } = makeFileOperationEnv({ fileContent: `${STUB}\n${TASK_LINE}` });

		await fileOperation.synchronizeToVault('TODO/Work.md', [aTask], false);

		expect(upsertTask).toHaveBeenCalledTimes(1);
		const [taskArg, pathArg, timestampArg] = upsertTask.mock.calls[0];
		expect(taskArg.id).toBe('task-1');
		expect(pathArg).toBe('TODO/Work.md');
		expect(typeof timestampArg).toBe('number');
	});

	it('does not record a vault sync when the task has no DB record (nothing was written)', async () => {
		const { fileOperation, upsertTask } = makeFileOperationEnv({
			fileContent: `${STUB}\n${TASK_LINE}`,
			loadTaskById: async () => null,
		});

		await fileOperation.synchronizeToVault('TODO/Work.md', [aTask], true);

		// upserted without a file path, so it can't look user-deleted next scan
		expect(upsertTask).toHaveBeenCalledTimes(1);
		const [taskArg, pathArg] = upsertTask.mock.calls[0];
		expect(taskArg.id).toBe('task-1');
		expect(pathArg).toBeUndefined();
	});
});

describe('TaskDeletionHandler on an unreadable file', () => {
	function makeDeletionHandlerEnv(fileContent: string) {
		const file = makeTFile('TODO/Work.md');
		const app = {
			vault: {
				getAbstractFileByPath: () => file,
				getMarkdownFiles: () => [],
			},
		} as unknown as App;
		const plugin = {
			fileOperation: { readFileContent: async () => fileContent },
		} as unknown as TickTickSync;

		const handler = new TaskDeletionHandler(app, plugin);
		const deleteTasksByIds = vi.fn(async (_ids: string[]) => []);
		Object.assign(handler, { deleteTasksByIds });
		return { handler, deleteTasksByIds };
	}

	beforeEach(() => {
		notices.length = 0;
		tasksInFile.length = 0;
		tasksInFile.push({
			localId: 'tt:task-1', taskId: 'task-1', task: aTask,
			updatedAt: 1, file: 'TODO/Work.md', source: 'ticktick',
		});
	});

	it('does not treat empty content as "every task deleted", and tells the user', async () => {
		const { handler, deleteTasksByIds } = makeDeletionHandlerEnv('');

		await handler.checkFileForDeletedTasks('TODO/Work.md');

		expect(deleteTasksByIds).not.toHaveBeenCalled();
		expect(notices.some(n => n.includes('could not read'))).toBe(true);
	});

	it('still detects a genuine deletion when the file is readable', async () => {
		const { handler, deleteTasksByIds } = makeDeletionHandlerEnv('- [ ] some other task\n');

		await handler.checkFileForDeletedTasks('TODO/Work.md');

		expect(deleteTasksByIds).toHaveBeenCalledWith(['task-1']);
	});
});
