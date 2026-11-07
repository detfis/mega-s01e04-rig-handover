import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

describe('readNight', () => {
  it('parses runs/2026-10-28.jsonl into 5 sorted job rows and counts 1 bad line', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest).not.toBeNull();
    if (!digest) return;

    expect(digest.night).toBe('2026-10-28');
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const digestRender = digest.rows.find((r) => r.job === 'digest/render');
    expect(digestRender).toEqual({
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T05:41:09+01:00',
      lastAt: '2026-10-29T05:41:09+01:00',
    });

    const fixturesRefresh = digest.rows.find((r) => r.job === 'fixtures/refresh');
    expect(fixturesRefresh).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });

    const notesBackup = digest.rows.find((r) => r.job === 'notes/backup');
    expect(notesBackup).toEqual({
      job: 'notes/backup',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-10-29T04:00:01+01:00',
      lastAt: '2026-10-29T04:00:01+01:00',
    });
  });

  it('returns null when the night file does not exist or night format is invalid', () => {
    expect(readNight('runs', '2026-10-99')).toBeNull();
    expect(readNight('runs', '../2026-10-28')).toBeNull();
  });
});
