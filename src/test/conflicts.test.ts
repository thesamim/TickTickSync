import { describe, it, expect } from 'vitest';
import { resolveTaskConflict } from '../sync/conflicts';
import type { LocalTask } from '../db/schema';

function makeTask(overrides: Partial<LocalTask> = {}): LocalTask {
	return {
		localId: 'test-local',
		taskId: 'test-task',
		task: { id: 'test-task', title: 'test', projectId: '' } as any,
		updatedAt: 1000,
		lastModifiedByDeviceId: 'device-a',
		file: '',
		source: 'obsidian',
		...overrides
	};
}

describe('resolveTaskConflict', () => {

	it('returns remote when no local exists', () => {
		const remote = makeTask({ updatedAt: 500 });
		const result = resolveTaskConflict(undefined, remote);
		expect(result.resolved).toBe(remote);
		expect(result.conflictDetected).toBe(false);
		expect(result.winner).toBe('remote');
	});

	it('resolves local when local.updatedAt > remote.updatedAt', () => {
		const local = makeTask({ updatedAt: 2000, lastModifiedByDeviceId: 'device-a' });
		const remote = makeTask({ updatedAt: 1000, lastModifiedByDeviceId: 'device-b' });
		const result = resolveTaskConflict(local, remote);
		expect(result.resolved).toBe(local);
		expect(result.conflictDetected).toBe(true);
		expect(result.winner).toBe('local');
	});

	it('resolves remote when remote.updatedAt > local.updatedAt', () => {
		const local = makeTask({ updatedAt: 1000, lastModifiedByDeviceId: 'device-a' });
		const remote = makeTask({ updatedAt: 2000, lastModifiedByDeviceId: 'device-b' });
		const result = resolveTaskConflict(local, remote);
		expect(result.resolved).toBe(remote);
		expect(result.conflictDetected).toBe(true);
		expect(result.winner).toBe('remote');
	});

	it('resolves local on tie when same device', () => {
		const local = makeTask({ updatedAt: 1000, lastModifiedByDeviceId: 'device-a' });
		const remote = makeTask({ updatedAt: 1000, lastModifiedByDeviceId: 'device-a' });
		const result = resolveTaskConflict(local, remote);
		expect(result.resolved).toBe(local);
		expect(result.conflictDetected).toBe(true);
		expect(result.winner).toBe('local');
	});

	it('resolves local on tie regardless of device', () => {
		const local = makeTask({ updatedAt: 1000, lastModifiedByDeviceId: 'device-a' });
		const remote = makeTask({ updatedAt: 1000, lastModifiedByDeviceId: 'device-b' });
		const result = resolveTaskConflict(local, remote);
		expect(result.resolved).toBe(local);
		expect(result.conflictDetected).toBe(true);
		expect(result.winner).toBe('local');
	});
});
