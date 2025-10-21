import { App } from 'obsidian';

export interface AuditEntry {
    opId: string;
    ts: string;
    userAction: 'manual' | 'auto';
    description?: string;
    backups: string[]; // paths of created backups
    actions: Array<{ type: string; file: string; details?: any }>;
}

export class AuditLog {
    app: App;
    storageKey = 'tickticksync-audit-log';

    constructor(app: App) {
        this.app = app;
    }

    async append(entry: AuditEntry) {
        const now = new Date().toISOString();
        entry.ts = entry.ts || now;
        const store = await this.readAll();
        store.push(entry);
        await this.saveAll(store);
    }

    async readAll(): Promise<AuditEntry[]> {
        try {
            const file = this.app.vault.getAbstractFileByPath('.tickticksync-audit.json');
            if (!file) return [];
            const content = await this.app.vault.read(file as any);
            return JSON.parse(content || '[]');
        } catch (err) {
            return [];
        }
    }

    async saveAll(entries: AuditEntry[]) {
        const path = '.tickticksync-audit.json';
        const content = JSON.stringify(entries, null, 2);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
            await this.app.vault.create(path, content);
        } else {
            await this.app.vault.modify(file as any, content);
        }
    }
}
