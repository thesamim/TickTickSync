import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewFileMap } from '../services/NewFileMap';

vi.mock('../utils/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock('../settings', () => ({
	getSettings: vi.fn(() => ({})),
}));

function makeMockApp() {
	return {
		metadataCache: {
			getFileCache: vi.fn().mockReturnValue({ listItems: [] }),
		},
	} as any;
}

function makeMockPlugin() {
	return {
		taskParser: {
			getNumTabs: vi.fn(() => 0),
			getTabs: vi.fn(() => ''),
			isMarkdownTask: vi.fn((line: string) => /^[\s]*[-*+] \[[ x]\]/.test(line)),
			getTickTickId: vi.fn(() => null),
		},
		fileOperation: {
			readFileContent: vi.fn(),
		},
	} as any;
}

function makeMockFile(path = 'test.md') {
	return { path } as any;
}

describe('NewFileMap.addTask', () => {
	let app: ReturnType<typeof makeMockApp>;
	let plugin: ReturnType<typeof makeMockPlugin>;

	beforeEach(() => {
		vi.clearAllMocks();
		app = makeMockApp();
		plugin = makeMockPlugin();
	});

	it('should not add blank line when appending to file with trailing newline', async () => {
		const file = makeMockFile();
		const fileMap = new NewFileMap(app, plugin, file);

		// File content ends with \n, so split produces an empty string as last element
		await fileMap.init('line1\nline2\n');

		const task = { id: 'task1', parentId: '', title: 'Test Task' } as any;
		const taskLine = '- [ ] Test Task';

		fileMap.addTask(task, taskLine);

		const result = fileMap.getFileLines();
		// Should NOT have a blank line between line2 and the task
		// The old (broken) behavior would produce: 'line1\nline2\n\n- [ ] Test Task\n'
		// (double newline before task, indicating blank line was inserted)
		expect(result).not.toContain('\n\n- [ ] Test Task');
		// Should preserve the trailing newline from the original file
		expect(result).toBe('line1\nline2\n- [ ] Test Task\n');
	});

	it('should append correctly when file has no trailing newline', async () => {
		const file = makeMockFile();
		const fileMap = new NewFileMap(app, plugin, file);

		await fileMap.init('line1\nline2');

		const task = { id: 'task1', parentId: '', title: 'Test Task' } as any;
		const taskLine = '- [ ] Test Task';

		fileMap.addTask(task, taskLine);

		const result = fileMap.getFileLines();
		expect(result).toBe('line1\nline2\n- [ ] Test Task');
	});

	it('should append correctly to empty file', async () => {
		const file = makeMockFile();
		const fileMap = new NewFileMap(app, plugin, file);

		await fileMap.init('');

		const task = { id: 'task1', parentId: '', title: 'Test Task' } as any;
		const taskLine = '- [ ] Test Task';

		fileMap.addTask(task, taskLine);

		const result = fileMap.getFileLines();
		expect(result).toBe('- [ ] Test Task');
	});

	it('should insert at specific line number without blank line issue', async () => {
		const file = makeMockFile();
		const fileMap = new NewFileMap(app, plugin, file);

		await fileMap.init('line1\nline2\n');

		const task = { id: 'task1', parentId: '', title: 'Test Task' } as any;
		const taskLine = '- [ ] Test Task';

		// Insert at line 1 (between line1 and line2)
		fileMap.addTask(task, taskLine, 1);

		const result = fileMap.getFileLines();
		expect(result).toBe('line1\n- [ ] Test Task\nline2\n');
	});

	it('round-trip split/join should preserve content exactly', async () => {
		const file = makeMockFile();
		const fileMap = new NewFileMap(app, plugin, file);

		const originalContent = 'line1\nline2\nline3\n';
		await fileMap.init(originalContent);

		const result = fileMap.getFileLines();
		expect(result).toBe(originalContent);
	});
});
