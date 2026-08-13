/**
 * Scope: TaskParser.convertTaskToLine() when fileLinksInTickTick is
 * 'noteLink'. The file link the plugin prepends to a task note when the
 * task is pushed to TickTick must be stripped again when the note comes
 * back — but only when the first line really is that link. A task created
 * in TickTick with a note must keep its first (real) line.
 */
import { describe, expect, it, vi } from 'vitest';
import { TaskParser } from '@/taskParser';
import type { ITask } from '@/api/types/Task';
import { getSettings } from '@/settings';

vi.mock('@/db/projects', () => ({
	getAllProjects: vi.fn().mockResolvedValue([]),
}));

function makePlugin(parser: TaskParser) {
	return {
		taskParser: parser,
		fileMetadataService: {
			getFilepathForTask: (_: string) => 'Folder/File.md',
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

function setSettings(fileLinksInTickTick: string, taskLinksInObsidian: string) {
	((getSettings as unknown as () => Record<string, string>)()).noteDelimiter = '';
	((getSettings as unknown as () => Record<string, string>)()).fileLinksInTickTick = fileLinksInTickTick;
	((getSettings as unknown as () => Record<string, string>)()).taskLinksInObsidian = taskLinksInObsidian;
}

function makeTask(desc: string): ITask {
	return {
		id: 'abcdefabcdefabcdefabcdef',
		projectId: 'proj-1',
		title: 'Task with note',
		status: 0,
		tags: [],
		priority: 0,
		desc,
		content: '',
		items: [],
	} as ITask;
}

describe('TaskParser.convertTaskToLine note first line (fileLinksInTickTick = noteLink)', () => {
	it('keeps the first note line when it is not a file link (task created in TickTick)', async () => {
		setSettings('noteLink', 'taskLink');

		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const line = await parser.convertTaskToLine(makeTask('real first line\nsecond line'), 0);

		expect(line).toContain('real first line');
		expect(line).toContain('second line');
	});

	it('strips a first line that is an obsidian file link to the vault', async () => {
		setSettings('noteLink', 'taskLink');

		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const desc = '[Folder/File.md](obsidian://open?vault=TestVault&file=Folder/File.md)\nsecond line';
		const line = await parser.convertTaskToLine(makeTask(desc), 0);

		expect(line).not.toContain('obsidian://open');
		expect(line).toContain('second line');
	});

	it('strips the file link line even when taskLinksInObsidian is noteLink', async () => {
		setSettings('noteLink', 'noteLink');

		const parser = new TaskParser({} as unknown, {} as unknown);
		parser.plugin = makePlugin(parser);

		const desc = '[Folder/File.md](obsidian://open?vault=TestVault&file=Folder/File.md)\nsecond line';
		const line = await parser.convertTaskToLine(makeTask(desc), 0);

		expect(line).not.toContain('obsidian://open');
		expect(line).toContain('second line');
	});
});
