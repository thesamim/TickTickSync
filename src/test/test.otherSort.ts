interface ITask {
	id: string;
	parentId: string;
}

//
// function
//
// // Example usage:
// const tasks: ITask[] = [
// 	{ id: "task1", parentId: "" },
// 	{ id: "task2", parentId: "task1" },
// 	{ id: "task3", parentId: "task2" },
// 	{ id: "task4", parentId: "task1" },
// 	{ id: "task5", parentId: "" },
// 	{ id: "task6", parentId: "task5"},
// ];
//
// const sorted = sortTasks(tasks);
//
// log.debug(sorted);
