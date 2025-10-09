import { describe, expect, it } from 'vitest';
import { TaskParser } from '@/taskParser';
import type { ITaskRecord } from '@/services/fileMap';
import { getSettings } from '@/settings';

// Dedicated tests for TaskParser.getNoteString covering delimiter and no-delimiter modes

describe('TaskParser.getNoteString', () => {
  it('returns all lines in no-delimiter mode (no trimming of first/last)', () => {
    // no delimiter configured
    (getSettings as any)().noteDelimiter = '';

    const parser = new TaskParser({} as any, {} as any);

    const taskRecord: ITaskRecord = {
      task: '- [ ] example #ticktick  %%[ticktick_id:: abc]%%',
      parentId: '',
      taskLines: [
        '  first line',
        '  middle line',
        '  last line',
      ],
    } as any;

    const res = parser.getNoteString(taskRecord, 'abc');
    // In no-delimiter mode, we do not drop first/last lines
    expect(res).toBe(['first line', 'middle line', 'last line'].join('\n'));
  });

  it('strips configured delimiter lines and filters ticktick link by id', () => {
    // configure delimiter
    (getSettings as any)().noteDelimiter = ':::';

    const parser = new TaskParser({} as any, {} as any);

    const id = 'abcdefabcdefabcdefabcdef';
    const taskRecord: ITaskRecord = {
      task: `- [ ] with note #ticktick  %%[ticktick_id:: ${id}]%%`,
      parentId: '',
      taskLines: [
        '  :::',
        `  [link](https://ticktick.com/webapp/#p/123/tasks/${id})`,
        '  alpha',
        '  beta',
        '  :::',
      ],
    } as any;

    const res = parser.getNoteString(taskRecord, id);
    // Should remove first and last delimiter lines and also remove the [link](...) line with the task id
    expect(res).toBe(['alpha', 'beta'].join('\n'));
  });
});
