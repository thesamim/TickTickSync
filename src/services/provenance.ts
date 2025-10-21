import { getSettings } from '@/settings';

export function computeTaskChecksum(task: { title?: string; content?: string; items?: any[] } ): string {
    const title = task.title || '';
    const content = task.content || '';
    const items = (task.items || []).map((i: any) => i.id || i).sort().join(',');
    const payload = `${title}::${content}::${items}`;
    // simple djb2 style hash
    let hash = 5381;
    for (let i = 0; i < payload.length; i++) {
        hash = ((hash << 5) + hash) + payload.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

export function makeOpId(): string {
    const device = getSettings().deviceId || 'local';
    return `${device}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}
