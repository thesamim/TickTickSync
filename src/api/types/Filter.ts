export type { IFilter };

interface IFilter {
	id: string;
	name: string;
	rule: string;
	sortOrder: number;
	sortType: string;
	viewMode: string;
	timeline: unknown;
	etag: string;
	createdTime: string;
	modifiedTime: string;
}
