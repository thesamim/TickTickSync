import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TagService } from '@/services/TagService';
import type { ITag } from '@/api/types/Tag';

vi.mock('@/db/dexie', () => ({
	db: {
		tags: {
			toArray: vi.fn<() => Promise<{ name: string; tag: ITag }[]>>(),
			clear: vi.fn(),
			bulkPut: vi.fn(),
			put: vi.fn(),
		},
	},
}));

vi.mock('@/utils/logger', () => ({ default: { error: vi.fn() } }));

const makeTag = (name: string, label: string, parent: string | null = null): ITag => ({
	name, label, parent, sortOrder: 0, sortType: '', color: '', etag: '',
});

describe('TagService', () => {
	let svc: TagService;

	beforeEach(() => {
		vi.clearAllMocks();
		svc = new TagService();
	});

	describe('getName', () => {
		it('returns name for known tag by label (case-insensitive)', () => {
			(svc as any).buildMaps([makeTag('work', 'Work')]);
			expect(svc.getName('work')).toBe('work');
			expect(svc.getName('Work')).toBe('work');
			expect(svc.getName('WORK')).toBe('work');
		});

		it('returns name when label has dashes, spaces, underscores, slashes', () => {
			(svc as any).buildMaps([makeTag('ok-here-we-go', 'ok here we go')]);
			expect(svc.getName('ok-here-we-go')).toBe('ok-here-we-go');
			expect(svc.getName('ok here we go')).toBe('ok-here-we-go');
			expect(svc.getName('ok_here_we_go')).toBe('ok-here-we-go');
			expect(svc.getName('ok/here/we/go')).toBe('ok-here-we-go');
		});

		it('returns undefined for unknown tag', () => {
			expect(svc.getName('unknown')).toBeUndefined();
		});

		it('returns undefined for empty/falsy input', () => {
			expect(svc.getName('')).toBeUndefined();
			expect(svc.getName(undefined as unknown as string)).toBeUndefined();
		});
	});

	describe('getLabel', () => {
		it('returns label for known name', () => {
			(svc as any).buildMaps([makeTag('work', 'Work')]);
			expect(svc.getLabel('work')).toBe('Work');
		});

		it('returns undefined for unknown name', () => {
			expect(svc.getLabel('unknown')).toBeUndefined();
		});

		it('returns undefined for empty name', () => {
			expect(svc.getLabel('')).toBeUndefined();
		});
	});

	describe('getParent', () => {
		it('returns parent name when tag has a parent', () => {
			(svc as any).buildMaps([makeTag('meeting', 'Meeting', 'work')]);
			expect(svc.getParent('meeting')).toBe('work');
		});

		it('returns null when tag has no parent', () => {
			(svc as any).buildMaps([makeTag('work', 'Work')]);
			expect(svc.getParent('work')).toBeNull();
		});

		it('returns undefined for unknown tag', () => {
			expect(svc.getParent('unknown')).toBeUndefined();
		});
	});

	describe('resolveToName', () => {
		it('returns known name for known label', () => {
			(svc as any).buildMaps([makeTag('my-tag', 'My Tag')]);
			expect(svc.resolveToName('My Tag')).toBe('my-tag');
		});

		it('falls back to normalized lowercase for unknown labels', () => {
			expect(svc.resolveToName('Hello World')).toBe('hello-world');
			expect(svc.resolveToName('a/b/c')).toBe('a-b-c');
			expect(svc.resolveToName('  spaced   out  ')).toBe('-spaced-out-');
			expect(svc.resolveToName('multi---dash')).toBe('multi-dash');
		});

		it('preserves tags that are already normalized', () => {
			expect(svc.resolveToName('ok-here-we-go')).toBe('ok-here-we-go');
		});
	});

	describe('resolveToLabel', () => {
		it('returns original label for known name', () => {
			(svc as any).buildMaps([makeTag('my-tag', 'My Tag')]);
			expect(svc.resolveToLabel('my-tag')).toBe('My Tag');
		});

		it('returns the input as-is for unknown names', () => {
			expect(svc.resolveToLabel('unknown')).toBe('unknown');
		});
	});

	describe('resolveHierarchicalLabel', () => {
		it('returns parent/child label when tag has a parent', () => {
			(svc as any).buildMaps([
				makeTag('work', 'Work'),
				makeTag('meeting', 'Meeting', 'work'),
			]);
			expect(svc.resolveHierarchicalLabel('meeting')).toBe('Work/Meeting');
		});

		it('returns null when tag has no parent', () => {
			(svc as any).buildMaps([makeTag('work', 'Work')]);
			expect(svc.resolveHierarchicalLabel('work')).toBeNull();
		});

		it('converts dashes to slashes in child label for backward compat', () => {
			(svc as any).buildMaps([
				makeTag('work', 'Work'),
				makeTag('ok-here-we-go', 'ok-here-we-go', 'work'),
			]);
			expect(svc.resolveHierarchicalLabel('ok-here-we-go')).toBe('Work/ok/here/we/go');
		});

		it('uses raw parent name when parent label is missing', () => {
			(svc as any).buildMaps([makeTag('meeting', 'Meeting', 'unknown-parent')]);
			expect(svc.resolveHierarchicalLabel('meeting')).toBe('unknown-parent/Meeting');
		});

		it('returns null when child has no label cache', () => {
			(svc as any).buildMaps([]);
			expect(svc.resolveHierarchicalLabel('unknown')).toBeNull();
		});
	});

	describe('isKnownTag', () => {
		it('returns true for a known tag label', () => {
			(svc as any).buildMaps([makeTag('work', 'Work')]);
			expect(svc.isKnownTag('Work')).toBe(true);
			expect(svc.isKnownTag('work')).toBe(true);
		});

		it('returns false for unknown tag', () => {
			expect(svc.isKnownTag('unknown')).toBe(false);
		});
	});

	describe('addTag', () => {
		it('adds tag to in-memory maps', async () => {
			await svc.addTag('my-tag', 'My Label', null);
			expect(svc.getLabel('my-tag')).toBe('My Label');
			expect(svc.getParent('my-tag')).toBeNull();
			expect(svc.isKnownTag('My Label')).toBe(true);
		});

		it('adds tag with parent', async () => {
			await svc.addTag('child', 'Child Label', 'parent');
			expect(svc.getParent('child')).toBe('parent');
		});

		it('persists tag to dexie', async () => {
			const { db } = await import('@/db/dexie');
			await svc.addTag('t1', 'T1');
			expect(db.tags.put).toHaveBeenCalledWith({
				name: 't1',
				tag: expect.objectContaining({ name: 't1', label: 'T1', parent: null }),
			});
		});
	});

	describe('loadFromDb', () => {
		it('loads tags from dexie and builds maps', async () => {
			const { db } = await import('@/db/dexie');
			(db.tags.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ name: 'work', tag: makeTag('work', 'Work') },
				{ name: 'meeting', tag: makeTag('meeting', 'Meeting', 'work') },
			]);
			await svc.loadFromDb();
			expect(svc.isKnownTag('Work')).toBe(true);
			expect(svc.isKnownTag('Meeting')).toBe(true);
			expect(svc.getLabel('meeting')).toBe('Meeting');
			expect(svc.getParent('meeting')).toBe('work');
		});

		it('handles empty DB', async () => {
			const { db } = await import('@/db/dexie');
			(db.tags.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
			await svc.loadFromDb();
			expect(svc.isKnownTag('anything')).toBe(false);
		});
	});

	describe('saveTags', () => {
		it('clears dexie, bulkPuts tags, and rebuilds maps', async () => {
			const { db } = await import('@/db/dexie');
			const tags = [makeTag('work', 'Work'), makeTag('meeting', 'Meeting', 'work')];
			await svc.saveTags(tags);
			expect(db.tags.clear).toHaveBeenCalled();
			expect(db.tags.bulkPut).toHaveBeenCalledWith([
				{ name: 'work', tag: tags[0] },
				{ name: 'meeting', tag: tags[1] },
			]);
			expect(svc.isKnownTag('Work')).toBe(true);
			expect(svc.getParent('meeting')).toBe('work');
		});

		it('handles empty array', async () => {
			const { db } = await import('@/db/dexie');
			await svc.saveTags([]);
			expect(db.tags.clear).toHaveBeenCalled();
			expect(db.tags.bulkPut).not.toHaveBeenCalled();
		});
	});
});
