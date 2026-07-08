import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockAdd: vi.fn(),
	mockWhereBelow: vi.fn(),
	mockDelete: vi.fn(),
	mockReverse: vi.fn(() => ({ toArray: vi.fn() })),
	mockToArray: vi.fn(),
	mockClear: vi.fn(),
}));

vi.mock('../db/dexie', () => ({
	db: {
		journal: {
			add: mocks.mockAdd,
			where: vi.fn(() => ({ below: mocks.mockWhereBelow })),
			orderBy: vi.fn(() => ({ reverse: mocks.mockReverse })),
			clear: mocks.mockClear,
		},
	},
}));

vi.mock('../settings', () => ({
	getSettings: vi.fn(() => ({ journalRetentionDays: 3 })),
}));

vi.mock('../utils/logger', () => ({
	default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { logSyncEvent, getSyncJournal, clearJournal } from '../sync/journal';
import { db } from '../db/dexie';

describe('journal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mockReverse.mockReturnValue({ toArray: mocks.mockToArray });
		mocks.mockWhereBelow.mockReturnValue({ delete: mocks.mockDelete });
	});

	it('persists an entry via db.journal.add', async () => {
		mocks.mockAdd.mockResolvedValueOnce(1);
		logSyncEvent('device-1', 'sync:start');
		await vi.waitFor(() => expect(mocks.mockAdd).toHaveBeenCalledTimes(1));
		const entry = mocks.mockAdd.mock.calls[0][0] as Record<string, unknown>;
		expect(entry.deviceId).toBe('device-1');
		expect(entry.action).toBe('sync:start');
		expect(entry.timestamp).toBeGreaterThan(0);
	});

	it('includes details in the persisted entry', async () => {
		mocks.mockAdd.mockResolvedValueOnce(1);
		logSyncEvent('device-1', 'pull:complete', { applied: 5 });
		await vi.waitFor(() => expect(mocks.mockAdd).toHaveBeenCalledTimes(1));
		expect((mocks.mockAdd.mock.calls[0][0] as Record<string, unknown>).details).toEqual({ applied: 5 });
	});

	it('getSyncJournal returns entries ordered by id descending', async () => {
		mocks.mockToArray.mockResolvedValueOnce([{ id: 2, action: 'sync:end' }]);
		const result = await getSyncJournal();
		expect((db.journal as unknown as Record<string, Mock>).orderBy).toHaveBeenCalledWith('id');
		expect(result).toEqual([{ id: 2, action: 'sync:end' }]);
	});

	it('clearJournal calls db.journal.clear', async () => {
		await clearJournal();
		expect(mocks.mockClear).toHaveBeenCalledOnce();
	});

	it('prunes old entries every 10 writes based on retentionDays', async () => {
		mocks.mockAdd.mockResolvedValue(1);

		for (let i = 0; i < 10; i++) {
			logSyncEvent('device-1', 'sync:tick');
		}
		await vi.waitFor(() => expect(mocks.mockDelete).toHaveBeenCalledTimes(1));

		expect(mocks.mockWhereBelow).toHaveBeenCalled();
		const cutoffArg = mocks.mockWhereBelow.mock.calls[0][0] as number;
		const expectedCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
		expect(cutoffArg).toBeGreaterThan(expectedCutoff - 5000);
		expect(cutoffArg).toBeLessThan(expectedCutoff + 5000);
	});

	it('handles db.journal being undefined gracefully', async () => {
		(db as unknown).journal = undefined;

		logSyncEvent('device-1', 'sync:start');
		await expect(getSyncJournal()).resolves.toEqual([]);
		await expect(clearJournal()).resolves.toBeUndefined();
	});
});
