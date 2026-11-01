import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function tempNight(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-01-01.jsonl'), text);
  return dir;
}

describe('readNight on the real night', () => {
  const night = readNight('runs', '2026-10-28')!;

  it('finds 5 jobs and 1 bad line', () => {
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries and keeps the last error', () => {
    const row = night.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(row).toMatchObject({ runs: 4, retries: 3, fails: 0, lastStatus: 'ok', lastError: 'upstream 503' });
  });

  it('keeps a job with a null owner', () => {
    expect(night.rows.find((r) => r.job === 'digest/render')!.owner).toBeNull();
  });

  it('keeps the offset from the log', () => {
    const row = night.rows.find((r) => r.job === 'rig/rotate-logs')!;
    expect(row.firstAt).toBe('2026-10-28T23:00:02+01:00');
  });

  it('counts log lines per status', () => {
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight(tempNight(''), '2026-01-02')).toBeNull();
  });

  it('returns null for a value that is not a date', () => {
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('returns an empty night for an empty file', () => {
    expect(readNight(tempNight(''), '2026-01-01')).toMatchObject({ rows: [], badLines: 0 });
  });

  it('counts valid JSON of the wrong shape as a bad line', () => {
    const night = readNight(tempNight('{"job":"a"}\n42\n'), '2026-01-01')!;
    expect(night).toMatchObject({ rows: [], badLines: 2 });
  });

  it('reads lines that end in CRLF', () => {
    const line = '{"at":"t","job":"a","status":"ok","owner":null}';
    expect(readNight(tempNight(`${line}\r\n${line}\r\n`), '2026-01-01')!.rows[0]!.runs).toBe(2);
  });
});
