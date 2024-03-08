export interface IProject {
  id: string
  name: string
  isOwner: boolean
  color: string
  inAll: boolean
  sortOrder: any
  sortType: string
  userCount: number
  etag: string
  modifiedTime: string
  closed: any
  muted: boolean
  transferred: any
  groupId: any
  viewMode: string
  notificationOptions: any
  teamId: any
  permission: any
  kind: string
  timeline: any
}
export interface ISections 
{
  id: number,
  projectId: number,
  name: string,
  sortOrder: number,
}
