import TickTickSync from '@/main';
import { type MarkdownPostProcessorContext } from 'obsidian';
import { getSettings } from '@/settings';
import log from '@/utils/logger';

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
			if (++tries < 10) requestAnimationFrame(scan);
		};
		requestAnimationFrame(scan);
	}

	private scanAll(): void {
		for (const el of document.querySelectorAll<HTMLElement>(
			'li, div.HyperMD-task-line'
		)) {
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
					for (const child of el.querySelectorAll<HTMLElement>('li, div.HyperMD-task-line')) {
						this.applyToElement(child);
					}
				}
			}
			candidates.clear();
		};

		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (!(node instanceof HTMLElement)) continue;
					candidates.add(node);
				}
			}
			if (!pending) {
				pending = true;
				requestAnimationFrame(flush);
			}
		});
		this.observer.observe(document.body, { childList: true, subtree: true });
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
