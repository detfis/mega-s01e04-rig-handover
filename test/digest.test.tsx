import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

describe('digest routes', () => {
  let tempDir: string;
  let config: RigConfig;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'rig-digest-test-'));
    config = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir: tempDir,
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns 200 on valid night with jobs, marking retries >= 3 and fail with warn, owner null as —, and matching job order', async () => {
    const lines = [
      JSON.stringify({
        at: '2026-10-29T01:00:00+01:00',
        job: 'z-job',
        status: 'retry',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-10-29T01:01:00+01:00',
        job: 'z-job',
        status: 'retry',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-10-29T01:02:00+01:00',
        job: 'z-job',
        status: 'retry',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-10-29T01:03:00+01:00',
        job: 'z-job',
        status: 'ok',
        owner: 'alice',
      }),
      JSON.stringify({
        at: '2026-10-29T02:00:00+01:00',
        job: 'a-job',
        status: 'fail',
        owner: null,
        error: 'disk error',
      }),
      JSON.stringify({
        at: '2026-10-29T03:00:00+01:00',
        job: 'm-job',
        status: 'ok',
        owner: 'bob',
      }),
    ].join('\n');

    writeFileSync(join(tempDir, '2026-10-28.jsonl'), lines);

    const app = createApp(config);

    const resHtml = await app.request('/digest/2026-10-28');
    expect(resHtml.status).toBe(200);
    const html = await resHtml.text();

    const resJson = await app.request('/api/digest/2026-10-28');
    expect(resJson.status).toBe(200);
    const json = (await resJson.json()) as NightDigest;

    // Verify jobs in JSON are sorted alphabetically
    expect(json.rows.map((r) => r.job)).toEqual(['a-job', 'm-job', 'z-job']);

    // Verify HTML page and JSON have the exact same jobs in the exact same order
    const aIdx = html.indexOf('a-job');
    const mIdx = html.indexOf('m-job');
    const zIdx = html.indexOf('z-job');
    expect(aIdx).toBeGreaterThan(-1);
    expect(mIdx).toBeGreaterThan(aIdx);
    expect(zIdx).toBeGreaterThan(mIdx);

    // Verify owner: null rendered as —
    expect(html).toContain('<td>—</td>');

    // Verify retries >= 3 marked with warn and fail marked with warn
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html).toContain('<tr class="warn"><td>a-job</td>');
    expect(html).toContain('<tr class="warn"><td>z-job</td>');
  });

  it('returns 404 for a night with no file on both /digest/:night and /api/digest/:night', async () => {
    const app = createApp(config);

    const resHtml = await app.request('/digest/2026-10-99');
    expect(resHtml.status).toBe(404);
    expect(await resHtml.text()).toBe('not found');

    const resJson = await app.request('/api/digest/2026-10-99');
    expect(resJson.status).toBe(404);
    expect(await resJson.json()).toEqual({ error: 'not found' });
  });

  it('returns 200 with "nothing ran" and rows: [] for empty night', async () => {
    writeFileSync(join(tempDir, '2026-10-28.jsonl'), '');
    const app = createApp(config);

    const resHtml = await app.request('/digest/2026-10-28');
    expect(resHtml.status).toBe(200);
    const html = await resHtml.text();
    expect(html).toContain('nothing ran');

    const resJson = await app.request('/api/digest/2026-10-28');
    expect(resJson.status).toBe(200);
    const json = (await resJson.json()) as NightDigest;
    expect(json.rows).toEqual([]);
    expect(json.badLines).toBe(0);
    expect(json.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
  });

  it('returns 200, counts badLines: 1 in /api/digest/:night, and renders valid rows and "1 bad line" on /digest/:night', async () => {
    const content = [
      'this line is not valid json',
      JSON.stringify({
        at: '2026-10-29T01:00:00+01:00',
        job: 'good-job',
        status: 'ok',
        owner: 'alice',
      }),
    ].join('\n');
    writeFileSync(join(tempDir, '2026-10-28.jsonl'), content);

    const app = createApp(config);

    const resJson = await app.request('/api/digest/2026-10-28');
    expect(resJson.status).toBe(200);
    const json = (await resJson.json()) as NightDigest;
    expect(json.badLines).toBe(1);
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].job).toBe('good-job');

    const resHtml = await app.request('/digest/2026-10-28');
    expect(resHtml.status).toBe(200);
    const html = await resHtml.text();
    expect(html).toContain('1 bad line');
    expect(html).toContain('good-job');
  });

  describe('read-only runs fixtures', () => {
    const fixtureConfig: RigConfig = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir: 'runs',
    };

    it('matches jobs and order between /digest/2026-10-28 and /api/digest/2026-10-28, and / links nights with counts', async () => {
      const app = createApp(fixtureConfig);

      const resHtml = await app.request('/digest/2026-10-28');
      expect(resHtml.status).toBe(200);
      const html = await resHtml.text();

      const resJson = await app.request('/api/digest/2026-10-28');
      expect(resJson.status).toBe(200);
      const json = (await resJson.json()) as NightDigest;

      const expectedJobs = [
        'digest/render',
        'fixtures/refresh',
        'lane/sync',
        'notes/backup',
        'rig/rotate-logs',
      ];

      expect(json.rows.map((r) => r.job)).toEqual(expectedJobs);

      let lastIndex = -1;
      for (const job of expectedJobs) {
        const idx = html.indexOf(job);
        expect(idx).toBeGreaterThan(lastIndex);
        lastIndex = idx;
      }

      // Check / links both nights with their ok / retry / fail counts
      const resIndex = await app.request('/');
      expect(resIndex.status).toBe(200);
      const indexHtml = await resIndex.text();

      expect(indexHtml).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
      expect(indexHtml).toContain('10 ok · 4 retry · 1 fail');

      expect(indexHtml).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
      expect(indexHtml).toContain('7 ok · 0 retry · 0 fail');

      // Both nights on disk link to a digest that renders (status 200)
      const res27 = await app.request('/digest/2026-10-27');
      expect(res27.status).toBe(200);
    });
  });
});
