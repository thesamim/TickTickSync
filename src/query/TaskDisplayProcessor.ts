import type TickTickSync from '@/main';
import { type MarkdownPostProcessorContext } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { getSettings } from '@/settings';

export class TaskDisplayProcessor {
	private readonly plugin: TickTickSync;
	private observer: MutationObserver | null = null;
	private scanning = false;
	private readonly pendingEditorScans = new Set<EditorView>();
	private editorScanScheduled = false;

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

	activate(): void {
		this.plugin.registerMarkdownPostProcessor(
			(el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
				this.processContainer(el);
			},
		);

		// Live Preview: CodeMirror rewrites the class attribute of `.cm-line`
		// elements on selection/viewport updates (e.g. when the user clicks into
		// the note), which wipes the classes we add. Re-apply after every editor
		// update so non-active lines keep respecting the display settings.
		this.plugin.registerEditorExtension(
			EditorView.updateListener.of((update) => {
				if (!update.docChanged && !update.selectionSet &&
					!update.viewportChanged && !update.focusChanged &&
					!update.geometryChanged) {
					return;
				}
				this.scheduleEditorScan(update.view);
			}),
		);

		this.plugin.register(() => this.deactivate());

		const layoutRef = this.plugin.app.workspace.on('layout-change', () => {
			this.scheduleScan();
		});
		this.plugin.registerEvent(layoutRef);

		this.plugin.registerDomEvent(window, 'blur', () => {
			this.scheduleScan();
		});
		this.plugin.registerDomEvent(window, 'focus', () => {
			this.scheduleScan();
		});
		this.plugin.registerDomEvent(document, 'visibilitychange', () => {
			this.scheduleScan();
		});

		this.startObserver();
		this.scheduleScan();
	}

	deactivate(): void {
		this.pendingEditorScans.clear();
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
	}

	private scheduleScan(): void {
		let tries = 0;
		const scan = () => {
			this.scanAll();
			if (++tries < 10) window.requestAnimationFrame(scan);
		};
		window.requestAnimationFrame(scan);
	}

	private scanAll(): void {
		if (this.scanning) return;
		this.scanning = true;
		try {
			for (const el of Array.from(activeDocument.querySelectorAll(
				'li, div.HyperMD-task-line'
			))) {
				this.applyToElement(el as HTMLElement);
			}
		} finally {
			this.scanning = false;
		}
	}

	/**
	 * Queues a re-application of display classes for one CodeMirror editor.
	 * CodeMirror rewrites `.cm-line` classes during its update cycle, so we run
	 * on the next animation frame to land after that cycle has finished.
	 */
	private scheduleEditorScan(view: EditorView): void {
		this.pendingEditorScans.add(view);
		if (this.editorScanScheduled) return;
		this.editorScanScheduled = true;
		window.requestAnimationFrame(() => {
			this.editorScanScheduled = false;
			const views = Array.from(this.pendingEditorScans);
			this.pendingEditorScans.clear();
			for (const pendingView of views) {
				try {
					this.applyToEditor(pendingView);
				} catch {
					// The editor may have been closed or destroyed before this frame.
				}
			}
		});
	}

	private applyToEditor(view: EditorView): void {
		const content = view.contentDOM;
		if (!content) return;
		for (const el of Array.from(content.querySelectorAll<HTMLElement>(
			'div.HyperMD-task-line'
		))) {
			this.applyToElement(el);
		}
	}

	private startObserver(): void {
		const candidates = new Set<HTMLElement>();
		let pending = false;

		const flush = () => {
			pending = false;
			for (const el of candidates) {
				if (el.matches('li') || el.matches('div.HyperMD-task-line')) {
					this.applyToElement(el);
				} else {
					const children = el.querySelectorAll('li, div.HyperMD-task-line');
					for (let i = 0; i < children.length; i++) {
						this.applyToElement(children[i] as HTMLElement);
					}
				}
			}
			candidates.clear();
		};

		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of Array.from(mutation.addedNodes)) {
					if (!(node.instanceOf(HTMLElement))) continue;
					candidates.add(node);
				}
			}
			if (!pending) {
				pending = true;
				window.requestAnimationFrame(flush);
			}
		});
		this.observer.observe(activeDocument.body, { childList: true, subtree: true });
	}

	private processContainer(el: HTMLElement): void {
		for (const item of Array.from(el.querySelectorAll<HTMLElement>(
			'li, div.HyperMD-task-line'
		))) {
			this.applyToElement(item);
		}
	}

	private applyToElement(el: HTMLElement): void {
		if (!this.isTickTickTask(el)) return;

		const settings = getSettings().taskDisplay;
		const isReading = el.closest('.markdown-preview-view') !== null;
		const mode = isReading ? settings.reading : settings.editing;

		// In Live Preview the line under the cursor is shown as raw markdown, so
		// leave it alone. Settings apply to every line that is not being edited.
		const isActiveLine = !isReading && el.classList.contains('cm-active');
		const hide = !isActiveLine;

		// Always re-check link marking (CM6 spans may appear after first scan)
		this.markTickTickLinks(el);

		// Apply classes idempotently so settings changes take effect on the next scan
		// without needing a full re-render.
		el.classList.add('ticktick-task');
		el.classList.toggle('tt-link-hide', hide && mode.link === 'hide');
		el.classList.toggle('tt-link-hover', hide && mode.link === 'hover');
		el.classList.toggle('tt-tag-hide', hide && !mode.tag);
		el.classList.toggle('tt-id-hide', hide && !mode.id);
	}

	private markTickTickLinks(el: HTMLElement): void {
		// Case 1: Reading mode produces <a> tags with href
		const anchors = el.querySelectorAll('a');
		for (const a of Array.from(anchors)) {
			if (a.classList.contains('tt-tickticklink')) continue;
			const href = a.getAttribute('href') ?? '';
			if (href.includes('//ticktick.com') || href.includes('//dida365.com')) {
				a.classList.add('tt-tickticklink');
				if (!a.querySelector('.tt-link-text')) {
					this.wrapTextNodes(a);
				}
			}
		}

		// Case 2: CM6 spans — use TreeWalker for guaranteed document-order traversal
		// Find the last .cm-link before #ticktick
		const ticktickTag = el.querySelector('.cm-tag-ticktick');
		if (ticktickTag && !el.querySelector('.tt-tickticklink:not(a)')) {
			let lastBefore: HTMLElement | null = null;
			const walker = el.ownerDocument.createTreeWalker(
				el,
				NodeFilter.SHOW_ELEMENT,
				{
					acceptNode: (node: Node) => {
						if (!node.instanceOf(HTMLElement)) return NodeFilter.FILTER_SKIP;
						if (node === ticktickTag) return NodeFilter.FILTER_SKIP;
						if (node.classList.contains('cm-link') &&
							!node.classList.contains('cm-comment') &&
							!node.classList.contains('tt-tickticklink')) {
							return NodeFilter.FILTER_ACCEPT;
						}
						return NodeFilter.FILTER_SKIP;
					}
				}
			);
			while (walker.nextNode()) {
				lastBefore = walker.currentNode as HTMLElement;
			}
			if (lastBefore) {
				lastBefore.classList.add('tt-tickticklink');
			}
		}
	}

	/**
	 * Wraps each non-empty text node inside `root` in a `.tt-link-text` span.
	 *
	 * Important: do not use `document.createSpan(...)` here. Obsidian's DOM helper
	 * creates the element and appends it to `document`, and a document can only
	 * have one root element — that throws `HierarchyRequestError` ("Only one
	 * element on document allowed"). Creating the span detached avoids this.
	 */
	private wrapTextNodes(root: HTMLElement): void {
		const doc = root.ownerDocument;
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		let node: Node | null = walker.nextNode();
		while (node) {
			if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
				textNodes.push(node as Text);
			}
			node = walker.nextNode();
		}
		for (const textNode of textNodes) {
			const span = doc.createElement('span');
			span.classList.add('tt-link-text');
			span.textContent = textNode.textContent;
			textNode.parentNode?.replaceChild(span, textNode);
		}
	}

	private isTickTickTask(el: HTMLElement): boolean {
		if (!el.hasAttribute('data-task')) return false;
		// Only consider this item's own text, not nested subtasks. Otherwise a
		// parent item would be treated as a TickTick task just because one of its
		// children is, and its links/tags would be hidden too.
		let ownText = '';
		for (const node of Array.from(el.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				ownText += node.textContent ?? '';
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const element = node as HTMLElement;
				if (element.matches('ul, ol')) continue;
				ownText += element.textContent ?? '';
			}
		}
		return ownText.includes('#ticktick');
	}
}
