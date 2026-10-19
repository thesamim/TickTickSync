/**
 * Scope: TickTick "Won't do" (status -1) <-> Obsidian Tasks "cancelled"
 * checkbox `- [-]` (issue #15).
 *
 * Before this change a won't-do task was written back as `- [ ]`, read as
 * open, and pushed to TickTick as reopened. Every pattern that decides
 * whether a line is a TickTick task must also accept `[-]`, otherwise the
 * line stops being recognised as a task.
 */
import { describe, expect, it, vi } from 'vitest';
import { checkboxForStatus, REGEX, TASK_STATUS, TaskParser } from '@/taskParser';
import { TaskModificationDetector } from '@/services/TaskModificationDetector';
import type { ITask } from '@/api/types/Task';
import type { ITaskRecord } from '@/services/NewFileMap';
import { getSettings } from '@/settings';

vi.mock('@/db/projects', () => ({
	getAllProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/utils/logger', () => ({ default: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const ID = 'abcdefabcdefabcdefabcdef';
const FILEPATH = 'Folder/File.md';

function makePlugin(parser: TaskParser) {
	return {
		taskParser: parser,
		fileTaskQueries: {
			getDefaultProjectIdForFilepath: (_: string) => 'proj-1',
		},
		fileMetadataService: {
			getFilepathForTask: (_: string) => FILEPATH,
		},
		dateMan: {
			parseDates: (_: string) => ({}),
			stripDatesFromLine: (s: string) => s,
			addDatesToLine: (s: string) => s,
			formatDateToISO: (_: Date) => '2025-01-01T00:00:00.000Z',
		},
		app: { vault: { getName: () => 'TestVault' } },
	} as unknown;
}

function makeParser() {
	const settings = (getSettings as unknown as () => Record<string, unknown>)();
	settings.noteDelimiter = '';
	settings.fileLinksInTickTick = 'noLink';
	settings.taskLinksInObsidian = 'noLink';
	settings.stopInjectingTickTickTag = false;
	const parser = new TaskParser({} as unknown, {} as unknown);
	parser.plugin = makePlugin(parser);
	return parser;
}

function fileMapFor(line: string) {
	return {
		getTaskItems: (_: string) => [],
		getTaskRecord: (_: string) => ({
			task: line,
			parentId: '',
			taskLines: [],
		} satisfies Partial<ITaskRecord>)
	} as unknown;
}

function makeTask(status: number): ITask {
	return {
		id: ID,
		projectId: 'proj-1',
		title: 'Throwaway task',
		status,
		tags: [],
		priority: 0,
		desc: '',
		content: '',
		items: [],
	} as ITask;
}

describe('checkboxForStatus', () => {
	it('maps TickTick status to the checkbox character', () => {
		expect(checkboxForStatus(TASK_STATUS.WONT_DO)).toBe('-');
		expect(checkboxForStatus(TASK_STATUS.OPEN)).toBe(' ');
		expect(checkboxForStatus(TASK_STATUS.COMPLETED)).toBe('x');
		expect(checkboxForStatus(1)).toBe('x');
		expect(checkboxForStatus(undefined)).toBe(' ');
	});
});

describe('convertTaskToLine writes the won\'t do checkbox', () => {
	it('writes - [-] for status -1', async () => {
		const line = await makeParser().convertTaskToLine(makeTask(-1), 0);
		expect(line.startsWith('- [-] Throwaway task')).toBe(true);
	});

	it('still writes - [x] for completed and - [ ] for open', async () => {
		const parser = makeParser();
		expect((await parser.convertTaskToLine(makeTask(2), 0)).startsWith('- [x] ')).toBe(true);
		expect((await parser.convertTaskToLine(makeTask(0), 0)).startsWith('- [ ] ')).toBe(true);
	});
});

describe('convertLineToTask reads the won\'t do checkbox', () => {
	it.each([
		['- [-]', -1],
		['- [x]', 2],
		['- [X]', 2],
		['- [ ]', 0],
	])('%s -> status %i', async (checkbox, status) => {
		const line = `${checkbox} Throwaway task #ticktick %%[ticktick_id:: ${ID}]%%`;
		const task = await makeParser().convertLineToTask(line, 0, FILEPATH, fileMapFor(line), null);
		expect(task.status).toBe(status);
		expect(task.title).toBe('Throwaway task');
	});

	it('reads an indented [-] subtask as won\'t do with a clean title', async () => {
		const line = `\t- [-] Child task #ticktick %%[ticktick_id:: ${ID}]%%`;
		const task = await makeParser().convertLineToTask(line, 0, FILEPATH, fileMapFor(line), null);
		expect(task.status).toBe(-1);
		expect(task.title).toBe('Child task');
	});

	it('round-trips status -1 without a status change', async () => {
		const parser = makeParser();
		const ticktickTask = makeTask(-1);
		const line = await parser.convertTaskToLine({ ...ticktickTask }, 0);
		const lineTask = await parser.convertLineToTask(line, 0, FILEPATH, fileMapFor(line), null);
		expect(parser.isStatusChanged(
			lineTask as unknown as Record<string, unknown>,
			ticktickTask as unknown as Record<string, unknown>
		)).toBe(false);
	});
});

describe('[-] lines stay recognised as TickTick tasks', () => {
	const parser = makeParser();
	const line = `- [-] Throwaway task #ticktick %%[ticktick_id:: ${ID}]%%`;
	const indented = `\t- [-] Throwaway task #ticktick %%[ticktick_id:: ${ID}]%%`;

	it('isMarkdownTask / hasTickTickTag / hasTickTickId', () => {
		expect(parser.isMarkdownTask(line)).toBe(true);
		expect(parser.hasTickTickTag(line)).toBe(true);
		expect(parser.hasTickTickTag(indented)).toBe(true);
		expect(parser.hasTickTickId(line)).toBe(true);
		expect(REGEX.TickTick_TAG.test(line)).toBe(true);
	});

	it('isIndentedTask and removeTaskIndentation accept [-]', () => {
		expect(parser.isIndentedTask(indented)).toBe(true);
		expect(parser.removeTaskIndentation(indented).startsWith('- [-] ')).toBe(true);
	});

	it('getTaskContentFromLineText strips the [-] checkbox', () => {
		expect(parser.getTaskContentFromLineText('- [-] Throwaway task')).toBe('Throwaway task');
		expect(parser.getTaskContentFromLineText('\t- [-] Throwaway task')).toBe('Throwaway task');
	});

	it('isTaskOpen treats [-] as closed', () => {
		expect(parser.isTaskOpen('- [-] Throwaway task')).toBe(false);
		expect(parser.isTaskOpen('- [ ] Throwaway task')).toBe(true);
		expect(parser.isTaskOpen('- [x] Throwaway task')).toBe(false);
	});

	it('getTaskStatusFromLineText', () => {
		expect(parser.getTaskStatusFromLineText('- [-] a')).toBe(-1);
		expect(parser.getTaskStatusFromLineText('- [x] a')).toBe(2);
		expect(parser.getTaskStatusFromLineText('- [ ] a')).toBe(0);
	});
});

describe('checklist items have no won\'t do state: [-] closes the item', () => {
	it('taskFromLine reports [-] as closed', () => {
		const parser = makeParser();
		expect(parser.taskFromLine('\t- [-] item %%0123456789abcdef01234567%%')?.status).toBe(true);
		expect(parser.taskFromLine('\t- [ ] item %%0123456789abcdef01234567%%')?.status).toBe(false);
	});
});

describe('TaskModificationDetector.handleStatusChange', () => {
	function makeDetector() {
		const api = {
			AbandonTask: vi.fn().mockResolvedValue(true),
			CloseTask: vi.fn().mockResolvedValue(true),
			OpenTask: vi.fn().mockResolvedValue(undefined),
		};
		const repo = {
			abandonTask: vi.fn().mockResolvedValue('proj-1'),
			closeTask: vi.fn().mockResolvedValue('proj-1'),
			reopenTask: vi.fn().mockResolvedValue('proj-1'),
		};
		const plugin = { tickTickRestAPI: api, taskRepository: repo } as unknown;
		const detector = new TaskModificationDetector({} as never, plugin as never);
		const handle = (task: ITask) =>
			(detector as unknown as { handleStatusChange(t: ITask): Promise<void> }).handleStatusChange(task);
		return { api, repo, handle };
	}

	it('pushes status -1 as won\'t do, not as completed', async () => {
		const { api, repo, handle } = makeDetector();
		await handle(makeTask(-1));
		expect(api.AbandonTask).toHaveBeenCalledWith(ID, 'proj-1');
		expect(repo.abandonTask).toHaveBeenCalledWith(ID);
		expect(api.CloseTask).not.toHaveBeenCalled();
		expect(api.OpenTask).not.toHaveBeenCalled();
	});

	it('still closes status 2 and reopens status 0', async () => {
		const closed = makeDetector();
		await closed.handle(makeTask(2));
		expect(closed.api.CloseTask).toHaveBeenCalledWith(ID, 'proj-1');
		expect(closed.api.AbandonTask).not.toHaveBeenCalled();

		const open = makeDetector();
		await open.handle(makeTask(0));
		expect(open.api.OpenTask).toHaveBeenCalledWith(ID, 'proj-1');
		expect(open.api.AbandonTask).not.toHaveBeenCalled();
	});
});
