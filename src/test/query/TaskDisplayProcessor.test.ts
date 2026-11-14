import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/ui/settings/settingsstore', async () => {
	const { writable } = await import('svelte/store');
	return {
		settingsStore: writable(undefined),
		settingsLoad: () => undefined,
	};
});

import type TickTickSync from '@/main';
import { TaskDisplayProcessor } from '@/query/TaskDisplayProcessor';
import { DEFAULT_SETTINGS, updateSettings } from '@/settings';

function makeProcessor(): TaskDisplayProcessor {
	// applyToElement only reads settings and touches the DOM, so a stub plugin is enough.
	return new TaskDisplayProcessor({} as unknown as TickTickSync);
}

function makeTask(html: string): { container: HTMLElement; task: HTMLElement } {
	const container = document.createElement('div');
	container.classList.add('markdown-preview-view');
	const list = document.createElement('ul');
	const task = document.createElement('li');
	task.setAttribute('data-task', '');
	task.innerHTML = html;
	list.appendChild(task);
	container.appendChild(list);
	document.body.appendChild(container);
	return { container, task };
}

function apply(processor: TaskDisplayProcessor, task: HTMLElement): void {
	(processor as unknown as { applyToElement(el: HTMLElement): void }).applyToElement(task);
}

const TICKTICK_LINK =
	'<a href="https://ticktick.com/webapp/#p/project/tasks/task">task title</a> #ticktick %%[ticktick_id:: abc]%%';

describe('TaskDisplayProcessor (reading mode)', () => {
	beforeEach(() => {
		updateSettings({
			taskDisplay: {
				reading: { link: 'show', id: false, tag: true },
				editing: { link: 'show', id: true, tag: true },
			},
		});
	});

	afterEach(() => {
		document.body.innerHTML = '';
		updateSettings({ taskDisplay: DEFAULT_SETTINGS.taskDisplay });
	});

	it('does not call document.createSpan while marking links', () => {
		const { task } = makeTask(TICKTICK_LINK);
		const createSpan = (document as unknown as { createSpan?: unknown }).createSpan;
		(document as unknown as { createSpan?: unknown }).createSpan = () => {
			throw new Error('document.createSpan must not be used');
		};
		try {
			expect(() => apply(makeProcessor(), task)).not.toThrow();
		} finally {
			(document as unknown as { createSpan?: unknown }).createSpan = createSpan;
		}
	});

	it('marks the TickTick anchor and wraps its text in a detached span', () => {
		const { task } = makeTask(TICKTICK_LINK);
		apply(makeProcessor(), task);

		const anchor = task.querySelector('a');
		expect(anchor?.classList.contains('tt-tickticklink')).toBe(true);
		const span = anchor?.querySelector('.tt-link-text');
		expect(span?.textContent).toBe('task title');
		// The span must live inside the anchor, not on document.
		expect(span?.parentElement).toBe(anchor);
	});

	it('applies display classes from the reading settings', () => {
		const { task } = makeTask(TICKTICK_LINK);
		apply(makeProcessor(), task);

		expect(task.classList.contains('ticktick-task')).toBe(true);
		expect(task.classList.contains('tt-id-hide')).toBe(true);
		expect(task.classList.contains('tt-tag-hide')).toBe(false);
		expect(task.classList.contains('tt-link-hide')).toBe(false);
	});

	it('does not wrap the anchor text twice on repeated scans', () => {
		const { task } = makeTask(TICKTICK_LINK);
		const processor = makeProcessor();
		apply(processor, task);
		apply(processor, task);

		expect(task.querySelectorAll('.tt-link-text')).toHaveLength(1);
	});

	it('does not treat a parent item as a TickTick task because of a nested subtask', () => {
		const { task } = makeTask(
			'<a href="https://ticktick.com/webapp/#p/project/tasks/task">parent</a>' +
			'<ul><li data-task="">subtask #ticktick</li></ul>'
		);
		apply(makeProcessor(), task);

		expect(task.classList.contains('ticktick-task')).toBe(false);
		expect(task.querySelector('a')?.classList.contains('tt-tickticklink')).toBe(false);
	});

	it('updates classes when settings change without a re-render', () => {
		const { task } = makeTask(TICKTICK_LINK);
		const processor = makeProcessor();
		apply(processor, task);
		expect(task.classList.contains('tt-id-hide')).toBe(true);

		updateSettings({
			taskDisplay: {
				reading: { link: 'hide', id: true, tag: false },
				editing: { link: 'show', id: true, tag: true },
			},
		});
		apply(processor, task);

		expect(task.classList.contains('tt-id-hide')).toBe(false);
		expect(task.classList.contains('tt-tag-hide')).toBe(true);
		expect(task.classList.contains('tt-link-hide')).toBe(true);
	});
});

describe('TaskDisplayProcessor (Live Preview)', () => {
	const EDITING_LINE =
		'<span class="cm-link tt-tickticklink"><span class="cm-underline">link</span></span>' +
		'<span class="cm-tag-ticktick">#ticktick</span>';

	function makeEditingLine(active: boolean): HTMLElement {
		const line = document.createElement('div');
		line.classList.add('cm-line', 'HyperMD-task-line');
		if (active) line.classList.add('cm-active');
		line.setAttribute('data-task', '');
		line.innerHTML = EDITING_LINE;
		document.body.appendChild(line);
		return line;
	}

	beforeEach(() => {
		updateSettings({
			taskDisplay: {
				reading: { link: 'show', id: false, tag: true },
				editing: { link: 'hide', id: false, tag: false },
			},
		});
	});

	afterEach(() => {
		document.body.innerHTML = '';
		updateSettings({ taskDisplay: DEFAULT_SETTINGS.taskDisplay });
	});

	it('hides on lines that are not being edited', () => {
		const line = makeEditingLine(false);
		apply(makeProcessor(), line);

		expect(line.classList.contains('ticktick-task')).toBe(true);
		expect(line.classList.contains('tt-tag-hide')).toBe(true);
		expect(line.classList.contains('tt-id-hide')).toBe(true);
		expect(line.classList.contains('tt-link-hide')).toBe(true);
	});

	it('leaves the line being edited alone', () => {
		const line = makeEditingLine(true);
		apply(makeProcessor(), line);

		expect(line.classList.contains('tt-tag-hide')).toBe(false);
		expect(line.classList.contains('tt-id-hide')).toBe(false);
		expect(line.classList.contains('tt-link-hide')).toBe(false);
		expect(line.classList.contains('tt-link-hover')).toBe(false);
	});

	it('restores classes after CodeMirror rewrites the class attribute', () => {
		const line = makeEditingLine(false);
		const processor = makeProcessor();
		apply(processor, line);
		expect(line.classList.contains('tt-tag-hide')).toBe(true);

		// Simulate the click/selection update that wipes externally added classes.
		line.className = 'cm-line HyperMD-task-line';
		apply(processor, line);

		expect(line.classList.contains('ticktick-task')).toBe(true);
		expect(line.classList.contains('tt-tag-hide')).toBe(true);
		expect(line.classList.contains('tt-id-hide')).toBe(true);
	});

	it('restores hiding when the cursor moves off the active line', () => {
		const line = makeEditingLine(true);
		const processor = makeProcessor();
		apply(processor, line);
		expect(line.classList.contains('tt-tag-hide')).toBe(false);

		line.classList.remove('cm-active');
		apply(processor, line);

		expect(line.classList.contains('tt-tag-hide')).toBe(true);
		expect(line.classList.contains('tt-id-hide')).toBe(true);
	});
});
