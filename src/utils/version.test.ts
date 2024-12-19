import { describe, expect, test } from "vitest";
import {isOlder} from "@/utils/version";

describe("version.isOlder", () => {
	test('1.0.10 and 1.0.11', () => {
		expect(isOlder('1.0.10', '1.0.11')).toBeTruthy();
	});

	test('1.0.10 and 1.0.9', () => {
		expect(isOlder('1.0.10', '1.0.9')).toBeFalsy();
	});
})
