export interface TaskSyntaxDetector {
	hasTickTickTag(line: string): boolean;
	hasHiddenSchedule(line: string): boolean;
	isMarkdownTask(line: string): boolean;
}

export function isEligibleNewTaskLine(
	lineText: string,
	filePath: string | undefined,
	taskFolderPath: string | undefined,
	syncOnlyTaskSyntax: boolean,
	taskParser: TaskSyntaxDetector
): boolean {
	const isInTaskFolder = !!filePath && !!taskFolderPath && filePath.startsWith(taskFolderPath);
	const hasExistingTag = taskParser.hasTickTickTag(lineText);
	const hasHiddenSchedule = taskParser.hasHiddenSchedule(lineText);
	const isMarkdownTask = taskParser.isMarkdownTask(lineText);

	if (syncOnlyTaskSyntax && !isMarkdownTask) {
		return false;
	}

	return isInTaskFolder || hasExistingTag || hasHiddenSchedule;
}
