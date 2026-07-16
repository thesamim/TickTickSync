export { API_ENDPOINTS };

const API_ENDPOINTS = {
	signInEndPoint: 'user/signon?wc=true&remember=true',
	userPreferencesEndPoint: 'user/preferences/settings',
	allProjectGroupsEndPoint: 'batch/check/', //TODO: populate from the projectGroups
	allProjectsEndPoint: 'projects',
	projectEndPoint: 'project',
	updateProjectEndPoint: 'batch/project',
	allHabitsEndPoint: 'habits',
	allTagsEndPoint: 'tags',
	batchTagEndPoint: 'batch/tag',
	allTasksEndPoint: 'batch/check/',
	TaskEndPoint: 'task',
	updateTaskEndPoint: 'batch/task',
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
