import { describe, it, expect, test, vi } from 'vitest';
//TODO: task parser tests are failing because it imports obsidian, which is not available in vitest
import { REGEX, TaskParser } from '../taskParser';

const TASK1 = '- [ ] ttsb_task11 #ttsb  [link](https://ticktick.com/webapp/#p/67326d9f5f088184d96f1d4f/tasks/673ae6b7e143d55b24bd0271) #ticktick  %%[ticktick_id:: 673ae6b7e143d55b24bd0271]%% 📅 2024-11-19';

// @ts-ignore
const parser = new TaskParser(null, null); //TODO extend TaskParser

describe('TaskParser.REGEX', () => {
	test('TASK1', () => {
		expect([...TASK1.matchAll(REGEX.ALL_TAGS)].length).toBe(2);
	});
});

describe('TaskParser.common', () => {
	test('hasTickTickId', () => {
		expect(parser.hasTickTickId(TASK1)).toBeTruthy();
	});
});

describe('getAllTagsFromLineText', () => {
	it('extracts a single tag', () => {
		expect(parser.getAllTagsFromLineText('- [ ] task #work')).toEqual(['work']);
	});

	it('extracts multiple tags', () => {
		expect(parser.getAllTagsFromLineText('- [ ] task #work #home #urgent')).toEqual(['work', 'home', 'urgent']);
	});

	it('returns empty array for no tags', () => {
		expect(parser.getAllTagsFromLineText('- [ ] just a plain task')).toEqual([]);
	});

	it('extracts hierarchical tag (parent/child)', () => {
		expect(parser.getAllTagsFromLineText('- [ ] task #work/meeting')).toEqual(['work/meeting']);
	});

	it('extracts tags with dashes in the name', () => {
		expect(parser.getAllTagsFromLineText('- [ ] task #ok-here-we-go')).toEqual(['ok-here-we-go']);
	});

	it('extracts tag at start of line (no leading space)', () => {
		expect(parser.getAllTagsFromLineText('#solo-tag rest of content')).toEqual(['solo-tag']);
	});

	it('extracts tag with leading whitespace', () => {
		expect(parser.getAllTagsFromLineText('   #indented content')).toEqual(['indented']);
	});

	it('extracts tags with underscores', () => {
		expect(parser.getAllTagsFromLineText('#my_tag')).toEqual(['my_tag']);
	});

	it('extracts unicode tags', () => {
		expect(parser.getAllTagsFromLineText('#über cool')).toEqual(['über']);
	});
});

describe('addTagsToLine', () => {
	it('appends simple tag with # prefix', () => {
		const result = parser.addTagsToLine('- [ ] task', ['work']);
		expect(result).toBe('- [ ] task #work');
	});

	it('appends multiple tags', () => {
		const result = parser.addTagsToLine('- [ ] task', ['work', 'home']);
		expect(result).toBe('- [ ] task #work #home');
	});

	it('converts dashes to slashes for non-hierarchical tags when no tagSvc', () => {
		const result = parser.addTagsToLine('- [ ] task', ['ok-here-we-go']);
		expect(result).toBe('- [ ] task #ok/here/we/go');
	});

	it('skips ticktick tag', () => {
		const result = parser.addTagsToLine('- [ ] task', ['ticktick']);
		expect(result).toBe('- [ ] task');
	});

	it('skips ticktick tag but appends other tags', () => {
		const result = parser.addTagsToLine('- [ ] task', ['ticktick', 'work']);
		expect(result).toBe('- [ ] task #work');
	});

	it('preserves tag that contains no dashes verbatim', () => {
		const result = parser.addTagsToLine('- [ ] task', ['meeting']);
		expect(result).toBe('- [ ] task #meeting');
	});

	it('uses tagService resolveHierarchicalLabel when available', () => {
		const mockTagSvc = {
			resolveHierarchicalLabel: vi.fn((name: string) => {
				if (name === 'meeting') return 'Work/Meeting';
				return null;
			}),
			getLabel: vi.fn(() => null),
		};
		(parser as any).plugin = { tagService: mockTagSvc };
		const result = parser.addTagsToLine('- [ ] task', ['meeting']);
		expect(result).toBe('- [ ] task #Work/Meeting');
		expect(mockTagSvc.resolveHierarchicalLabel).toHaveBeenCalledWith('meeting');
	});

	it('falls back to label with dash-to-slash when resolveHierarchicalLabel returns null', () => {
		const mockTagSvc = {
			resolveHierarchicalLabel: vi.fn(() => null),
			getLabel: vi.fn((name: string) => {
				if (name === 'my-tag') return 'My-Tag';
				return null;
			}),
		};
		(parser as any).plugin = { tagService: mockTagSvc };
		const result = parser.addTagsToLine('- [ ] task', ['my-tag']);
		expect(result).toBe('- [ ] task #My/Tag');
	});
});

describe('isTagsChanged', () => {
	it('returns false when both tasks have same tags', () => {
		expect(parser.isTagsChanged(
			{ tags: ['a', 'b'] } as any,
			{ tags: ['a', 'b'] } as any
		)).toBe(false);
	});

	it('returns false when both tasks have no tags', () => {
		expect(parser.isTagsChanged(
			{ tags: [] } as any,
			{ tags: [] } as any
		)).toBe(false);
	});

	it('returns false when both tasks have undefined tags', () => {
		expect(parser.isTagsChanged(
			{} as any,
			{} as any
		)).toBe(false);
	});

	it('returns true when tags differ', () => {
		expect(parser.isTagsChanged(
			{ tags: ['a'] } as any,
			{ tags: ['b'] } as any
		)).toBe(true);
	});

	it('returns true when one task has tags and the other does not', () => {
		expect(parser.isTagsChanged(
			{ tags: ['a'] } as any,
			{} as any
		)).toBe(true);
	});

	it('returns true when tag count differs', () => {
		expect(parser.isTagsChanged(
			{ tags: ['a', 'b'] } as any,
			{ tags: ['a'] } as any
		)).toBe(true);
	});

	it('is order-independent', () => {
		expect(parser.isTagsChanged(
			{ tags: ['b', 'a'] } as any,
			{ tags: ['a', 'b'] } as any
		)).toBe(false);
	});
});
