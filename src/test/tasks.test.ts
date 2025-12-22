import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTasksByLabel } from '../db/tasks';
import { db } from '../db/dexie';

// Mock the dependencies
vi.mock('../db/dexie', () => ({
	db: {
		tasks: {
			filter: vi.fn(),
		},
	},
}));

describe('getTasksByLabel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return tasks with the specified label', async () => {
		const mockTasks = [
			{
				localId: '1',
				deleted: false,
				task: { tags: ['ohLook1', 'other'] }
			},
			{
				localId: '2',
				deleted: false,
				task: { tags: ['ohlook1'] }
			},
			{
				localId: '3',
				deleted: false,
				task: { tags: ['somethingElse'] }
			},
			{
				localId: '4',
				deleted: true,
				task: { tags: ['ohLook1'] }
			},
			{
				localId: '5',
				deleted: false,
				task: {} // No tags
			}
		];

		// Mock filter behavior
		const mockFilter = vi.fn().mockImplementation((callback) => {
			const filtered = mockTasks.filter(callback);
			return {
				toArray: () => Promise.resolve(filtered)
			};
		});
		(db.tasks.filter as any) = mockFilter;

		const results = await getTasksByLabel('#ohLook1');

		expect(results).toHaveLength(2);
		expect(results[0].localId).toBe('1');
		expect(results[1].localId).toBe('2');
	});

	it('should handle labels without hash prefix', async () => {
		const mockTasks = [
			{
				localId: '1',
				deleted: false,
				task: { tags: ['ohLook1'] }
			}
		];

		const mockFilter = vi.fn().mockImplementation((callback) => {
			const filtered = mockTasks.filter(callback);
			return {
				toArray: () => Promise.resolve(filtered)
			};
		});
		(db.tasks.filter as any) = mockFilter;

		const results = await getTasksByLabel('ohLook1');

		expect(results).toHaveLength(1);
		expect(results[0].localId).toBe('1');
	});

    it('should be case-insensitive', async () => {
		const mockTasks = [
			{
				localId: '1',
				deleted: false,
				task: { tags: ['OHLOOK1'] }
			}
		];

		const mockFilter = vi.fn().mockImplementation((callback) => {
			const filtered = mockTasks.filter(callback);
			return {
				toArray: () => Promise.resolve(filtered)
			};
		});
		(db.tasks.filter as any) = mockFilter;

		const results = await getTasksByLabel('#ohlook1');

		expect(results).toHaveLength(1);
		expect(results[0].localId).toBe('1');
	});
});
