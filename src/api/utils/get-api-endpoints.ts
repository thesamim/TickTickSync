export { API_ENDPOINTS };

const API_ENDPOINTS = {
  ticktickServer: 'ticktick.com',
  protocol: "https://",
  apiProtocol: "https://api.",
  apiVersion: '/api/v2',
  signInEndPoint: 'user/signon?wc=true&remember=true',
  userPreferencesEndPoint: 'user/preferences/settings',
//Dear Future me: the check is a checkpoint based thing. As in: give me everything after a certain checkpoing
//                0 behavior has become non-deterministic
//TODO: in the fullness of time, figure out checkpoint processing to reduce traffic.
  // generalDetailsEndPoint: 'batch/check/0',
  allProjectsEndPoint: 'projects',
  allHabitsEndPoint: 'habits',
  allTagsEndPoint: 'tags',
  allTasksEndPoint: 'batch/check/',
  TaskEndPoint: 'task',
  updateTaskEndPoint: 'batch/task',
  //If this ever existed, it's gone now. use getSections. That's the only project detail anyway.
  //getProject: 'project/',
  getSections: 'column/project/',
  getAllCompletedItems: "project/all/completedInAll/",
  exportData: 'data/export',
  projectMove: 'batch/taskProject',
  parentMove: `batch/taskParent`
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
