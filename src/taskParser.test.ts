import {describe, expect, test} from "vitest";
import {REGEX, TaskParser} from "@/taskParser";

const TASK1 = "- [ ] ttsb_task11 #ttsb  [link](https://ticktick.com/webapp/#p/67326d9f5f088184d96f1d4f/tasks/673ae6b7e143d55b24bd0271) #ticktick  %%[ticktick_id:: 673ae6b7e143d55b24bd0271]%% 📅 2024-11-19"

// @ts-ignore
const parser = new TaskParser(null, null); //TODO extend TaskParser

describe("TaskParser.REGEX", () => {
	test('TASK1', () => {
		expect([...TASK1.matchAll(REGEX.ALL_TAGS)].length).toBe(2);
	});
})

describe("TaskParser.common", () => {
	test('hasTickTickId', () => {
		expect(parser.hasTickTickId(TASK1)).toBeTruthy();
	});
})

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
