export { API_ENDPOINTS };

const API_ENDPOINTS = {
	signInEndPoint: 'user/signon?wc=true&remember=true',
	userPreferencesEndPoint: 'user/preferences/settings',
	allProjectGroupsEndPoint: 'batch/check/', //TODO: populate from the projectGroups
	allProjectsEndPoint: 'projects',
	allHabitsEndPoint: 'habits',
	allTagsEndPoint: 'tags',
	allTasksEndPoint: 'batch/check/',
	TaskEndPoint: 'task',
	updateTaskEndPoint: 'batch/task',
	getProjects: 'projects/',
	getSections: 'column/project/',
	getAllCompletedItems: 'project/all/completedInAll/',
	exportData: 'data/export',
	projectMove: 'batch/taskProject',
	parentMove: `batch/taskParent`,
	userStatus: 'user/status',
};

/*
/batch/taskProject
/batch/task
/task?+query
/projects
/user/status
/project/all/trash/pagination?start=
/project/all/completedInAll/
/habits/batch
*/
