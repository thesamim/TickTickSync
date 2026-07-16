export interface NotableChange {
	version: string;
	title: string;
	description: string;
	anchor: string;
}

export const NOTABLE_CHANGES: NotableChange[] = [
	{
		version: '1.0.36',
		title: "Introduced AND/OR limiting rules for tag + project combinations",
		description: "Tasks tagged `#ticktick` always upload to TickTick\nLimiting project and/or tag control which tasks sync from TickTick to Obsidian",
		anchor: '1.0.36',
	},
	{
		version: '1.0.40',
		title: "Start/Scheduled date, Due date, Creation date, Completed date, and Cancelled date are all treated as distinct fields",
		description: "Date times are now preserved across syncs\nOld date formats are converted automatically on next sync\nTime representation uses `[hh:mm]` syntax in task lines",
		anchor: '1.0.40',
	},
	{
		version: '1.1.1',
		title: "Notes are now synchronized between TickTick and Obsidian",
		description: "Markdown formatting is preserved",
		anchor: '1.1.1',
	},
	{
		version: '1.1.7',
		title: "Note synchronization is now optional (toggle in settings)",
		description: "Default project settings fixed: updates from TickTick no longer misplace tasks in files without project associations",
		anchor: '1.1.7',
	},
	{
		version: '1.1.8',
		title: "Links between Obsidian and TickTick can now be configured: <strong>No Link</strong>, <strong>Link in Task</strong>, or <strong>Link in Description</strong>",
		description: "",
		anchor: '1.1.8',
	},
	{
		version: '1.1.10',
		title: "Tasks created in a file stay in that file when updated from TickTick (fixes duplicate task issues)",
		description: "Backup settings moved to Manual Operations section\nNote separator is now configurable (custom delimiter or none)\nNew note separator option for DataView compatibility",
		anchor: '1.1.10',
	},
	{
		version: '1.1.14',
		title: "Desktop users with SSO or 2FA can now log in via a web browser",
		description: "Mobile still requires regular login, but can use the session authenticated from desktop",
		anchor: '1.1.14',
	},
	{
		version: '1.1.16',
		title: "Notes can now contain checklist items and TickTick task links",
		description: "To start a new note, just indent the line after the task by two spaces — no need to type delimiters",
		anchor: '1.1.16',
	},
	{
		version: '2.0.1',
		title: "Complete re-architecture for better cross-device handling",
		description: "General performance improvements\n<strong>Recurrence processing</strong>\n<strong>Task display visibility controls</strong> — custom rendering for TickTick tasks in reading & edit mode\n<strong>Granular link hiding</strong> for TickTick tasks in reading & edit mode\n<strong>Sync journal persisted to Dexie</strong>, with modal viewer\n<strong>Device identity & tracking</strong> — mobile device ID capture, device naming in settings\n<strong>Project preservation</strong> — follow TickTick project folder structure\n<strong>Orphan task detection</strong> modal, <strong>found duplicate tasks</strong> modal\n<strong>Conflict resolution</strong> logging\n<strong>Access control / SSO 2FA login</strong> improvements\n<strong>Soft-delete task lifecycle</strong> — auto-cleanup of deleted tasks after configurable retention period (default 7 days), manual permanent deletion, recovery,\n<strong>Tag handling overhaul</strong> — case-sensitivity respected, sub-tags handled correctly.\n<strong>Case-insensitive project matching</strong> (via normalized dashes)\n<strong>Task file stickiness on sync</strong> — tasks stay associated with their source file across syncs",
		anchor: '2.0.1',
	}
];
