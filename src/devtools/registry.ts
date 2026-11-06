import type { HydrationReport } from '../runtime/domain/report';

/** A report as kept by the dev server. */
export interface StoredReport extends HydrationReport {
  /** Increases by one per accepted report and never repeats; pollers ask for `seq > n`. */
  readonly seq: number;
  /** Epoch milliseconds at which the server received it. */
  readonly receivedAt: number;
}

export interface ReportRegistry {
  add(report: HydrationReport): StoredReport;
  /** Reports with `seq` greater than `seq`, oldest first. */
  since(seq: number): readonly StoredReport[];
  /** The highest `seq` handed out so far (0 before the first report). */
  latest(): number;
  /** Incremented by `clear`, so a poller can tell that its copy is stale. */
  generation(): number;
  clear(): void;
}

/**
 * In-memory history of what the browser reported, bounded so a page that mismatches in a loop
 * cannot grow the dev server's memory without limit. It lives in the Nuxt process, so it survives
 * Nitro reloads and page reloads, which is what makes it a history of the session.
 */
export function createReportRegistry(limit: number, now: () => number): ReportRegistry {
  let reports: readonly StoredReport[] = [];
  let seq = 0;
  let generation = 0;

  return {
    add(report) {
      seq += 1;
      const stored: StoredReport = { ...report, seq, receivedAt: now() };
      reports = [...reports, stored].slice(-limit);
      return stored;
    },
    since(after) {
      return reports.filter((report) => report.seq > after);
    },
    latest() {
      return seq;
    },
    generation() {
      return generation;
    },
    clear() {
      reports = [];
      generation += 1;
    },
  };
}
