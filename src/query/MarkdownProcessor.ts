import TickTickSync from '@/main';
import { type MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { type Component, mount, unmount } from 'svelte';
import { parseQuery } from '@/query/parser';
import QueryRoot from './QueryRoot.svelte';
import QueryError from './QueryError.svelte';
import { TaskDisplayProcessor } from '@/query/TaskDisplayProcessor';
import log from '@/utils/logger';

export class MarkdownProcessor {
	private readonly plugin: TickTickSync;
	private readonly taskDisplay: TaskDisplayProcessor;

	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
		this.taskDisplay = new TaskDisplayProcessor(plugin);
	}

	activate(): void {
		this.plugin.registerMarkdownCodeBlockProcessor(
			'ticktick',
			(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
				this.onNewBlock(source, el, ctx);
			}
		);
		this.taskDisplay.activate();
	}

	private onNewBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
		try {
			const [query, warnings] = parseQuery(source);
			ctx.addChild(new QueryRender(el, QueryRoot, { query, warnings }));
		} catch (e) {
			log.error(e);
			const errorMessage = e instanceof Error ? e.message : String(e);
			ctx.addChild(new QueryRender(el, QueryError, { error: errorMessage }));
		}
	}
}

export class QueryRender<T extends Record<string, unknown>> extends MarkdownRenderChild {
	private readonly props: T;
	private readonly component: Component;
	private root?: Record<string, never>;

	constructor(container: HTMLElement, component: Component, props: T) {
		super(container);
		this.component = component;
		this.props = props;
	}

	onload(): void {
		this.root = mount(this.component, {
			target: this.containerEl,
			props: this.props
		});
	}

	onunload(): void {
		if (this.root) {
			unmount(this.root);
			this.root = undefined;
		}
	}
}
