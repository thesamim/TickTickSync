export interface IProject {
	id: string;
	name: string;
	isOwner: boolean;
	color: string;
	inAll: boolean;
	sortOrder: number;
	sortType: string;
	userCount: number;
	etag: string;
	modifiedTime: string;
	closed: number;
	muted: boolean;
	transferred: number;
	groupId: string;
	viewMode: string;
	notificationOptions: unknown;
	teamId: string;
	permission: unknown;
	kind: string;
	timeline: unknown;
}

export interface ISections {
	id: number,
	projectId: number,
	name: string,
	sortOrder: number,
}

/**
 * projectGroups
 */
export interface IGroup {
	id: number,
	name: string
}
