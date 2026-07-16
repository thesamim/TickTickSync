import type { ITag } from '@/api/types/Tag';
import { db } from '@/db/dexie';
import log from '@/utils/logger';

export class TagService {
	private nameToLabel: Map<string, string> = new Map();
	private labelLookup: Map<string, string> = new Map();
	private nameToParent: Map<string, string | null> = new Map();

	async loadFromDb(): Promise<void> {
		try {
			const localTags = await db.tags.toArray();
			this.buildMaps(localTags.map(lt => lt.tag));
		} catch (error) {
			log.error('TagService: error loading from DB', error);
		}
	}

	async saveTags(tags: ITag[]): Promise<void> {
		try {
			await db.tags.clear();
			if (tags.length > 0) {
				await db.tags.bulkPut(tags.map(tag => ({ name: tag.name, tag })));
			}
			this.buildMaps(tags);
		} catch (error) {
			log.error('TagService: error saving tags', error);
		}
	}

	getName(input: string): string | undefined {
		if (!input) return undefined;
		const key = this.normalize(input);
		return this.labelLookup.get(key);
	}

	getLabel(name: string): string | undefined {
		if (!name) return undefined;
		return this.nameToLabel.get(name);
	}

	getParent(name: string): string | null | undefined {
		return this.nameToParent.get(name);
	}

	resolveToName(input: string): string {
		const found = this.getName(input);
		if (found) return found;
		return input.toLowerCase().replace(/[/\s]+/g, '-').replace(/-+/g, '-');
	}

	resolveToLabel(name: string): string {
		const found = this.getLabel(name);
		if (found) return found;
		return name;
	}

	/**
	 * Returns the full hierarchical label (e.g. "Work/Meeting") if the tag
	 * has a parent cached. Converts - to / in the child label for backward
	 * compat with old flattened tags. Returns null if the tag has no parent
	 * (caller should fall back to old -→/ conversion).
	 */
	resolveHierarchicalLabel(name: string): string | null {
		const parent = this.nameToParent.get(name);
		if (!parent) return null;
		let childLabel = this.nameToLabel.get(name);
		const parentLabel = this.nameToLabel.get(parent);
		if (!childLabel) return null;
		// Backward compat: old tags stored flattened labels (e.g. b-c instead of b/c)
		childLabel = childLabel.replace(/-/g, '/');
		if (parentLabel) {
			return parentLabel + '/' + childLabel;
		}
		return parent + '/' + childLabel;
	}

	isKnownTag(input: string): boolean {
		return this.getName(input) !== undefined;
	}

	async addTag(name: string, label: string, parent: string | null = null): Promise<void> {
		this.nameToLabel.set(name, label);
		this.nameToParent.set(name, parent);
		const key = this.normalize(label);
		if (!this.labelLookup.has(key)) {
			this.labelLookup.set(key, name);
		}
		try {
			await db.tags.put({ name, tag: { name, label, parent, sortOrder: 0, sortType: '', color: '', etag: '' } });
		} catch (error) {
			log.error('TagService: error persisting tag', error);
		}
	}

	private normalize(s: string): string {
		return s.toLowerCase().replace(/[-_\s/]+/g, '-');
	}

	private buildMaps(tags: ITag[]): void {
		this.nameToLabel.clear();
		this.labelLookup.clear();
		this.nameToParent.clear();
		for (const tag of tags) {
			this.nameToLabel.set(tag.name, tag.label);
			this.nameToParent.set(tag.name, tag.parent ?? null);
			const key = this.normalize(tag.label);
			if (!this.labelLookup.has(key)) {
				this.labelLookup.set(key, tag.name);
			}
		}
	}
}
