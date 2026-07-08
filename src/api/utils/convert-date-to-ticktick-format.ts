export { convertDateToTickTickFormat };

function convertDateToTickTickFormat(date: Date | string | undefined): string | undefined {
	if (date === undefined) {
		return date;
	}

	if (date instanceof Date) {
		return date.toISOString().replace('Z', '+0000');
	} else if (typeof date === 'string') {
		return date.replace('Z', '+0000');
	}

	throw new Error(`The provided date "${String(date)}" is invalid`);
}
