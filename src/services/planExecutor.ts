import { App, Notice, TFile } from 'obsidian';
import { FileMap } from '@/services/fileMap';
import { AuditLog } from '@/services/auditLog';
import type { AuditEntry } from '@/services/auditLog';
import { makeOpId } from '@/services/provenance';
import TickTickSync from '@/main';
import log from 'loglevel';

export interface PlanAction {
    action: 'delete' | 'keep' | 'merge';
    taskId: string;
    from: string; // file path
    to?: string; // canonical file
}

export interface DuplicatePlan {
    taskId: string;
    titleSnippet?: string;
    candidates: string[]; // file paths
    recommended?: string;
    actions: PlanAction[];
}

export class PlanExecutor {
    app: App;
    plugin: TickTickSync;
    audit: AuditLog;

    constructor(app: App, plugin: TickTickSync) {
        this.app = app;
        this.plugin = plugin;
        this.audit = new AuditLog(app);
    }

    // Apply the plan: create backups, apply changes, update metadata, record audit
    async applyPlan(plan: DuplicatePlan[], userAction: 'manual' | 'auto' = 'manual') {
        const opId = makeOpId();
        const entry: AuditEntry = {
            opId,
            ts: new Date().toISOString(),
            userAction,
            description: `Apply duplicate cleanup plan (${plan.length} tasks)`,
            backups: [],
            actions: []
        };

        for (const p of plan) {
            for (const act of p.actions) {
                if (act.action === 'delete') {
                    const filePath = act.from;
                    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
                    if (!file) {
                        log.warn('PlanExecutor: file not found', filePath);
                        continue;
                    }
                    try {
                        // backup
                        const original = await this.app.vault.read(file);
                        const now = new Date();
                        const ts = now.toISOString().replace(/[:.]/g, '-');
                        let bkpPath = '';
                        if (file.path.toLowerCase().endsWith('.md')) {
                            bkpPath = file.path.replace(/(\.md)$/i, `.tickticksync-dup-bak-${ts}.bkup`);
                        } else {
                            bkpPath = `${file.path}.tickticksync-dup-bak-${ts}.bkup`;
                        }
                        await this.app.vault.create(bkpPath, original);
                        entry.backups.push(bkpPath);
                        entry.actions.push({ type: 'backup', file: filePath, details: { bkpPath } });

                        // delete task block via FileMap
                        const fm = new FileMap(this.app, this.plugin, file);
                        await fm.init();
                        fm.deleteTask(act.taskId);
                        const newContent = fm.getFileLines();
                        await this.app.vault.modify(file, newContent);
                        entry.actions.push({ type: 'delete', file: filePath, details: { taskId: act.taskId } });

                        // update metadata
                        try {
                            await this.plugin.cacheOperation?.deleteTaskIdFromMetadata(filePath, act.taskId);
                            entry.actions.push({ type: 'metadata-update', file: filePath, details: { taskId: act.taskId } });
                        } catch (err) {
                            log.warn('PlanExecutor: failed to update metadata', err);
                        }

                    } catch (err) {
                        log.error('PlanExecutor: failed to apply delete action', err);
                        new Notice(`Failed to apply plan to ${filePath}: ${err}`);
                    }
                }
                // TODO: support merge action (append variants to canonical with provenance markers)
            }
        }

        await this.audit.append(entry);
        await this.plugin.saveSettings();
        new Notice('Duplicate plan applied. Backups were created and recorded.');
        return entry;
    }
}
