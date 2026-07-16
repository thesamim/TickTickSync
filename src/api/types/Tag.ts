export type { ITag };

interface ITag {
	name: string;
	label: string;
	parent: string | null;
	sortOrder: number;
	sortType: string;
	color: string;
	etag: string;
}
