import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileTaskQueries } from '@/repositories/FileTaskQueries';
import { db } from '@/db/dexie';
import type { LocalTask } from '@/db/schema';
import type { ITask } from '@/api/types/Task';

// Mock dependencies
vi.mock('@/db/dexie', () => ({
	db: {
		tasks: {
			where: vi.fn(),
			toArray: vi.fn(),
		},
		files: {
			get: vi.fn(),
		},
		projects: {
			get: vi.fn(),
		},
	},
}));

vi.mock('@/db/files', () => ({
	getAllFiles: vi.fn(),
	getFile: vi.fn(),
}));

describe('FileTaskQueries', () => {
	let queries: FileTaskQueries;

	beforeEach(() => {
		queries = new FileTaskQueries();
		vi.clearAllMocks();
	});

	describe('getTaskIdsInFile', () => {
		it('should return task IDs for a specific file', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue(mockTasks),
				}),
			});

			const result = await queries.getTaskIdsInFile('test.md');

			expect(result).toEqual(['task1', 'task2']);
			expect(db.tasks.where).toHaveBeenCalledWith('file');
		});

		it('should filter out tasks without taskId', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: '', // Empty taskId
					task: { id: '' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue(mockTasks),
				}),
			});

			const result = await queries.getTaskIdsInFile('test.md');

			expect(result).toEqual(['task1']);
		});

		it('should return empty array on error', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					toArray: vi.fn().mockRejectedValue(new Error('DB error')),
				}),
			});

			const result = await queries.getTaskIdsInFile('test.md');

			expect(result).toEqual([]);
		});
	});

	describe('getTasksInFile', () => {
		it('should return all tasks in a file', async () => {
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

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue(mockTasks),
				}),
			});

			const result = await queries.getTasksInFile('test.md');

			expect(result).toEqual(mockTasks);
		});
	});

	describe('getTaskCountInFile', () => {
		it('should return count of tasks in file', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					count: vi.fn().mockResolvedValue(3),
				}),
			});

			const result = await queries.getTaskCountInFile('test.md');

			expect(result).toBe(3);
		});

		it('should return 0 on error', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					count: vi.fn().mockRejectedValue(new Error('DB error')),
				}),
			});

			const result = await queries.getTaskCountInFile('test.md');

			expect(result).toBe(0);
		});
	});

	describe('fileHasTasks', () => {
		it('should return true if file has tasks', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					count: vi.fn().mockResolvedValue(5),
				}),
			});

			const result = await queries.fileHasTasks('test.md');

			expect(result).toBe(true);
		});

		it('should return false if file has no tasks', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					count: vi.fn().mockResolvedValue(0),
				}),
			});

			const result = await queries.fileHasTasks('test.md');

			expect(result).toBe(false);
		});
	});

	describe('getDefaultProjectForFile', () => {
		it('should return default project ID for file', async () => {
			const mockFile = {
				path: 'test.md',
				defaultProjectId: 'project123',
			};

			const { getFile } = await import('@/db/files');
			(getFile as any).mockResolvedValue(mockFile);

			const result = await queries.getDefaultProjectForFile('test.md');

			expect(result).toBe('project123');
		});

		it('should return undefined if file has no default project', async () => {
			const mockFile = {
				path: 'test.md',
			};

			const { getFile } = await import('@/db/files');
			(getFile as any).mockResolvedValue(mockFile);

			const result = await queries.getDefaultProjectForFile('test.md');

			expect(result).toBeUndefined();
		});

		it('should return undefined if file not found', async () => {
			const { getFile } = await import('@/db/files');
			(getFile as any).mockResolvedValue(undefined);

			const result = await queries.getDefaultProjectForFile('test.md');

			expect(result).toBeUndefined();
		});
	});

	describe('getFilesWithTasks', () => {
		it('should return list of files that have tasks', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'file1.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2' } as ITask,
					updatedAt: Date.now(),
					file: 'file2.md',
					source: 'obsidian',
				},
				{
					localId: 'local3',
					taskId: 'task3',
					task: { id: 'task3' } as ITask,
					updatedAt: Date.now(),
					file: 'file1.md', // Duplicate file
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as any).mockResolvedValue(mockTasks);

			const result = await queries.getFilesWithTasks();

			expect(result).toEqual(['file1.md', 'file2.md']);
			expect(result).toHaveLength(2); // Duplicates removed
		});

		it('should filter out tasks with empty file paths', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'file1.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2' } as ITask,
					updatedAt: Date.now(),
					file: '', // Empty file
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as any).mockResolvedValue(mockTasks);

			const result = await queries.getFilesWithTasks();

			expect(result).toEqual(['file1.md']);
		});
	});

	describe('findMissingTaskIds', () => {
		it('should find tasks in DB but not in current file', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task2',
					task: { id: 'task2' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
				{
					localId: 'local3',
					taskId: 'task3',
					task: { id: 'task3' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue(mockTasks),
				}),
			});

			// Only task1 and task3 are in the current file
			const currentTaskIds = ['task1', 'task3'];

			const result = await queries.findMissingTaskIds('test.md', currentTaskIds);

			expect(result).toEqual(['task2']);
		});

		it('should handle case-insensitive comparison', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'Task1',
					task: { id: 'Task1' } as ITask,
					updatedAt: Date.now(),
					file: 'test.md',
					source: 'obsidian',
				},
			];

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					toArray: vi.fn().mockResolvedValue(mockTasks),
				}),
			});

			const currentTaskIds = ['task1']; // lowercase

			const result = await queries.findMissingTaskIds('test.md', currentTaskIds);

			expect(result).toEqual([]); // Should match case-insensitively
		});
	});

	describe('findDuplicateTasks', () => {
		it('should find tasks appearing in multiple files', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'file1.md',
					source: 'obsidian',
				},
				{
					localId: 'local2',
					taskId: 'task1', // Duplicate!
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'file2.md',
					source: 'obsidian',
				},
				{
					localId: 'local3',
					taskId: 'task2',
					task: { id: 'task2' } as ITask,
					updatedAt: Date.now(),
					file: 'file1.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as any).mockResolvedValue(mockTasks);

			const result = await queries.findDuplicateTasks();

			expect(result.size).toBe(1);
			expect(result.get('task1')).toEqual(['file1.md', 'file2.md']);
			expect(result.has('task2')).toBe(false); // Not a duplicate
		});

		it('should return empty map if no duplicates', async () => {
			const mockTasks: LocalTask[] = [
				{
					localId: 'local1',
					taskId: 'task1',
					task: { id: 'task1' } as ITask,
					updatedAt: Date.now(),
					file: 'file1.md',
					source: 'obsidian',
				},
			];

			(db.tasks.toArray as any).mockResolvedValue(mockTasks);

			const result = await queries.findDuplicateTasks();

			expect(result.size).toBe(0);
		});
	});

	describe('getFilepathForTask', () => {
		it('should return filepath where task is located', async () => {
			const mockTask: LocalTask = {
				localId: 'local1',
				taskId: 'task1',
				task: { id: 'task1' } as ITask,
				updatedAt: Date.now(),
				
				file: 'test.md',
				source: 'obsidian',
			};

			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(mockTask),
				}),
			});

			const result = await queries.getFilepathForTask('task1');

			expect(result).toBe('test.md');
		});

		it('should return undefined if task not found', async () => {
			(db.tasks.where as any).mockReturnValue({
				equals: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const result = await queries.getFilepathForTask('nonexistent');

			expect(result).toBeUndefined();
		});
	});
});
