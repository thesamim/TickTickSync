// Minimal stubs for the Obsidian API used during tests.
// These definitions only provide the symbols referenced in the codebase and
// are not intended to replicate runtime behaviour.

export class TAbstractFile {
        constructor(public path: string = '') {}
}

export class TFile extends TAbstractFile {
        basename = '';
        extension = '';
        parent: TFolder | null = null;
        stat: Record<string, unknown> = {};
}

export class TFolder extends TAbstractFile {
        children: TAbstractFile[] = [];
        name = '';
        parent: TFolder | null = null;
}

export interface ListItemCache {
        position: unknown;
        task?: unknown;
}

export class Vault {
        adapter: unknown;
        getName() {
                return 'TestVault';
        }

        getAbstractFileByPath(path: string) {
                return new TFile(path);
        }
}

export class Workspace {
        onLayoutReady(callback: () => void) {
                callback();
        }

        getActiveViewOfType<T>(_type: any): T | null {
                return null;
        }

        getLeaf(_forceNew?: boolean) {
                return null;
        }
}

export class Notice {
        constructor(public message?: string, public timeout?: number) {}
}

export class MarkdownRenderChild {
        constructor(public containerEl?: HTMLElement) {}
        onload() {}
        onunload() {}
}

export interface MarkdownPostProcessorContext {
        docId?: string;
}

export class App {
        vault: Vault = new Vault();
        workspace: Workspace = new Workspace();
        metadataCache: { getTags: () => Record<string, unknown> } = {
                getTags: () => ({})
        };
        fileManager: Record<string, unknown> = {};
        dom: { appContainerEl?: HTMLElement } = { appContainerEl: typeof document !== 'undefined' ? document.body : undefined };
        scope: Record<string, unknown> = {};
}

export class Editor {}
export class MarkdownView {}
export interface MarkdownFileInfo {}
export class WorkspaceLeaf {}

export interface ISuggestOwner<T> {
        renderSuggestion(value: T, el: HTMLElement): void;
        selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
        getSuggestions(input: string): T[];
}

export class Scope {
        register(_modifiers?: string[], _key?: string, _cb?: (event: KeyboardEvent) => unknown) {}
}

