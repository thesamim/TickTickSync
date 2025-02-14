export function isOlder(version1: string, version2: string) {
	const v1 = version1.split('.');
	const v2 = version2.split('.');

	for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
		const num1 = parseInt(v1[i] || '0');
		const num2 = parseInt(v2[i] || '0');

		if (num1 < num2) {
			return true;
		} else if (num1 > num2) {
			return false;
		}
	}

	return false;
}
