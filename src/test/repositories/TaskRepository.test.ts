import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskRepository } from '@/repositories/TaskRepository';
import { db } from '@/db/dexie';
import type { ITask } from '@/api/types/Task';
import type { LocalTask } from '@/db/schema';

// Mock dependencies
vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			where: vi.fn(),
			toArray: vi.fn(),
			put: vi.fn(),
			update: vi.fn(),
			count: vi.fn(),
		},
	},
}));

vi.mock('@/db/device', () => ({
	getCurrentDeviceInfo: vi.fn(() => ({
		deviceId: 'test-device-id',
	})),
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({
		deviceId: 'test-device-id',
	})),
}));

describe('TaskRepository', () => {
	let repository: TaskRepository;

	beforeEach(() => {
		repository = new TaskRepository();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('loadTaskById', () => {
		it('should load a task by its TickTick ID', async () => {
			const mockTask: ITask = {
				id: 'task123',
				title: 'Test Task',
				projectId: 'project1',
			} as ITask;

			const mockLocalTask: LocalTask = {
				localId: 'local123',
				taskId: 'task123',
				task: mockTask,
				updatedAt: Date.now(),
				lastModifiedByDeviceId: 'test-device',
				file: 'test.md',
				source: 'obsidian',
			};

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(mockLocalTask),
				}),
			});

			const result = await repository.loadTaskById('task123');

			expect(result).toEqual(mockTask);
			expect(db.tasks.where).toHaveBeenCalledWith('taskId');
		});

		it('should return undefined if task not found', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const result = await repository.loadTaskById('nonexistent');

			expect(result).toBeUndefined();
		});

		it('should handle errors gracefully', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockRejectedValue(new Error('DB error')),
				}),
			});

			const result = await repository.loadTaskById('task123');

			expect(result).toBeUndefined();
		});
	});

	describe('loadLocalTaskById', () => {
		it('should load a LocalTask by its TickTick ID', async () => {
			const mockLocalTask: LocalTask = {
				localId: 'local123',
				taskId: 'task123',
				task: { id: 'task123', title: 'Test' } as ITask,
				updatedAt: Date.now(),
				lastModifiedByDeviceId: 'test-device',
				file: 'test.md',
				source: 'obsidian',
			};

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(mockLocalTask),
				}),
			});

			const result = await repository.loadLocalTaskById('task123');

			expect(result).toEqual(mockLocalTask);
		});
	});

	describe('loadAllTasks', () => {
		it('should load all tasks from database', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					lastModifiedByDeviceId: 'test-device',
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2', title: 'Task 2' } as ITask,
					updatedAt: Date.now(),
					lastModifiedByDeviceId: 'test-device',
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as any).mockResolvedValue(mockTasks);

			const result = await repository.loadAllTasks();

			expect(result).toHaveLength(2);
			expect(result[0].title).toBe('Task 1');
			expect(result[1].title).toBe('Task 2');
		});

		it('should return empty array on error', async () => {
			(db.tasks.toArray as any).mockRejectedValue(new Error('DB error'));

			const result = await repository.loadAllTasks();

			expect(result).toEqual([]);
		});
	});

	describe('loadTasksForFile', () => {
		it('should load tasks for a specific file', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					lastModifiedByDeviceId: 'test-device',
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue(mockTasks),
				}),
			});

			const result = await repository.loadTasksForFile('test.md');

			expect(result).toHaveLength(1);
			expect(result[0].title).toBe('Task 1');
			expect(db.tasks.where).toHaveBeenCalledWith('file');
		});
	});

	describe('upsertTask', () => {
		it('should update existing task', async () => {
			const existingTask: LocalTask = {
				localId: 'local123',
				taskId: 'task123',
				task: { id: 'task123', title: 'Old Title' } as ITask,
				updatedAt: Date.now(),
				lastModifiedByDeviceId: 'test-device',
				file: 'test.md',
				source: 'obsidian',
			};

			const updatedTask: ITask = {
				id: 'task123',
				title: 'New Title',
				projectId: 'project1',
			} as ITask;

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(existingTask),
				}),
			});

			(db.tasks.update as any).mockResolvedValue(1);

			await repository.upsertTask(updatedTask, 'test.md', Date.now());

			expect(db.tasks.update).toHaveBeenCalledWith(
				'local123',
				expect.objectContaining({
					task: updatedTask,
					lastModifiedByDeviceId: 'test-device-id',
				})
			);
		});

		it('should create new task if not exists', async () => {
			const newTask: ITask = {
				id: 'task123',
				title: 'New Task',
				projectId: 'project1',
			} as ITask;

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(undefined),
				}),
			});

			(db.tasks.put as any).mockResolvedValue('local123');

			await repository.upsertTask(newTask, 'test.md', Date.now());

			expect(db.tasks.put).toHaveBeenCalledWith(
				expect.objectContaining({
					localId: 'tt:task123',
					taskId: 'task123',
					task: newTask,
					file: 'test.md',
					source: 'obsidian',
				})
			);
		});
	});

	describe('deleteTask', () => {
		it('should mark task as deleted (tombstone)', async () => {
			const existingTask: LocalTask = {
				localId: 'local123',
				taskId: 'task123',
				task: { id: 'task123', title: 'Task' } as ITask,
				updatedAt: Date.now(),
				lastModifiedByDeviceId: 'test-device',
				file: 'test.md',
				source: 'obsidian',
			};

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(existingTask),
				}),
			});

			(db.tasks.update as any).mockResolvedValue(1);

			await repository.deleteTask('task123');

			expect(db.tasks.update).toHaveBeenCalledWith(
				'local123',
				expect.objectContaining({
					deleted: true,
					lastModifiedByDeviceId: 'test-device-id',
				})
			);
		});

		it('should not throw if task not found', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(undefined),
				}),
			});

			await expect(repository.deleteTask('nonexistent')).resolves.not.toThrow();
		});
	});

	describe('closeTask', () => {
		it('should mark task as completed', async () => {
			const mockTask: ITask = {
				id: 'task123',
				title: 'Test Task',
				projectId: 'project1',
				status: 0,
			} as ITask;

			const mockLocalTask: LocalTask = {
				localId: 'local123',
				taskId: 'task123',
				task: mockTask,
				updatedAt: Date.now(),
				lastModifiedByDeviceId: 'test-device',
				file: 'test.md',
				source: 'obsidian',
			};

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(mockLocalTask),
				}),
			});

			(db.tasks.update as any).mockResolvedValue(1);

			const result = await repository.closeTask('task123');

			expect(result).toBe('project1');
			expect(mockTask.status).toBe(2); // TickTick completed status
		});
	});

	describe('reopenTask', () => {
		it('should mark task as incomplete', async () => {
			const mockTask: ITask = {
				id: 'task123',
				title: 'Test Task',
				projectId: 'project1',
				status: 2,
			} as ITask;

			const mockLocalTask: LocalTask = {
				localId: 'local123',
				taskId: 'task123',
				task: mockTask,
				updatedAt: Date.now(),
				lastModifiedByDeviceId: 'test-device',
				file: 'test.md',
				source: 'obsidian',
			};

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(mockLocalTask),
				}),
			});

			(db.tasks.update as any).mockResolvedValue(1);

			const result = await repository.reopenTask('task123');

			expect(result).toBe('project1');
			expect(mockTask.status).toBe(0); // TickTick open status
		});
	});

	describe('taskExists', () => {
		it('should return true if task exists', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ taskId: 'task123' }),
				}),
			});

			const result = await repository.taskExists('task123');

			expect(result).toBe(true);
		});

		it('should return false if task does not exist', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const result = await repository.taskExists('nonexistent');

			expect(result).toBe(false);
		});
	});

	describe('getTaskCount', () => {
		it('should return task count', async () => {
			(db.tasks.count as any).mockResolvedValue(42);

			const result = await repository.getTaskCount();

			expect(result).toBe(42);
		});

		it('should return 0 on error', async () => {
			(db.tasks.count as any).mockRejectedValue(new Error('DB error'));

			const result = await repository.getTaskCount();

			expect(result).toBe(0);
		});
	});
});
