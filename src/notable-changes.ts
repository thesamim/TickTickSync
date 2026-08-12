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
		title: "Links between Obsidian and TickTick can now be configured: **No Link**, **Link in Task**, or **Link in Description**",
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
		description: "General performance improvements\n**Recurrence processing**\n**Task display visibility controls** — custom rendering for TickTick tasks in reading & edit mode\n**Granular link hiding** for TickTick tasks in reading & edit mode\n**Sync journal persisted to Dexie**, with modal viewer\n**Device identity & tracking** — mobile device ID capture, device naming in settings\n**Project preservation** — follow TickTick project folder structure\n**Orphan task detection** modal, **found duplicate tasks** modal\n**Conflict resolution** logging\n**Access control / SSO 2FA login** improvements\n**Soft-delete task lifecycle** — auto-cleanup of deleted tasks after configurable retention period (default 7 days), manual permanent deletion, recovery,\n**Tag handling overhaul** — case-sensitivity respected, sub-tags handled correctly.\n**Case-insensitive project matching** (via normalized dashes)\n**Task file stickiness on sync** — tasks stay associated with their source file across syncs",
		anchor: '2.0.1',
	},
	{
		version: '2.0.5',
		title: "**Fresh installs now sync correctly** — tasks pulled from TickTick appear in your vault from the very first sync (project-to-file mapping is created automatically)",
		description: "**All-day task dates no longer drift** — due dates on all-day tasks could shift by a day on each sync in some timezones; now stable\n**TickTick tag handling is now configurable** — new settings under **Task Display** let you stop injecting the `ticktick` tag onto TickTick tasks, and strip the legacy tag when you reset your tasks\n**Better documentation** — sync timing, conflict handling, and known TickTick quirks are now covered in the docs\n**Make settings 1.13.x compatible**\nGeneral stability and performance improvements",
		anchor: '2.0.5',
	}
];
