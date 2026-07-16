/**
 * TaskCache - In-memory caching for fast task lookups
 * Extracts caching logic from CacheOperation
 */

import type { ITask } from "@/api/types/Task";
import { db } from "@/db/dexie";
import log from "@/utils/logger";

export class TaskCache {
	private cache: Map<string, ITask> | null = null;

	/**
	 * Fill the cache with all tasks from the database
	 */
	async fill(): Promise<void> {
		try {
			const tasks = await db.tasks.toArray();
			this.cache = new Map(
				tasks
					.filter(lt => !!lt.taskId)
					.map(lt => [lt.taskId, lt.task])
			);
		} catch (error) {
			log.error("Error filling task cache:", error);
			this.cache = new Map();
		}
	}

	/**
	 * Clear the cache to free memory
	 */
	clear(): void {
		this.cache = null;
	}

	/**
	 * Get a task from cache (falls back to database if cache is empty)
	 */
	async get(taskId: string): Promise<ITask | undefined> {
		if (this.cache) {
			return this.cache.get(taskId);
		}

		// Fallback to database if cache is not filled
		try {
			const localTask = await db.tasks.where("taskId").equals(taskId).first();
			return localTask?.task;
		} catch (error) {
			log.error(`Error getting task ${taskId} from database:`, error);
			return undefined;
		}
	}

	/**
	 * Update a task in the cache
	 */
	set(taskId: string, task: ITask): void {
		if (this.cache) {
			this.cache.set(taskId, task);
		}
	}

	/**
	 * Remove a task from the cache
	 */
	delete(taskId: string): void {
		if (this.cache) {
			this.cache.delete(taskId);
		}
	}

	/**
	 * Check if a task exists in the cache
	 */
	has(taskId: string): boolean {
		return this.cache ? this.cache.has(taskId) : false;
	}

	/**
	 * Get all tasks from cache
	 */
	getAll(): ITask[] {
		if (!this.cache) {
			log.warn("Attempting to get all tasks from empty cache");
			return [];
		}
		return Array.from(this.cache.values());
	}

	/**
	 * Get cache size
	 */
	size(): number {
		return this.cache ? this.cache.size : 0;
	}

	/**
	 * Check if cache is filled
	 */
	isFilled(): boolean {
		return this.cache !== null;
	}
}
