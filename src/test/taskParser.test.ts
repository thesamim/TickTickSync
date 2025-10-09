import { describe, it, expect } from 'vitest';
//TODO: task parser tests are failing because it imports obsidian, which is not available in vitest
import { REGEX, TaskParser } from '../taskParser';
import { FileMap } from '@/services/fileMap';
import { getSettings } from '@/settings';

const TASK1 = '- [ ] ttsb_task11 #ttsb  [link](https://ticktick.com/webapp/#p/67326d9f5f088184d96f1d4f/tasks/673ae6b7e143d55b24bd0271) #ticktick  %%[ticktick_id:: 673ae6b7e143d55b24bd0271]%% 📅 2024-11-19';

// @ts-ignore
const parser = new TaskParser(null, null); //TODO extend TaskParser

describe('TaskParser.REGEX', () => {
	test('TASK1', () => {
		expect([...TASK1.matchAll(REGEX.ALL_TAGS)].length).toBe(2);
	});
});

describe('TaskParser.common', () => {
	test('hasTickTickId', () => {
		expect(parser.hasTickTickId(TASK1)).toBeTruthy();
	});
});

//TODO: add more tests
// describe("TaskParser.parse", () => {
// 	test('parse', async () => {
// 		const task = await parser.convertLineToTask(TASK1);
// 		expect(task.id).toBe("673ae6b7e143d55b24bd0271");
// 		expect(task.title).toBe("ttsb_task11");
// 		expect(task.tags).toBe("ttsb");
// 		expect(task.link).toBe("https://ticktick.com/webapp/#p/67326d9f5f088184d96f1d4f/tasks/673ae6b7e143d55b24bd0271");
// 		expect(task.ticktickId).toBe("673ae6b7e143d55b24bd0271");
// 		expect(task.date).toBe("2024-11-19");
// 	});
// })

describe('Notes parsing - no delimiter', () => {
	// Simulate a file with a task and a multi-line note without delimiters
it('collects note lines including checklist items without IDs in no-delimiter mode', async () => {
		const lines = [
			'- [ ] just a task, no I didn\'t  #ticktick  %%[ticktick_id:: 68e5581b8eae495e8cca4f3c]%%',
			'  Ya, you didn\'t count on that ',
			'  did you?',
			'  let\'s add a line. ',
			'  - [ ] checklist in note',
			'  Not quite there',
			'\t- [ ] child item %%aaaaaaaaaaaaaaaaaaaaaaaa%%'
		];
		// minimal fakes for FileMap usage
		const app = {} as any;
		const plugin = {
			taskParser: new TaskParser({} as any, {} as any),
		} as any;

		// Fake FileMap instance with minimal API used by getTaskLinesByIdx
		const fm = new (class extends (FileMap as any) {
			constructor() { super({}, plugin, {}); this.fileLines = lines; }
			getParentIDByIdx() { return ''; }
			getTaskIndex() { return 0; }
		})();
		plugin.taskParser.plugin = plugin;

		// Force no delimiter setting
		(getSettings as any)().noteDelimiter = '';

		const rec = (fm as any).getTaskLinesByIdx(0, {} as any);
		console.log("Rec: " , rec);
		expect(rec.taskLines.length).toBe(5);
		expect(rec.taskLines[0].trim()).toBe('Ya, you didn\'t count on that');
		expect(rec.taskLines[3].trim()).toBe('- [ ] checklist in note');
		expect(rec.taskLines[rec.taskLines.length - 1].trim()).toBe('Not quite there');
	});

	it('normalizes legacy delimiter to current delimiter', async () => {
		const currentDelim = ':::';
		const legacyDelim = '---';
		const lines = [
			'- [ ] Task #ticktick %%[ticktick_id:: abcdefabcdefabcdefabcdef]%%',
			'  ' + legacyDelim,
			'  first',
			'  last',
			'  ' + legacyDelim
		];
		const app = {} as any;
		const plugin = {
			taskParser: new TaskParser({} as any, {} as any),
		} as any;

		const fm = new (class extends (FileMap as any) {
			constructor() { super({}, plugin, {}); this.fileLines = lines; }
			getParentIDByIdx() { return ''; }
			getTaskIndex() { return 0; }
		})();
		plugin.taskParser.plugin = plugin;

		(getSettings as any)().noteDelimiter = currentDelim;

		const rec = (fm as any).getTaskLinesByIdx(0, {} as any);
		expect(rec.taskLines[0]).toBe('  ' + currentDelim);
		expect(rec.taskLines[rec.taskLines.length - 1]).toBe('  ' + currentDelim);
	});
});

