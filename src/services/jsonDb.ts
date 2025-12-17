import type TickTickSync from '@/main';
import type { ITask } from '@/api/types/Task';
import type { FileMetadata, FileDetail } from '@/services/cacheOperation';

type DbShape = {
  version: number;
  tasks: ITask[];
  fileMetadata: FileMetadata;
  meta: {
    lastSaved: number;
    trackingTaskId?: string;
    // device identity for this install
    deviceId?: string;
    deviceName?: string;
    // control payload bookkeeping
    lastPayloadWriteTs?: number;
    lastPayloadHash?: string;
  };
};

const DB_FILE = '.ticktick-sync.db.json';

export class JsonDB {
  private plugin: TickTickSync;
  private data: DbShape | null = null;
  private saveTimer?: number;

  constructor(plugin: TickTickSync) {
    this.plugin = plugin;
  }

  async init(): Promise<void> {
    try {
      const exists = await this.plugin.app.vault.adapter.exists(DB_FILE);
      if (!exists) {
        this.data = {
          version: 1,
          tasks: [],
          fileMetadata: {},
          meta: { lastSaved: Date.now() }
        };
        await this.flush();
      } else {
        const raw = await this.plugin.app.vault.adapter.read(DB_FILE);
        this.data = JSON.parse(raw) as DbShape;
        // basic guards
        if (!this.data.version) this.data.version = 1;
        if (!this.data.tasks) this.data.tasks = [];
        if (!this.data.fileMetadata) this.data.fileMetadata = {} as FileMetadata;
        if (!this.data.meta) this.data.meta = { lastSaved: Date.now() };
      }
    } catch (e) {
      // Fallback to in-memory if anything goes wrong
      this.data = {
        version: 1,
        tasks: [],
        fileMetadata: {},
        meta: { lastSaved: Date.now() }
      };
    }
  }

  // Migration helper to seed DB from existing cache
  async seedFromCache(tasks: ITask[], fileMetadata: FileMetadata): Promise<void> {
    if (!this.data) await this.init();
    if (!this.data) return;
    const empty = (this.data.tasks.length === 0) && (Object.keys(this.data.fileMetadata).length === 0);
    if (!empty) return; // don't overwrite existing DB
    this.data.tasks = tasks ?? [];
    this.data.fileMetadata = fileMetadata ?? {} as FileMetadata;
    await this.flushDebounced();
  }

  getTasks(): ITask[] {
    return this.data?.tasks ?? [];
  }

  setTasks(tasks: ITask[]): void {
    if (!this.data) return;
    this.data.tasks = tasks;
    void this.flushDebounced();
  }

  getFileMetadata(filepath?: string): FileMetadata | FileDetail | undefined {
    if (!this.data) return undefined;
    if (!filepath) return this.data.fileMetadata;
    return this.data.fileMetadata[filepath];
  }

  setFileMetadata(filepath: string, detail: FileDetail): void {
    if (!this.data) return;
    if (!this.data.fileMetadata) this.data.fileMetadata = {} as FileMetadata;
    this.data.fileMetadata[filepath] = detail;
    void this.flushDebounced();
  }

  getTrackingTaskId(): string | undefined {
    return this.data?.meta?.trackingTaskId;
  }

  setTrackingTaskId(id: string | undefined) {
    if (!this.data) return;
    this.data.meta.trackingTaskId = id;
    void this.flushDebounced();
  }

  getDeviceId(): string | undefined {
    return this.data?.meta?.deviceId;
  }

  setDeviceId(id: string) {
    if (!this.data) return;
    this.data.meta.deviceId = id;
    void this.flushDebounced();
  }

  getDeviceName(): string | undefined {
    return this.data?.meta?.deviceName;
  }

  setDeviceName(name: string) {
    if (!this.data) return;
    this.data.meta.deviceName = name;
    void this.flushDebounced();
  }

  getLastPayloadWriteTs(): number | undefined {
    return this.data?.meta?.lastPayloadWriteTs;
  }

  setLastPayloadWriteTs(ts: number) {
    if (!this.data) return;
    this.data.meta.lastPayloadWriteTs = ts;
    void this.flushDebounced();
  }

  getLastPayloadHash(): string | undefined {
    return this.data?.meta?.lastPayloadHash;
  }

  setLastPayloadHash(hash: string) {
    if (!this.data) return;
    this.data.meta.lastPayloadHash = hash;
    void this.flushDebounced();
  }

  getFilepathForTask(taskId: string): string | null {
    const meta = this.data?.fileMetadata;
    if (!meta) return null;
    for (const fp in meta) {
      const value = meta[fp];
      if (value?.TickTickTasks?.find(t => t.taskId === taskId)) {
        return fp;
      }
    }
    return null;
  }

  private async flush(): Promise<void> {
    if (!this.data) return;
    this.data.meta.lastSaved = Date.now();
    const raw = JSON.stringify(this.data);
    await this.plugin.app.vault.adapter.write(DB_FILE, raw);
  }

  private async flushDebounced(): Promise<void> {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(async () => {
      await this.flush();
    }, 300);
  }
}
