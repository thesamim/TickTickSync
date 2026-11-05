import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { TFile } from 'obsidian';
import type TickTickSync from '@/main';
import { TaskModificationDetector } from '@/services/TaskModificationDetector';
import type { LocalTask } from '@/db/schema';

function makeDetector(options: {
	deleted: boolean;
	file: string;
}): {
	detector: TaskModificationDetector;
	deleteTaskFromSpecificFile: Mock;
	lineTask: { id: string; title: string };
} {
	const lineTask = { id: 'task-1', title: 'A task' };
	const deleteTaskFromSpecificFile = vi.fn().mockResolvedValue([]);
	const plugin = {
		taskParser: {
			hasTickTickId: vi.fn().mockReturnValue(true),
			hasTickTickTag: vi.fn().mockReturnValue(true),
			getTickTickId: vi.fn().mockReturnValue('task-1'),
			isMarkdownTask: vi.fn().mockReturnValue(true),
			convertLineToTask: vi.fn().mockResolvedValue(lineTask),
		},
		taskRepository: {
			loadLocalTaskById: vi.fn().mockResolvedValue({
				taskId: 'task-1',
				task: { id: 'task-1', title: 'A task' },
				deleted: options.deleted,
				file: options.file,
			} as LocalTask),
		},
		fileOperation: { deleteTaskFromSpecificFile },
	};
	const app = {
		vault: {
			getAbstractFileByPath: vi.fn().mockReturnValue(new TFile()),
		},
	};
	return {
		detector: new TaskModificationDetector(app as never, plugin as unknown as TickTickSync),
		deleteTaskFromSpecificFile,
		lineTask,
	};
}

function checkLine(
	detector: TaskModificationDetector,
	filePath: string
): Promise<boolean> {
	const fileMap = {
		getTaskRecord: () => ({ task: 'A task', taskLines: ['A task'] }),
	};
	return (detector as unknown as {
		checkLineForModifications(
			filepath: string,
			lineText: string,
			lineNumber: number,
			fileMap: unknown,
			pendingDeletions?: unknown
		): Promise<boolean>;
	}).checkLineForModifications(
		filePath,
		'- [ ] A task #ticktick [ticktick_id:: task-1]',
		0,
		fileMap
	);
}

describe('TaskModificationDetector deleted-task lines', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('never re-imports a locally deleted task and removes its stale line', async () => {
		const { detector, deleteTaskFromSpecificFile, lineTask } = makeDetector({
			deleted: true,
			file: '',
		});

		const result = await checkLine(detector, 'DefaultProject.md');

		expect(result).toBe(false);
		expect(deleteTaskFromSpecificFile).toHaveBeenCalledWith(
			expect.any(TFile),
			lineTask,
			false
		);
	});

	it('keeps the line when the user declined to delete it, but never pushes updates', async () => {
		const { detector, deleteTaskFromSpecificFile } = makeDetector({
			deleted: true,
			file: 'DefaultProject.md',
		});

		const result = await checkLine(detector, 'DefaultProject.md');

		expect(result).toBe(false);
		expect(deleteTaskFromSpecificFile).not.toHaveBeenCalled();
	});
});
