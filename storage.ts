import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../lib/logger.js';

const DATA_DIR = path.join(process.cwd(), 'aztron-data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class JsonStore<T extends object> {
  private data: T;
  private filePath: string;
  private dirty = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(name: string, defaults: T) {
    this.filePath = path.join(DATA_DIR, `${name}.json`);
    this.data = this.load(defaults);
    // Flush to disk every 5 seconds if dirty
    this.flushTimer = setInterval(() => {
      if (this.dirty) this.flush();
    }, 5000);
  }

  private load(defaults: T): T {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return { ...defaults };
    }
  }

  flush(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
      this.dirty = false;
    } catch (err) {
      logger.error({ err }, 'Failed to flush storage');
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value;
    this.dirty = true;
  }

  getAll(): T {
    return this.data;
  }

  patch<K extends keyof T>(key: K, value: Partial<T[K]>): void {
    this.data[key] = { ...(this.data[key] as object), ...(value as object) } as T[K];
    this.dirty = true;
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}
