export { convertDateToTickTickFormat };

function convertDateToTickTickFormat(date: any) {
	if (date === undefined) {
		return date;
	}

	let dateString = date;
	if (date instanceof Date) {
		dateString = date.toISOString();
	} else if (typeof dateString !== 'string') {
		throw new Error(`The provided date "${date}" is invalid`);
	}

	return dateString.replace('Z', '+0000');
}
