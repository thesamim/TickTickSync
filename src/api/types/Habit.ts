export { IHabit };

interface IHabit {
	id: string;
	name: string;
	iconRes: string;
	color: string;
	sortOrder: any;
	status: number;
	encouragement: string;
	totalCheckIns: number;
	createdTime: string;
	modifiedTime: string;
	type: string;
	goal: number;
	step: number;
	unit: string;
	etag: string;
	repeatRule: string;
	reminders: string[];
	recordEnable: boolean;
	sectionId: string;
	targetDays: number;
	targetStartDate: number;
	completedCycles: number;
}
