import { describe, it, expect, vi, beforeEach } from 'vitest';
import type TickTickSync from '@/main';
import { TaskModificationDetector } from '@/services/TaskModificationDetector';
import type { LocalTask } from '@/db/schema';

vi.mock('@/db/projects', () => ({
	getPausedProjectIds: vi.fn(async () => new Set(['paused'])),
}));

function makeDetector(projectId: string) {
	const updateTask = vi.fn();
	const upsertTask = vi.fn();
	const plugin = {
		taskParser: {
			hasTickTickId: vi.fn().mockReturnValue(true),
			hasTickTickTag: vi.fn().mockReturnValue(true),
			getTickTickId: vi.fn().mockReturnValue('task-1'),
			isMarkdownTask: vi.fn().mockReturnValue(true),
			convertLineToTask: vi.fn(),
		},
		taskRepository: {
			loadLocalTaskById: vi.fn().mockResolvedValue({
				taskId: 'task-1',
				task: { id: 'task-1', title: 'A task', projectId },
				file: 'Lists/Paused.md',
			} as LocalTask),
			upsertTask,
		},
		tickTickRestAPI: { updateTask },
	};
	const detector = new TaskModificationDetector({} as never, plugin as unknown as TickTickSync);
	return { detector, updateTask, upsertTask };
}

function checkLine(detector: TaskModificationDetector): Promise<boolean> {
	const fileMap = {
		getTaskRecord: () => ({ task: 'A task', taskLines: ['A task'] }),
	};
	return (detector as unknown as {
		checkLineForModifications(
			filepath: string,
			lineText: string,
			lineNumber: number,
			fileMap: unknown
		): Promise<boolean>;
	}).checkLineForModifications(
		'Lists/Paused.md',
		'- [ ] A changed task #ticktick [ticktick_id:: task-1]',
		0,
		fileMap
	);
}

describe('TaskModificationDetector paused-list edits', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('ignores edits to tasks in a paused list', async () => {
		const { detector, updateTask, upsertTask } = makeDetector('paused');

		const result = await checkLine(detector);

		expect(result).toBe(false);
		expect(updateTask).not.toHaveBeenCalled();
		expect(upsertTask).not.toHaveBeenCalled();
	});
});
