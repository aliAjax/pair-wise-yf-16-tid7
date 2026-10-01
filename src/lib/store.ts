// 分块持久化：
// - 确认后的快照序列化切块写入（localStorage 单 key 容量有限）；
// - 每块成功后推进 journal 游标，写入失败时停在失败块，之后 retry() 从该块继续；
// - 全部块写完才提交 manifest，因此失败期间读到的永远是上次确认状态。

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  listKeys(prefix: string): string[];
}

const PREFIX = "ski62004";
const MANIFEST_KEY = `${PREFIX}:manifest`;
const JOURNAL_KEY = `${PREFIX}:journal`;
const CHUNK_SIZE = 4000;

interface Manifest {
  gen: number;
  total: number;
  version: number;
}

interface Journal {
  gen: number;
  total: number;
  /** staging 写入进度 */
  next: number;
  /** 正式块发布进度 */
  publishNext: number;
  version: number;
}

export type FlushResult =
  | { ok: true }
  | { ok: false; failedChunk: number; total: number; error: string };

/** localStorage 后端；故障注入用于演示“写入失败后续传” */
export function createLocalBackend(opts?: {
  failNextWrites?: number;
}): StorageBackend & {
  failuresLeft: () => number;
  armFailures: (n: number) => void;
} {
  let failuresLeft = opts?.failNextWrites ?? 0;
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error(`存储空间写入失败（注入故障，剩余 ${failuresLeft} 次）`);
      }
      window.localStorage.setItem(k, v);
    },
    removeItem: (k) => window.localStorage.removeItem(k),
    listKeys: (prefix) => {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      return keys;
    },
    failuresLeft: () => failuresLeft,
    armFailures: (n: number) => {
      failuresLeft = n;
    },
  };
}

function chunkKey(gen: number, i: number) {
  return `${PREFIX}:g:${gen}:${i}`;
}

/** 写入中的块落在 staging 命名，避免半成品覆盖上次确认版本 */
function stagingKey(gen: number, i: number) {
  return `${PREFIX}:staging:${gen}:${i}`;
}

export class ChunkedStore<T> {
  private pending:
    | {
        gen: number;
        chunks: string[];
        next: number;
        publishNext: number;
        total: number;
        version: number;
      }
    | null = null;

  constructor(private backend: StorageBackend) {}

  hasPending(): boolean {
    return this.pending !== null;
  }

  /** 读取上次确认状态；manifest 缺失或损坏时返回 null */
  load(): { state: T; version: number } | null {
    const raw = this.backend.getItem(MANIFEST_KEY);
    if (!raw) return null;
    try {
      const m = JSON.parse(raw) as Manifest;
      const parts: string[] = [];
      for (let i = 0; i < m.total; i += 1) {
        const c = this.backend.getItem(chunkKey(m.gen, i));
        if (c == null) return null;
        parts.push(c);
      }
      return { state: JSON.parse(parts.join("")) as T, version: m.version };
    } catch {
      return null;
    }
  }

  /** 写入一份新快照；失败后可调用 retry() 从失败块继续 */
  save(state: T, version: number): FlushResult {
    // 新的确认版本：清掉上一次（无论成功还是被放弃）的续传游标
    if (!this.pending || this.pending.version !== version) {
      const json = JSON.stringify(state);
      const chunks: string[] = [];
      for (let i = 0; i < json.length; i += CHUNK_SIZE) {
        chunks.push(json.slice(i, i + CHUNK_SIZE));
      }
      const gen = Date.now() + Math.floor(Math.random() * 1000);
      this.pending = {
        gen,
        chunks,
        next: 0,
        publishNext: 0,
        total: chunks.length,
        version,
      };
    }
    return this.run();
  }

  /** 从上次失败的块继续重试 */
  retry(): FlushResult {
    if (!this.pending) return { ok: true };
    return this.run();
  }

  /** 撤销：丢弃尚未确认成功的写入游标、staging 块与未发布的正式块 */
  abortPending() {
    if (this.pending) {
      for (let i = 0; i < this.pending.total; i += 1) {
        this.backend.removeItem(stagingKey(this.pending.gen, i));
        // manifest 未切换，这些正式块不会被读到，直接清理避免残留
        this.backend.removeItem(chunkKey(this.pending.gen, i));
      }
      this.backend.removeItem(JOURNAL_KEY);
      this.pending = null;
    }
  }

  /** 清空所有已确认数据（重置演示用） */
  reset() {
    this.abortPending();
    this.backend.removeItem(MANIFEST_KEY);
    for (const k of this.backend.listKeys(`${PREFIX}:`)) {
      this.backend.removeItem(k);
    }
  }

  private fail(i: number, phase: string, e: unknown): FlushResult {
    this.writeJournal({
      gen: this.pending!.gen,
      total: this.pending!.total,
      next: this.pending!.next,
      publishNext: this.pending!.publishNext,
      version: this.pending!.version,
    });
    return {
      ok: false,
      failedChunk: i + 1,
      total: this.pending!.total,
      error: e instanceof Error ? `${phase}：${e.message}` : String(e),
    };
  }

  private run(): FlushResult {
    const p = this.pending!;

    // 阶段 1：staging 块逐个写入（从失败块继续）
    while (p.next < p.total) {
      const i = p.next;
      try {
        this.backend.setItem(stagingKey(p.gen, i), p.chunks[i]);
      } catch (e) {
        return this.fail(i, "暂存块写入失败", e);
      }
      p.next = i + 1;
      this.writeJournal({
        gen: p.gen,
        total: p.total,
        next: p.next,
        publishNext: p.publishNext,
        version: p.version,
      });
    }

    // 阶段 2：把 staging 发布到正式位置（上次确认版本只在 manifest 切换后才受影响）
    while (p.publishNext < p.total) {
      const i = p.publishNext;
      const v = this.backend.getItem(stagingKey(p.gen, i));
      if (v == null) return this.fail(i, "暂存块缺失", new Error("staging missing"));
      try {
        this.backend.setItem(chunkKey(p.gen, i), v);
      } catch (e) {
        return this.fail(i, "正式块发布失败", e);
      }
      p.publishNext = i + 1;
      this.writeJournal({
        gen: p.gen,
        total: p.total,
        next: p.next,
        publishNext: p.publishNext,
        version: p.version,
      });
    }

    // 阶段 3：提交 manifest；失败不影响读侧（可继续重试）
    const previous = this.readManifest();
    try {
      const manifest: Manifest = { gen: p.gen, total: p.total, version: p.version };
      this.backend.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    } catch (e) {
      return this.fail(p.total - 1, "manifest 提交失败", e);
    }

    // 清理旧版本块与本次 staging
    if (previous && previous.gen !== p.gen) {
      for (let i = 0; i < previous.total; i += 1) {
        this.backend.removeItem(chunkKey(previous.gen, i));
      }
    }
    for (let i = 0; i < p.total; i += 1) {
      this.backend.removeItem(stagingKey(p.gen, i));
    }
    this.backend.removeItem(JOURNAL_KEY);
    this.pending = null;
    return { ok: true };
  }

  private writeJournal(j: Journal) {
    try {
      this.backend.setItem(JOURNAL_KEY, JSON.stringify(j));
    } catch {
      // journal 写失败不影响：pending 进度保留在内存中，仍可续传
    }
  }

  private readManifest(): Manifest | null {
    const raw = this.backend.getItem(MANIFEST_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Manifest;
    } catch {
      return null;
    }
  }
}
