import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/db/files', () => ({ getFile: vi.fn() }));
vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			where: vi.fn(),
		},
	},
}));

import type { App } from 'obsidian';
import type TickTickSync from '@/main';
import { getFile } from '@/db/files';
import { db } from '@/db/dexie';
import { TaskModificationDetector } from '@/services/TaskModificationDetector';

interface MoveCheck {
	moved: boolean;
	oldFilePath: string;
	restored: boolean;
}

function makeDetector(oldFilePath: string): TaskModificationDetector {
	const plugin = {
		fileMetadataService: {
			getFilepathForTask: vi.fn().mockResolvedValue(oldFilePath),
		},
	};
	return new TaskModificationDetector({} as App, plugin as unknown as TickTickSync);
}

function checkMove(detector: TaskModificationDetector, taskId: string, currentPath: string): Promise<MoveCheck> {
	return (detector as unknown as {
		checkForTaskMove(taskId: string, currentPath: string): Promise<MoveCheck>;
	}).checkForTaskMove(taskId, currentPath);
}

function mockLocalTaskProjectId(projectId: string | undefined): void {
	vi.mocked(db.tasks.where).mockReturnValue({
		equals: () => ({
			first: async () => (projectId ? { task: { projectId } } : undefined),
		}),
	} as never);
}

describe('TaskModificationDetector.checkForTaskMove', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getFile).mockResolvedValue({ defaultProjectId: 'paused-project' } as never);
		mockLocalTaskProjectId('paused-project');
	});

	it('does not report an untouched task in a paused list as moved', async () => {
		const result = await checkMove(makeDetector('Lists/Paused.md'), 't1', 'Lists/Paused.md');

		expect(result.moved).toBe(false);
		expect(result.restored).toBe(false);
	});

	it('reports a task restored out of a paused list as moved without a user move', async () => {
		mockLocalTaskProjectId('inbox');

		const result = await checkMove(makeDetector('Lists/Paused.md'), 't1', 'Lists/Paused.md');

		expect(result.moved).toBe(true);
		expect(result.restored).toBe(true);
	});

	it('reports a real file move as moved and not restored', async () => {
		const result = await checkMove(makeDetector('Lists/Old.md'), 't1', 'Lists/New.md');

		expect(result).toEqual({
			moved: true,
			oldFilePath: 'Lists/Old.md',
			restored: false,
		});
		// A real move is detected without touching the file/project cache.
		expect(getFile).not.toHaveBeenCalled();
	});

	it('does not report a move when no previous file is known', async () => {
		const result = await checkMove(makeDetector(''), 't1', 'Lists/New.md');

		expect(result.moved).toBe(false);
		expect(result.restored).toBe(false);
	});
});
