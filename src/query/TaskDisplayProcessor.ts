import TickTickSync from '@/main';
import { type MarkdownPostProcessorContext } from 'obsidian';
import { getSettings } from '@/settings';

export class TaskDisplayProcessor {
	private readonly plugin: TickTickSync;
	private observer: MutationObserver | null = null;
	private scanning = false;

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

	activate(): void {
		this.plugin.registerMarkdownPostProcessor(
			(el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
				this.processContainer(el);
			},
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

		// Always re-check link marking (CM6 spans may appear after first scan)
		this.markTickTickLinks(el);

		if (el.classList.contains('ticktick-task')) return;

		el.classList.add('ticktick-task');

		if (mode.link === 'hide') {
			el.classList.add('tt-link-hide');
		} else if (mode.link === 'hover') {
			el.classList.add('tt-link-hover');
		}

		if (!mode.tag) {
			el.classList.add('tt-tag-hide');
		}

		if (!mode.id) {
			el.classList.add('tt-id-hide');
		}
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
					for (const node of Array.from(a.childNodes)) {
						if (node.nodeType === Node.TEXT_NODE && node.textContent) {
							const span = document.createElement('span');
							span.className = 'tt-link-text';
							span.textContent = node.textContent;
							a.replaceChild(span, node);
						}
					}
				}
			}
		}

		// Case 2: CM6 spans — use TreeWalker for guaranteed document-order traversal
		// Find the last .cm-link before #ticktick
		const ticktickTag = el.querySelector('.cm-tag-ticktick');
		if (ticktickTag && !el.querySelector('.tt-tickticklink:not(a)')) {
			let lastBefore: HTMLElement | null = null;
			const walker = document.createTreeWalker(
				el,
				NodeFilter.SHOW_ELEMENT,
				{
					acceptNode: (node: Node) => {
						if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_SKIP;
						if (node === ticktickTag) return NodeFilter.FILTER_STOP;
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

	private isTickTickTask(el: HTMLElement): boolean {
		if (!el.hasAttribute('data-task')) return false;
		return el.textContent?.includes('#ticktick') ?? false;
	}
}
