import TickTickSync from "@/main";
import QueryError from './QueryError.svelte';
import QueryRoot from './QueryRoot.svelte';
import {type MarkdownPostProcessorContext, MarkdownRenderChild} from "obsidian";
import {type Component, mount, unmount} from "svelte";
import {parseQuery} from "@/query/parser";

export class QueryInjector {
	private readonly plugin: TickTickSync;
	constructor(plugin: TickTickSync) {
		this.plugin = plugin;
	}

	onNewBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// @ts-ignore
		let child: QueryRender;

		try {
			const [query, warnings] = parseQuery(source);
		// 	applyReplacements(query, ctx);
		//
		// 	// debug({
		// 	// 	msg: "Parsed query",
		// 	// 	context: query,
		// 	// });
		//
			child = new QueryRender(el, this.plugin, QueryRoot, { query, warnings }, true);
		} catch (e) {
			console.error(e);
			child = new QueryRender(el, this.plugin, QueryError, { error: e }, false);
		}

		ctx.addChild(child);
	}
}

class QueryRender<T extends object> extends MarkdownRenderChild {
	private readonly plugin: TickTickSync;
	private readonly props: T;
	private readonly component: Component;
	private root?: Record<string, never>;
	// private readonly reactRoot: Root;
	//
	// private readonly observer: MutationObserver;
	//
	// private readonly store: UseBoundStore<StoreApi<MarkdownEditButton>>;

	constructor(
		container: HTMLElement,
		plugin: TickTickSync,
		component: Component,
		props: T,
		interceptEditButton: boolean,
	) {
		super(container);
		this.plugin = plugin;
		this.component = component;
		this.props = props;

		// this.root = createRoot(this.containerEl);
		// this.store = create(() => {
		// 	return { click: () => {} };
		// });
		//
		// this.observer = new MutationObserver((mutations) => {
		// 	if (!interceptEditButton) {
		// 		return;
		// 	}
		//
		// 	for (const mutation of mutations) {
		// 		for (const addedNode of mutation.addedNodes) {
		// 			if (addedNode instanceof HTMLElement) {
		// 				if (addedNode.classList.contains("edit-block-button")) {
		// 					addedNode.hide();
		// 					this.store.setState({ click: () => addedNode.click() });
		// 					return;
		// 				}
		// 			}
		// 		}
		// 	}
		// });
	}

	onload(): void {
	// 	if (this.containerEl.parentElement !== null) {
	// 		this.observer.observe(this.containerEl.parentElement, { childList: true });
	// 	}
	//
	// 	const Component = this.component;
	// 	this.reactRoot.render(
	// 		<MarkdownEditButtonContext.Provider value={this.store}>
	// 		<RenderChildContext.Provider value={this}>
	// 		<PluginContext.Provider value={this.plugin}>
	// 			<Component {...this.props} />
	// 	</PluginContext.Provider>
	// 	</RenderChildContext.Provider>
	// 	</MarkdownEditButtonContext.Provider>,
	// );

		//GOOGLE: "Svelte 5 Components are no longer classes"
		const Component = this.component;
		this.root  = mount(Component, {
			target: this.containerEl,
			props: this.props
		});
	}

	onunload(): void {
		if (this.root) {
			unmount(this.root);
		}
	}
}
