import { describe, expect, it } from 'vitest';
import { isEligibleNewTaskLine, type TaskSyntaxDetector } from '@/services/taskEligibility';

function makeTaskParser(): TaskSyntaxDetector {
	return {
		hasTickTickTag: () => false,
		hasHiddenSchedule: () => false,
		isMarkdownTask: (line: string) => /^(\s*)([-*+]|\d+\.)\s+\[[^\]]\]\s/.test(line),
	};
}

describe('syncOnlyTaskSyntax', () => {
	it('ignores plain lines in the task folder when enabled', async () => {
		const result = isEligibleNewTaskLine(
			'Plain text line',
			'Tasks/Inbox.md',
			'Tasks',
			true,
			makeTaskParser()
		);

		expect(result).toBe(false);
	});

	it('keeps existing plain-line task folder behavior when disabled', async () => {
		const result = isEligibleNewTaskLine(
			'Plain text line',
			'Tasks/Inbox.md',
			'Tasks',
			false,
			makeTaskParser()
		);

		expect(result).toBe(true);
	});

	it('allows Markdown task syntax in the task folder when enabled', async () => {
		const result = isEligibleNewTaskLine(
			'- [ ] Checkbox task',
			'Tasks/Inbox.md',
			'Tasks',
			true,
			makeTaskParser()
		);

		expect(result).toBe(true);
	});
});
