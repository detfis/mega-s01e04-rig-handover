import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightCounts, NightDigest, RunStatus } from './types.js';

type RunRecord = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isRunStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

function parseRecord(line: string): RunRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.at !== 'string' || obj.at.length === 0) return null;
  if (typeof obj.job !== 'string' || obj.job.length === 0) return null;
  if (!isRunStatus(obj.status)) return null;
  if (obj.owner !== null && typeof obj.owner !== 'string') return null;
  if (obj.error !== undefined && typeof obj.error !== 'string') return null;

  return {
    at: obj.at,
    job: obj.job,
    status: obj.status,
    owner: obj.owner,
    ...(obj.error !== undefined ? { error: obj.error } : {}),
  };
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const byJob = new Map<string, DigestRow>();
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const rec = parseRecord(line);
    if (!rec) {
      badLines += 1;
      continue;
    }

    counts[rec.status] += 1;
    const existing = byJob.get(rec.job);
    if (!existing) {
      byJob.set(rec.job, {
        job: rec.job,
        owner: rec.owner,
        runs: 1,
        retries: rec.status === 'retry' ? 1 : 0,
        lastStatus: rec.status,
        lastError: rec.error && rec.error.length > 0 ? rec.error : null,
        firstAt: rec.at,
        lastAt: rec.at,
      });
    } else {
      existing.owner = rec.owner;
      existing.runs += 1;
      if (rec.status === 'retry') existing.retries += 1;
      existing.lastStatus = rec.status;
      if (rec.error && rec.error.length > 0) {
        existing.lastError = rec.error;
      }
      existing.lastAt = rec.at;
    }
  }

  const rows = Array.from(byJob.values()).sort((a, b) => a.job.localeCompare(b.job));

  return {
    night,
    rows,
    badLines,
    counts,
  };
}
