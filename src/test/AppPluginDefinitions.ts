export class Notice {
	constructor(_message?: string, _timeout?: number) {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Modal {}
export class SuggestModal<T = unknown> {}
export class TFile {}
export class TFolder {}
export class TAbstractFile {}
export class MarkdownView {}
export class MarkdownFileInfo {}
export class App {}
export class Editor {}
export class EditorSuggest<T = unknown> {}
export class FuzzySuggestModal<T = unknown> {}
export class Setting {}
export class DropdownComponent {}
export class TextComponent {}
export class ButtonComponent {}
export class ToggleComponent {}

export const requestUrl = async () => ({ json: {}, text: "", status: 200, headers: {} });
export const normalizePath = (path: string) => path;
export const moment = (..._args: unknown[]) => ({ format: () => "" });
