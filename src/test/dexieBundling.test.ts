import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveConfig } from 'vite';
import 'fake-indexeddb/auto';

const DEXIE_GLOBAL_SYMBOL = Symbol.for('Dexie');

function dexieGlobal(): Record<symbol, unknown> {
	return globalThis as unknown as Record<symbol, unknown>;
}

describe('Dexie bundling (issue #401)', () => {
	afterEach(() => {
		delete dexieGlobal()[DEXIE_GLOBAL_SYMBOL];
	});

	it('resolves dexie to the core build, bypassing the ESM import wrapper', async () => {
		const config = await resolveConfig({}, 'build');
		const alias = config.resolve.alias as Array<{ find: unknown; replacement: string }>;
		const dexieAlias = alias.find((entry) => entry.find === 'dexie');
		expect(dexieAlias?.replacement).toMatch(/dexie[\\/]dist[\\/]dexie\.mjs$/);
	});

	it('does not register itself on the shared global registry', async () => {
		const dexie = await import('dexie');
		expect((dexie.default as { semVer?: string }).semVer).toMatch(/^\d+\.\d+\.\d+/);
		expect(dexieGlobal()[DEXIE_GLOBAL_SYMBOL]).toBeUndefined();
	});

	it('can open a database and read/write (smoke test)', async () => {
		vi.resetModules();
		const { default: Dexie } = await import('dexie');
		const database = new Dexie('DexieIsolationTest');
		database.version(1).stores({ items: 'id' });
		await database.items.put({ id: 1, title: 'hello' });
		await expect(database.items.get(1)).resolves.toEqual({ id: 1, title: 'hello' });
		await database.delete();
	});
});
