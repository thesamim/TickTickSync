/**
 * Scope: TaskParser.convertLineToTask() tag-hierarchy creation when a user
 * enters a tag with more than two levels, eg `#firstLevel/secondLevel/thirdLevel/fourthLevel`.
 * TickTick only supports two hierarchy levels, so the second and subsequent
 * levels must be joined into a single hyphen-separated child name, keeping
 * only the first level as the parent: `firstLevel/secondLevel-thirdLevel-fourthLevel`.
 */
import { describe, expect, it, vi } from 'vitest';
import { TaskParser } from '@/taskParser';
import { TagService } from '@/services/TagService';
import type { ITaskRecord } from '@/services/NewFileMap';
import { getSettings } from '@/settings';

vi.mock('@/db/projects', () => ({
	getAllProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/db/dexie', () => ({
	db: {
		tags: {
			toArray: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
			clear: vi.fn(),
			bulkPut: vi.fn(),
			put: vi.fn(),
		},
	},
}));

vi.mock('@/utils/logger', () => ({ default: { error: vi.fn() } }));

function makePlugin(parser: TaskParser) {
	return {
		taskParser: parser,
		tagService: new TagService(),
		tickTickRestAPI: {
			CreateTags: vi.fn().mockResolvedValue(true),
		},
		fileTaskQueries: {
			getDefaultProjectIdForFilepath: (_: string) => 'proj-1',
		},
		fileMetadataService: {
			getFilepathForTask: (_: string) => 'Some/Path.md',
		},
		dateMan: {
			parseDates: (_: string) => ({}),
			stripDatesFromLine: (s: string) => s,
			formatDateToISO: (_: Date) => '2025-01-01T00:00:00.000Z',
		},
		app: { vault: { getName: () => 'TestVault' } },
	} as unknown;
}

describe('TaskParser.convertLineToTask deep tag hierarchy', () => {
	const id = 'abcdefabcdefabcdefabcdef';
	const filepath = 'Folder/File.md';

	function baseSettings() {
		((getSettings as unknown as () => Record<string, string>)()).noteDelimiter = '';
		((getSettings as unknown as () => Record<string, string>)()).fileLinksInTickTick = 'noLink';
		((getSettings as unknown as () => Record<string, unknown>)()).stopInjectingTickTickTag = false;
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

	it('flattens the 2nd+ levels into a hyphen-separated child name on the task tags', async () => {
		baseSettings();

		const line = `- [ ] Task #firstLevel/secondLevel/thirdLevel/fourthLevel %%[ticktick_id:: ${id}]%%`;
		const parser = new TaskParser({} as unknown, {} as unknown);
		const plugin = makePlugin(parser);
		parser.plugin = plugin;

		const api = (plugin as { tickTickRestAPI: { CreateTags: ReturnType<typeof vi.fn> } }).tickTickRestAPI;

		const task = await parser.convertLineToTask(line, 0, filepath, fileMapFor(line), null);

		expect(task.tags).toEqual(['secondlevel-thirdlevel-fourthlevel']);
		expect(api.CreateTags).toHaveBeenCalledWith([
			{ label: 'firstLevel', name: 'firstlevel', parent: null },
			{ label: 'secondLevel/thirdLevel/fourthLevel', name: 'secondlevel-thirdlevel-fourthlevel', parent: 'firstlevel' },
		]);
	});

	it('keeps a plain two-level tag as parent/child with no further flattening', async () => {
		baseSettings();

		const line = `- [ ] Task #firstLevel/secondLevel %%[ticktick_id:: ${id}]%%`;
		const parser = new TaskParser({} as unknown, {} as unknown);
		const plugin = makePlugin(parser);
		parser.plugin = plugin;

		const api = (plugin as { tickTickRestAPI: { CreateTags: ReturnType<typeof vi.fn> } }).tickTickRestAPI;

		const task = await parser.convertLineToTask(line, 0, filepath, fileMapFor(line), null);

		expect(task.tags).toEqual(['secondlevel']);
		expect(api.CreateTags).toHaveBeenCalledWith([
			{ label: 'firstLevel', name: 'firstlevel', parent: null },
			{ label: 'secondLevel', name: 'secondlevel', parent: 'firstlevel' },
		]);
	});
});