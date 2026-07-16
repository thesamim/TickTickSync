import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { TaskCache } from '@/repositories/TaskCache';
import { db } from '@/db/dexie';
import type { LocalTask } from '@/db/schema';
import type { ITask } from '@/api/types/Task';

// Mock dependencies
vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			toArray: vi.fn(),
			where: vi.fn(),
		},
	},
}));

describe('TaskCache', () => {
	let cache: TaskCache;

	beforeEach(() => {
		cache = new TaskCache();
		vi.clearAllMocks();
	});

	describe('fill', () => {
		it('should fill cache with tasks from database', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2', title: 'Task 2' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();

			expect(cache.isFilled()).toBe(true);
			expect(cache.size()).toBe(2);
		});

		it('should filter out tasks without taskId', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: '', // Empty taskId
					task: { id: '', title: 'Task 2' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();

			expect(cache.size()).toBe(1);
		});

		it('should handle database errors gracefully', async () => {
			(db.tasks.toArray as unknown as Mock).mockRejectedValue(new Error('DB error'));

			await cache.fill();

			expect(cache.isFilled()).toBe(true);
			expect(cache.size()).toBe(0);
		});
	});

	describe('clear', () => {
		it('should clear the cache', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();
			expect(cache.isFilled()).toBe(true);

			cache.clear();
			expect(cache.isFilled()).toBe(false);
		});
	});

	describe('get', () => {
		it('should return task from cache when filled', async () => {
			const mockTask: ITask = { id: 'task1', title: 'Task 1' } as ITask;
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: mockTask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();
			const result = await cache.get('task1');

			expect(result).toEqual(mockTask);
		});

		it('should return undefined for non-existent task when cached', async () => {
			(db.tasks.toArray as unknown as Mock).mockResolvedValue([]);

			await cache.fill();
			const result = await cache.get('nonexistent');

			expect(result).toBeUndefined();
		});

		it('should fall back to database when cache not filled', async () => {
			const mockTask: ITask = { id: 'task1', title: 'Task 1' } as ITask;
			const mockLocalTask: LocalTask = {
				localId: 'local1',
				taskId: 'task1',
				task: mockTask,
				updatedAt: Date.now(),
				
				file: 'test.md',
				source: 'obsidian',
			};

			(db.tasks.where as unknown as Mock).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(mockLocalTask),
				}),
			});

			const result = await cache.get('task1');

			expect(result).toEqual(mockTask);
			expect((db.tasks as unknown as Record<string, Mock>).where).toHaveBeenCalledWith('taskId');
		});

		it('should handle database errors when falling back', async () => {
			(db.tasks.where as unknown as Mock).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockRejectedValue(new Error('DB error')),
				}),
			});

			const result = await cache.get('task1');

			expect(result).toBeUndefined();
		});
	});

	describe('set', () => {
		it('should update task in cache when filled', async () => {
			const mockTask: ITask = { id: 'task1', title: 'Original' } as ITask;
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: mockTask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();

			const updatedTask: ITask = { id: 'task1', title: 'Updated' } as ITask;
			cache.set('task1', updatedTask);

			const result = await cache.get('task1');
			expect(result?.title).toBe('Updated');
		});

		it('should not error when cache not filled', () => {
			const task: ITask = { id: 'task1', title: 'Task' } as ITask;
			expect(() => cache.set('task1', task)).not.toThrow();
		});
	});

	describe('delete', () => {
		it('should remove task from cache', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();
			expect(cache.has('task1')).toBe(true);

			cache.delete('task1');
			expect(cache.has('task1')).toBe(false);
		});

		it('should not error when cache not filled', () => {
			expect(() => cache.delete('task1')).not.toThrow();
		});
	});

	describe('has', () => {
		it('should return true for cached task', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();
			expect(cache.has('task1')).toBe(true);
		});

		it('should return false for non-existent task', async () => {
			(db.tasks.toArray as unknown as Mock).mockResolvedValue([]);

			await cache.fill();
			expect(cache.has('nonexistent')).toBe(false);
		});

		it('should return false when cache not filled', () => {
			expect(cache.has('task1')).toBe(false);
		});
	});

	describe('getAll', () => {
		it('should return all cached tasks', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2', title: 'Task 2' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();
			const result = cache.getAll();

			expect(result).toHaveLength(2);
			expect(result.map(t => t.id)).toEqual(['task1', 'task2']);
		});

		it('should return empty array when cache not filled', () => {
			const result = cache.getAll();
			expect(result).toEqual([]);
		});
	});

	describe('size', () => {
		it('should return cache size', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1', title: 'Task 1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2', title: 'Task 2' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as unknown as Mock).mockResolvedValue(mockTasks);

			await cache.fill();
			expect(cache.size()).toBe(2);
		});

		it('should return 0 when cache not filled', () => {
			expect(cache.size()).toBe(0);
		});
	});

	describe('isFilled', () => {
		it('should return false initially', () => {
			expect(cache.isFilled()).toBe(false);
		});

		it('should return true after fill', async () => {
			(db.tasks.toArray as unknown as Mock).mockResolvedValue([]);

			await cache.fill();
			expect(cache.isFilled()).toBe(true);
		});

		it('should return false after clear', async () => {
			(db.tasks.toArray as unknown as Mock).mockResolvedValue([]);

			await cache.fill();
			cache.clear();
			expect(cache.isFilled()).toBe(false);
		});
	});
});
