/**
 * Scope: TaskParser.convertLineToTask() never including the "ticktick"
 * control tag in the resulting task.tags sent to TickTick. Distinct from
 * taskParser.test.ts's getAllTagsFromLineText suite, which covers raw tag
 * extraction from line text (before this filtering is applied).
 */
import { describe, expect, it, vi } from 'vitest';
import { TaskParser } from '@/taskParser';
import type { ITaskRecord } from '@/services/NewFileMap';
import { getSettings } from '@/settings';

vi.mock('@/db/projects', () => ({
	getAllProjects: vi.fn().mockResolvedValue([]),
}));

function makePlugin(parser: TaskParser) {
	return {
		taskParser: parser,
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

describe('TaskParser.convertLineToTask ticktick tag exclusion (#3)', () => {
	const id = 'abcdefabcdefabcdefabcdef';
	const filepath = 'Folder/File.md';

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

	it('excludes the ticktick control tag from task.tags, keeping other tags', async () => {
		((getSettings as unknown as () => Record<string, string>)()).noteDelimiter = '';
		((getSettings as unknown as () => Record<string, string>)()).fileLinksInTickTick = 'noLink';

		const line = `- [ ] Task #ticktick #work %%[ticktick_id:: ${id}]%%`;
		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const task = await parser.convertLineToTask(line, 0, filepath, fileMapFor(line), null);

		expect(task.tags).toEqual(['work']);
	});

	it('produces an empty tags array when ticktick is the only tag on the line', async () => {
		((getSettings as unknown as () => Record<string, string>)()).noteDelimiter = '';
		((getSettings as unknown as () => Record<string, string>)()).fileLinksInTickTick = 'noLink';

		const line = `- [ ] Task #ticktick %%[ticktick_id:: ${id}]%%`;
		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const task = await parser.convertLineToTask(line, 0, filepath, fileMapFor(line), null);

		expect(task.tags).toEqual([]);
	});
});
