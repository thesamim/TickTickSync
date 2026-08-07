/**
 * Scope: TaskParser.convertLineToTask() and the stopInjectingTickTickTag
 * setting. When that setting is enabled, the "ticktick" control tag never
 * flows into task.tags sent to TickTick; when disabled (the default, for
 * backwards compatibility) it is kept. Also covers TaskParser.
 * preserveTickTickTag(), which carries over a *genuinely* TT-side
 * "ticktick" tag. Distinct from taskParser.test.ts's getAllTagsFromLineText
 * suite, which covers raw tag extraction from line text.
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

function setStopInjecting(value: boolean) {
	((getSettings as unknown as () => Record<string, unknown>)()).stopInjectingTickTickTag = value;
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

	function baseSettings() {
		((getSettings as unknown as () => Record<string, string>)()).noteDelimiter = '';
		((getSettings as unknown as () => Record<string, string>)()).fileLinksInTickTick = 'noLink';
	}

	it('excludes the ticktick control tag from task.tags when stopInjectingTickTickTag is on, keeping other tags', async () => {
		baseSettings();
		setStopInjecting(true);

		const line = `- [ ] Task #ticktick #work %%[ticktick_id:: ${id}]%%`;
		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const task = await parser.convertLineToTask(line, 0, filepath, fileMapFor(line), null);

		expect(task.tags).toEqual(['work']);
	});

	it('produces an empty tags array when ticktick is the only tag on the line and stopInjectingTickTickTag is on', async () => {
		baseSettings();
		setStopInjecting(true);

		const line = `- [ ] Task #ticktick %%[ticktick_id:: ${id}]%%`;
		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const task = await parser.convertLineToTask(line, 0, filepath, fileMapFor(line), null);

		expect(task.tags).toEqual([]);
	});

	it('keeps the ticktick control tag in task.tags when stopInjectingTickTickTag is off (default, backwards compatible)', async () => {
		baseSettings();
		setStopInjecting(false);

		const line = `- [ ] Task #ticktick #work %%[ticktick_id:: ${id}]%%`;
		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const task = await parser.convertLineToTask(line, 0, filepath, fileMapFor(line), null);

		expect(task.tags).toEqual(['ticktick', 'work']);
	});
});

describe('TaskParser.preserveTickTickTag', () => {
	const parser = new TaskParser({} as unknown, {} as unknown);
	parser.plugin = makePlugin(parser);

	it('preserves a genuine TT-side ticktick tag onto the line task when the setting is on', () => {
		setStopInjecting(true);

		const lineTask = { tags: ['work'] } as { tags: string[] };
		const savedTask = { tags: ['work', 'ticktick'] } as { tags: string[] };

		parser.preserveTickTickTag(lineTask, savedTask);

		expect(lineTask.tags).toEqual(['work', 'ticktick']);
	});

	it('does not add ticktick when the saved task has no ticktick tag', () => {
		setStopInjecting(true);

		const lineTask = { tags: ['work'] } as { tags: string[] };
		const savedTask = { tags: ['work'] } as { tags: string[] };

		parser.preserveTickTickTag(lineTask, savedTask);

		expect(lineTask.tags).toEqual(['work']);
	});

	it('does not duplicate ticktick when the line task already carries it', () => {
		setStopInjecting(true);

		const lineTask = { tags: ['work', 'ticktick'] } as { tags: string[] };
		const savedTask = { tags: ['ticktick'] } as { tags: string[] };

		parser.preserveTickTickTag(lineTask, savedTask);

		expect(lineTask.tags).toEqual(['work', 'ticktick']);
	});

	it('is a no-op when the setting is off (the plugin still injects the tag itself)', () => {
		setStopInjecting(false);

		const lineTask = { tags: ['work'] } as { tags: string[] };
		const savedTask = { tags: ['work', 'ticktick'] } as { tags: string[] };

		parser.preserveTickTickTag(lineTask, savedTask);

		expect(lineTask.tags).toEqual(['work']);
	});
});

describe('TaskParser.stripTickTickTag', () => {
	const parser = new TaskParser({} as unknown, {} as unknown);
	parser.plugin = makePlugin(parser);

	it('removes the ticktick tag from the task, keeping other tags', () => {
		const lineTask = { tags: ['ticktick', 'work', 'TickTick'] } as { tags: string[] };

		parser.stripTickTickTag(lineTask);

		expect(lineTask.tags).toEqual(['work']);
	});

	it('leaves an empty tags array when ticktick was the only tag', () => {
		const lineTask = { tags: ['ticktick'] } as { tags: string[] };

		parser.stripTickTickTag(lineTask);

		expect(lineTask.tags).toEqual([]);
	});

	it('handles an undefined tags array', () => {
		const lineTask = {} as { tags: string[] };

		parser.stripTickTickTag(lineTask);

		expect(lineTask.tags).toEqual([]);
	});

	it('is a no-op when there is no ticktick tag', () => {
		const lineTask = { tags: ['work'] } as { tags: string[] };

		parser.stripTickTickTag(lineTask);

		expect(lineTask.tags).toEqual(['work']);
	});
});
