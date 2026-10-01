import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { CleanupSnapshot } from './cleanupDecision';

export const HEARTBEAT_MS = 30_000;
const LIVE_WINDOW_MS = 3 * HEARTBEAT_MS;

export interface WindowReport {
  id: string;
  label: string;
  updatedAt: number;
  nextCheckAt: number;
  checkIntervalMs: number;
  closeSupported: boolean;
  snapshot: CleanupSnapshot;
}

type WindowDetails = Omit<WindowReport, 'id' | 'updatedAt'>;

// Each extension host owns a separate file, including duplicate/empty windows.
export class WindowRegistry {
  public readonly id = randomUUID();
  private pending: Promise<void> = Promise.resolve();
  private disposed = false;

  public constructor(
    private readonly directory: string,
    private readonly now: () => number = Date.now,
  ) {}

  public publish(details: WindowDetails): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const report: WindowReport = {
      ...details,
      id: this.id,
      updatedAt: this.now(),
    };
    const destination = path.join(this.directory, `${this.id}.json`);
    const temporary = `${destination}.tmp`;
    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        await mkdir(this.directory, { recursive: true });
        try {
          await writeFile(temporary, JSON.stringify(report), { mode: 0o600 });
          await rename(temporary, destination);
        } finally {
          await rm(temporary, { force: true });
        }
      });
    return this.pending;
  }

  public async list(): Promise<WindowReport[]> {
    await this.pending;
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const reports = await Promise.all(
      files
        .filter((name) => name.endsWith('.json'))
        .map(async (name) => {
          try {
            const report: WindowReport = JSON.parse(
              await readFile(path.join(this.directory, name), 'utf8'),
            );
            if (
              !validReport(report) ||
              this.now() - report.updatedAt > LIVE_WINDOW_MS
            )
              return undefined;
            return report;
          } catch (error) {
            if (
              error instanceof SyntaxError ||
              (error as NodeJS.ErrnoException).code === 'ENOENT'
            )
              return undefined;
            throw error;
          }
        }),
    );
    return reports
      .filter((report): report is WindowReport => report !== undefined)
      .sort((a, b) => a.snapshot.lastActivityAt - b.snapshot.lastActivityAt);
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    await this.pending.catch(() => undefined);
    await rm(path.join(this.directory, `${this.id}.json`), { force: true });
  }
}

function validReport(report: WindowReport): boolean {
  const snapshot = report?.snapshot;
  return (
    typeof report?.id === 'string' &&
    typeof report.label === 'string' &&
    Number.isFinite(report.updatedAt) &&
    Number.isFinite(report.nextCheckAt) &&
    Number.isFinite(report.checkIntervalMs) &&
    report.checkIntervalMs > 0 &&
    typeof report.closeSupported === 'boolean' &&
    !!snapshot &&
    Number.isFinite(snapshot.lastActivityAt) &&
    Number.isFinite(snapshot.idleMs) &&
    Number.isFinite(snapshot.dirtyEditors) &&
    typeof snapshot.enabled === 'boolean' &&
    typeof snapshot.focused === 'boolean' &&
    typeof snapshot.active === 'boolean' &&
    typeof snapshot.protectDirtyEditors === 'boolean' &&
    (snapshot.action === 'close' || snapshot.action === 'notify')
  );
}
