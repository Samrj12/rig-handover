export type RunStatus = 'ok' | 'retry' | 'fail';

// One job across a night. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  fails: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// Log lines per status, across all jobs.
export type StatusCounts = Record<RunStatus, number>;

// `rows` is sorted by job. The page and the JSON both show it as is (ADR 0001).
export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  counts: StatusCounts;
};

// null means no such night: no file, or a value that is not a date. An empty file is a Night
// with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
