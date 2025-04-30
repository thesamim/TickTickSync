// Example array of tasks
const tasks: [] = [
	{ id: '1', parentId: '' },
	{ id: '2', parentId: '1' },
	{ id: '3', parentId: '' },
	{ id: '4', parentId: '2' },
	{ id: '5', parentId: '1' }
];

// Custom comparator for sorting
tasks.sort((a, b) => {
	// If b is a parent of a, a should come before b (child before parent)
	if (a.parentId === b.id) {
		return -1; // a comes before b
	}
	// If a is a parent of b, b should come before a (child before parent)
	if (b.parentId === a.id) {
		return 1; // b comes before a
	}
	return 0; // If neither is a parent of the other, they stay in the same order
});

log.debug(tasks);
