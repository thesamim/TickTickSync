import { describe, expect, it } from 'vitest';
import { TaskParser } from '@/taskParser';
import type { ITaskRecord } from '@/services/fileMap';
import { getSettings } from '@/settings';

function makePlugin(parser: TaskParser) {
  return {
    taskParser: parser,
    cacheOperation: {
      getDefaultProjectIdForFilepath: (_: string) => 'proj-1',
      getProjectIdByNameFromCache: async (_: string) => null,
      getFilepathForTask: (_: string) => 'Some/Path.md',
      loadTaskFromCacheID: (_: string) => null,
    },
    dateMan: {
      parseDates: (_: string) => ({}),
      stripDatesFromLine: (s: string) => s.replace(/[⏳📅]\s*\d{4}-\d{2}-\d{2}/gu, ''),
      formatDateToISO: (_: Date) => '2025-01-01T00:00:00.000Z',
    },
    app: { vault: { getName: () => 'TestVault' } },
  } as any;
}

describe('convertLineToTask note destination', () => {
  const id = 'abcdefabcdefabcdefabcdef';
  const line = `- [ ] Task with note #ticktick  %%[ticktick_id:: ${id}]%%`;
  const filepath = 'Folder/File.md';

  it('puts note into desc when task has child items', async () => {
    (getSettings as any)().noteDelimiter = '';
    (getSettings as any)().fileLinksInTickTick = 'noLink';

    const parser = new TaskParser({} as any, {} as any);
    const plugin = makePlugin(parser);
    parser.plugin = plugin;

    const fileMap = {
      getTaskItems: (_: string) => ['\t- [ ] child %%111111111111111111111111%%'],
      getTaskRecord: (_: string) => ({
        task: line,
        parentId: '',
        taskLines: ['  first', '  second'],
      } satisfies Partial<ITaskRecord>)
    } as any;

    const task = await parser.convertLineToTask(line, 0, filepath, fileMap, null);

    expect(task.desc).toBe('first\nsecond');
    expect(task.content).toBe('');
  });

  it('puts note into content when task has no child items', async () => {
    (getSettings as any)().noteDelimiter = '';
    (getSettings as any)().fileLinksInTickTick = 'noLink';

    const parser = new TaskParser({} as any, {} as any);
    const plugin = makePlugin(parser);
    parser.plugin = plugin;

    const fileMap = {
      getTaskItems: (_: string) => [],
      getTaskRecord: (_: string) => ({
        task: line,
        parentId: '',
        taskLines: ['  alpha', '  beta'],
      } satisfies Partial<ITaskRecord>)
    } as any;

    const task = await parser.convertLineToTask(line, 0, filepath, fileMap, null);

    expect(task.content).toBe('alpha\nbeta');
    expect(task.desc).toBe('');
  });

  it('strips Day Planner visible time prefix, split marker, tags, dates, and hidden schedule metadata from the TickTick title', async () => {
    (getSettings as any)().noteDelimiter = '';
    (getSettings as any)().fileLinksInTickTick = 'noLink';

    const parser = new TaskParser({} as any, {} as any);
    const plugin = makePlugin(parser);
    parser.plugin = plugin;

    const scheduledLine = '- [ ] 08:50 - 09:45 ☀️ Prepare Systematic Theology I materials and schedule <span class="ticktick-task-meta-break"></span> #mdiv-graduation #systematic-theology-1 #academic-execution %% start:: 2026-05-02T09:00:00-05:00 end:: 2026-05-02T09:55:00-05:00 mode:: morning_plan %% ⏳ 2026-05-02 📅 2026-05-03';
    const fileMap = {
      getTaskItems: (_: string) => [],
      getTaskRecordByLine: (_: number) => null,
    } as any;

    const task = await parser.convertLineToTask(scheduledLine, 0, filepath, fileMap, null);

    expect(task.title).toBe('Prepare Systematic Theology I materials and schedule');
  });
});
