import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));

const at = (t: string) => `2026-02-03T${t}+01:00`;
const line = (o: Record<string, unknown>) => JSON.stringify(o);

// Jobs in name order: a/alpha, b/zeta, c/mid.
const NIGHT = [
  line({ at: at('01:00:00'), job: 'b/zeta', owner: null, status: 'ok' }),
  line({ at: at('01:05:00'), job: 'a/alpha', owner: 'ops', status: 'retry', error: 'upstream 503' }),
  'not json',
  line({ at: at('01:10:00'), job: 'a/alpha', owner: 'ops', status: 'retry' }),
  line({ at: at('01:15:00'), job: 'a/alpha', owner: 'ops', status: 'retry' }),
  line({ at: at('01:20:00'), job: 'c/mid', owner: 'ops', status: 'fail', error: 'boom' }),
].join('\n');

const EXPECTED_JOBS = ['a/alpha', 'b/zeta', 'c/mid'];

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

// Text of one job's row: from its name to the next job's name (or the end of the page).
function segment(html: string, job: string): string {
  const start = html.indexOf(job);
  const next = EXPECTED_JOBS.map((j) => html.indexOf(j, start + job.length)).filter((i) => i > start);
  const end = next.length ? Math.min(...next) : html.length;
  return html.slice(start, end);
}

beforeAll(() => {
  writeFileSync(join(runsDir, '2026-02-03.jsonl'), NIGHT);
  writeFileSync(join(runsDir, '2026-02-04.jsonl'), '');
  process.env.LANE_MARKER = 'TEST-MARKER';
});

describe('GET /digest/:night', () => {
  it('answers 200 with HTML for a night on disk', async () => {
    const res = await createApp(config).request('/digest/2026-02-03');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('2026-02-03');
  });

  it('shows the lane banner', async () => {
    const html = await (await createApp(config).request('/digest/2026-02-03')).text();
    expect(html).toContain('TEST-MARKER');
  });

  it('answers 404 for a night with no file', async () => {
    expect((await createApp(config).request('/digest/2026-02-05')).status).toBe(404);
  });

  it('answers 404 for a value that is not a date', async () => {
    expect((await createApp(config).request('/digest/not-a-date')).status).toBe(404);
  });

  it('shows "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request('/digest/2026-02-04');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('shows the bad line count', async () => {
    const html = await (await createApp(config).request('/digest/2026-02-03')).text();
    expect(html).toContain('bad lines: 1');
  });

  it('shows an em dash for a null owner', async () => {
    const html = await (await createApp(config).request('/digest/2026-02-03')).text();
    expect(segment(html, 'b/zeta')).toContain('—');
  });

  it('marks rows with 3 or more retries or a fail as warn', async () => {
    const html = await (await createApp(config).request('/digest/2026-02-03')).text();
    expect(segment(html, 'a/alpha')).toContain('class="warn"');
    expect(segment(html, 'c/mid')).toContain('class="warn"');
    expect(segment(html, 'b/zeta')).not.toContain('class="warn"');
  });

  it('lists jobs in name order', async () => {
    const html = await (await createApp(config).request('/digest/2026-02-03')).text();
    const positions = EXPECTED_JOBS.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with night, rows, badLines and counts', async () => {
    const res = await createApp(config).request('/api/digest/2026-02-03');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      night: '2026-02-03',
      badLines: 1,
      counts: { ok: 1, retry: 3, fail: 1 },
    });
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(EXPECTED_JOBS);
  });

  it('answers 404 for a night with no file', async () => {
    expect((await createApp(config).request('/api/digest/2026-02-05')).status).toBe(404);
  });

  it('answers 404 for a value that is not a date', async () => {
    expect((await createApp(config).request('/api/digest/not-a-date')).status).toBe(404);
  });

  it('returns no rows for an empty night', async () => {
    const body = await (await createApp(config).request('/api/digest/2026-02-04')).json();
    expect(body).toMatchObject({ night: '2026-02-04', rows: [], badLines: 0 });
  });
});

describe('page and JSON agree', () => {
  it('shows the same jobs in the same order as the JSON rows', async () => {
    const app = createApp(config);
    const html = await (await app.request('/digest/2026-02-03')).text();
    const body = await (await app.request('/api/digest/2026-02-03')).json();
    const jobs: string[] = body.rows.map((r: { job: string }) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
