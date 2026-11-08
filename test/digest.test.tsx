import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

describe('digest routes', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
    process.env.LANE_MARKER = 'TEST-MARKER';
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeConfig(runsDir = tempDir) {
    return {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };
  }

  it('returns 404 for a night with no file on both HTML and JSON routes', async () => {
    const app = createApp(makeConfig());
    const htmlRes = await app.request('/digest/2026-10-99');
    expect(htmlRes.status).toBe(404);

    const jsonRes = await app.request('/api/digest/2026-10-99');
    expect(jsonRes.status).toBe(404);
  });

  it('renders "nothing ran" and empty rows for an empty night', async () => {
    writeFileSync(join(tempDir, '2026-10-25.jsonl'), '', 'utf8');
    const app = createApp(makeConfig());

    const htmlRes = await app.request('/digest/2026-10-25');
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain('nothing ran');

    const jsonRes = await app.request('/api/digest/2026-10-25');
    expect(jsonRes.status).toBe(200);
    const body = (await jsonRes.json()) as NightDigest;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts a bad line without throwing and renders valid rows on both HTML and JSON', async () => {
    const lines = [
      JSON.stringify({ at: '2026-10-26T01:00:00+01:00', job: 'beta/task', status: 'fail', owner: 'lane-07', error: 'disk full' }),
      '{"at":"2026-10-26T02:00:00+01:00","job":"broken',
      JSON.stringify({ at: '2026-10-26T03:00:00+01:00', job: 'alpha/task', status: 'retry', owner: null, error: 'timeout' }),
      JSON.stringify({ at: '2026-10-26T03:01:00+01:00', job: 'alpha/task', status: 'retry', owner: null, error: 'timeout' }),
      JSON.stringify({ at: '2026-10-26T03:02:00+01:00', job: 'alpha/task', status: 'retry', owner: null, error: 'timeout' }),
      JSON.stringify({ at: '2026-10-26T03:03:00+01:00', job: 'alpha/task', status: 'ok', owner: null }),
    ].join('\n');
    writeFileSync(join(tempDir, '2026-10-26.jsonl'), lines, 'utf8');

    const app = createApp(makeConfig());
    const htmlRes = await app.request('/digest/2026-10-26');
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain('1 bad line');
    expect(html).toContain('alpha/task');
    expect(html).toContain('beta/task');
    expect(html).toContain('—');
    expect(html.indexOf('alpha/task')).toBeLessThan(html.indexOf('beta/task'));

    const jsonRes = await app.request('/api/digest/2026-10-26');
    expect(jsonRes.status).toBe(200);
    const body = (await jsonRes.json()) as NightDigest;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/task', 'beta/task']);
  });

  it('serves 2026-10-28 with the same jobs in the same order on HTML and JSON, and links both nights from the board', async () => {
    const app = createApp(makeConfig('runs'));

    const htmlRes = await app.request('/digest/2026-10-28');
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();

    const jsonRes = await app.request('/api/digest/2026-10-28');
    expect(jsonRes.status).toBe(200);
    const body = (await jsonRes.json()) as NightDigest;

    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    let lastPos = -1;
    for (const job of jobs) {
      const pos = html.indexOf(`<td>${job}</td>`);
      expect(pos).toBeGreaterThan(lastPos);
      lastPos = pos;
    }

    const boardRes = await app.request('/');
    expect(boardRes.status).toBe(200);
    const boardHtml = await boardRes.text();
    expect(boardHtml).toContain('href="/digest/2026-10-28"');
    expect(boardHtml).toContain('10 ok · 4 retry · 1 fail');
    expect(boardHtml).toContain('href="/digest/2026-10-27"');
    expect(boardHtml).toContain('7 ok · 0 retry · 0 fail');

    const prevNightRes = await app.request('/digest/2026-10-27');
    expect(prevNightRes.status).toBe(200);
  });
});
