export type { IProjectGroup };

interface IProjectGroup {
	id: string;
	etag: string;
	name: string;
	showAll: boolean;
	sortOrder: number;
	viewMode: string;
	deleted: number;
	userId: number;
	sortType: string;
	teamId: string;
	timeline: unknown;
}
