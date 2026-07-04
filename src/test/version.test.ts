import { describe, expect, test } from 'vitest';
import { isOlder } from '@/utils/version';

describe('version.isOlder', () => {
	test('1.0.10 and 1.0.11', () => {
		expect(isOlder('1.0.10', '1.0.11')).toBeTruthy();
	});

	test('1.0.10 and 1.0.9', () => {
		expect(isOlder('1.0.10', '1.0.9')).toBeFalsy();
	});

	test('equal versions returns false', () => {
		expect(isOlder('1.1.17', '1.1.17')).toBeFalsy();
		expect(isOlder('2.0.0', '2.0.0')).toBeFalsy();
	});

	test('1.1.17 is older than 2.0.0', () => {
		expect(isOlder('1.1.17', '2.0.0')).toBeTruthy();
	});
});
