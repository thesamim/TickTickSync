import TickTickSync from '@/main';
import { type MarkdownPostProcessorContext } from 'obsidian';
import { getSettings } from '@/settings';

export class TaskDisplayProcessor {
	private readonly plugin: TickTickSync;
	private observer: MutationObserver | null = null;

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
			this.scanAll();
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
		for (const el of Array.from(activeDocument.querySelectorAll(
			'li, div.HyperMD-task-line'
		))) {
			this.applyToElement(el as HTMLElement);
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
		if (el.classList.contains('ticktick-task')) return;
		if (!this.isTickTickTask(el)) return;

		const settings = getSettings().taskDisplay;
		const isReading = el.closest('.markdown-preview-view') !== null;
		const mode = isReading ? settings.reading : settings.editing;

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

	private isTickTickTask(el: HTMLElement): boolean {
		if (!el.hasAttribute('data-task')) return false;
		return el.textContent?.includes('#ticktick') ?? false;
	}
}
