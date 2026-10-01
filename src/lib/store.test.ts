// 持久化单测：分块写入失败后，从失败块继续重试；失败期间读到上次确认状态
import test from "node:test";
import assert from "node:assert/strict";
import { ChunkedStore, type StorageBackend } from "./store";

class MemBackend implements StorageBackend {
  map = new Map<string, string>();
  /** arm 后第 offset 次 setItem 失败（offset 从下次调用起算） */
  private armAt = 0;
  private calls = 0;

  arm(offset: number) {
    this.armAt = offset;
    this.calls = 0;
  }

  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.calls += 1;
    if (this.armAt === this.calls) {
      throw new Error(`第 ${this.calls} 次写入注入失败`);
    }
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  listKeys(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

test("写入失败停在失败块，重试从该块继续，最终读到新状态", () => {
  const backend = new MemBackend();
  const store = new ChunkedStore<{ items: string[] }>(backend);

  const big = (tag: string) => ({
    items: Array.from({ length: 400 }, (_, i) => `${tag}-${i}-padding-padding-padding`),
  });

  const r1 = store.save(big("v1"), 1);
  assert.equal(r1.ok, true);
  assert.equal(store.load()!.state.items[0], "v1-0-padding-padding-padding");

  // 新一次写入：第 2 个 staging 块失败
  // （调用序列：块0成功 → journal 成功 → 块1失败）
  backend.arm(3);
  const r2 = store.save(big("v999"), 2);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.failedChunk, 2);

  // 失败期间读到的仍是上次确认状态
  assert.equal(store.load()!.version, 1);
  assert.equal(store.load()!.state.items[0], "v1-0-padding-padding-padding");

  const r3 = store.retry();
  assert.equal(r3.ok, true);
  assert.equal(store.load()!.version, 2);
  assert.equal(store.load()!.state.items[0], "v999-0-padding-padding-padding");
  assert.equal(store.hasPending(), false);

  // 发布阶段（正式块写入）失败也应能续传
  const publishFirst = 4 + 4 + 1; // staging 4 块 + 4 次 journal 后，发布第 1 块是第 9 次
  backend.arm(publishFirst); // 发布第 1 块时失败
  const r4 = store.save(big("vnext"), 3);
  assert.equal(r4.ok, false);
  assert.equal(store.load()!.version, 2); // manifest 未切换
  const r5 = store.retry();
  assert.equal(r5.ok, true);
  assert.equal(store.load()!.version, 3);
  assert.equal(store.load()!.state.items[0], "vnext-0-padding-padding-padding");
});

test("大状态被切成多块写入且可完整读回", () => {
  const backend = new MemBackend();
  const store = new ChunkedStore<{ items: string[] }>(backend);
  const items = Array.from({ length: 600 }, (_, i) => `chunk-line-${i}-padding-padding`);
  const r = store.save({ items }, 1);
  assert.equal(r.ok, true);
  const chunkKeys = backend.listKeys("ski62004:g:").filter((k) => !k.endsWith("journal"));
  assert.ok(chunkKeys.length > 1, "应切成多块");
  assert.deepEqual(store.load()!.state.items.length, 600);
});
