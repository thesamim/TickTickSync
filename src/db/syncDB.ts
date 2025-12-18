import Dexie from "dexie";

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  updatedAt: number;
}

class SyncDB extends Dexie {
  tasks!: Dexie.Table<Task, string>;

  constructor() {
    super("TickTickSync");
    this.version(1).stores({
      tasks: "id, updatedAt"
    });
  }
}

export const db = new SyncDB();
