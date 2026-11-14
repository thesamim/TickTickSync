import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', async (importOriginal) => {
	const actual = await importOriginal<typeof import('obsidian')>();
	return { ...actual, Notice: vi.fn() };
});

import { Notice } from 'obsidian';
import type TickTickSync from '@/main';
import type { ITask } from '@/api/types/Task';
import { TaskModificationDetector } from '@/services/TaskModificationDetector';

interface DetectorHarness {
	detector: TaskModificationDetector;
	moveTaskParent: ReturnType<typeof vi.fn>;
	loadTaskById: ReturnType<typeof vi.fn>;
}

function makeDetector(): DetectorHarness {
	const moveTaskParent = vi.fn().mockResolvedValue(undefined);
	const loadTaskById = vi.fn();
	const plugin = {
		tickTickRestAPI: { moveTaskParent },
		taskRepository: { loadTaskById },
	};
	return {
		detector: new TaskModificationDetector({} as never, plugin as unknown as TickTickSync),
		moveTaskParent,
		loadTaskById,
	};
}

function handleParentChange(
	detector: TaskModificationDetector,
	lineTask: Partial<ITask>,
	savedTask: Partial<ITask>,
	taskId = 'task-1'
): Promise<boolean> {
	return (detector as unknown as {
		handleParentChange(lineTask: ITask, savedTask: ITask, taskId: string): Promise<boolean>;
	}).handleParentChange(lineTask as ITask, savedTask as ITask, taskId);
}

function lastNoticeMessage(): string {
	const calls = vi.mocked(Notice).mock.calls;
	expect(calls.length).toBeGreaterThan(0);
	return String(calls[calls.length - 1][0]);
}

describe('TaskModificationDetector.handleParentChange', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('does nothing and shows no notice when the parent id is unchanged', async () => {
		const { detector, moveTaskParent, loadTaskById } = makeDetector();

		const changed = await handleParentChange(
			detector,
			{ parentId: 'same-parent', projectId: 'project-1' },
			{ parentId: 'same-parent', projectId: 'project-1' }
		);

		expect(changed).toBe(false);
		expect(moveTaskParent).not.toHaveBeenCalled();
		expect(loadTaskById).not.toHaveBeenCalled();
		expect(Notice).not.toHaveBeenCalled();
	});

	it('treats missing parent ids on both sides as a no-op', async () => {
		const { detector, moveTaskParent } = makeDetector();

		const changed = await handleParentChange(detector, {}, {});

		expect(changed).toBe(false);
		expect(moveTaskParent).not.toHaveBeenCalled();
		expect(Notice).not.toHaveBeenCalled();
	});

	it('uses ids when parent titles are missing instead of none -> none', async () => {
		const { detector, moveTaskParent, loadTaskById } = makeDetector();
		loadTaskById.mockResolvedValue(undefined);

		const changed = await handleParentChange(
			detector,
			{ parentId: 'new-parent', projectId: 'project-1' },
			{ parentId: 'old-parent', projectId: 'project-1' }
		);

		expect(changed).toBe(true);
		expect(moveTaskParent).toHaveBeenCalledWith('task-1', 'old-parent', 'new-parent', 'project-1');
		expect(Notice).toHaveBeenCalledTimes(1);

		const message = lastNoticeMessage();
		expect(message).toContain('"old-parent"');
		expect(message).toContain('"new-parent"');
		expect(message).not.toContain('"none" to "none"');
	});

	it('includes titles and ids when both parents resolve', async () => {
		const { detector, loadTaskById } = makeDetector();
		loadTaskById.mockImplementation(async (id: string) =>
			id === 'old-parent' ? { title: 'Old Parent' } : { title: 'New Parent' }
		);

		await handleParentChange(
			detector,
			{ parentId: 'new-parent', projectId: 'project-1' },
			{ parentId: 'old-parent', projectId: 'project-1' }
		);

		const message = lastNoticeMessage();
		expect(message).toContain('"Old Parent (old-parent)"');
		expect(message).toContain('"New Parent (new-parent)"');
	});

	it('falls back to the id for the side whose title is unknown', async () => {
		const { detector, loadTaskById } = makeDetector();
		loadTaskById.mockImplementation(async (id: string) =>
			id === 'new-parent' ? { title: 'New Parent' } : undefined
		);

		await handleParentChange(
			detector,
			{ parentId: 'new-parent', projectId: 'project-1' },
			{ parentId: 'old-parent', projectId: 'project-1' }
		);

		const message = lastNoticeMessage();
		expect(message).toContain('"old-parent"');
		expect(message).toContain('"New Parent (new-parent)"');
	});

	it('does not look up an empty parent id when a task becomes a root task', async () => {
		const { detector, moveTaskParent, loadTaskById } = makeDetector();
		loadTaskById.mockResolvedValue({ title: 'Old Parent' });

		await handleParentChange(
			detector,
			{ parentId: undefined, projectId: 'project-1' },
			{ parentId: 'old-parent', projectId: 'project-1' }
		);

		expect(moveTaskParent).toHaveBeenCalledWith('task-1', 'old-parent', undefined, 'project-1');
		expect(loadTaskById).toHaveBeenCalledTimes(1);
		expect(loadTaskById).toHaveBeenCalledWith('old-parent');
		expect(lastNoticeMessage()).toContain('"Old Parent (old-parent)" to "none"');
	});
});
