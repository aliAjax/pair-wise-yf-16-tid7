// 用 esbuild（vite 的依赖）把 TS 测试打包成临时文件后交 node:test 运行
import { build } from "esbuild";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "ski62004-tests-"));
try {
  await build({
    entryPoints: [
      "src/lib/schedule.test.ts",
      "src/lib/store.test.ts",
      "src/lib/actions.test.ts",
    ],
    bundle: true,
    format: "esm",
    platform: "node",
    outdir: dir,
    logLevel: "silent",
  });
  for (const f of ["schedule.test.js", "store.test.js", "actions.test.js"]) {
    await import(pathToFileURL(join(dir, f)).href);
  }
} finally {
  // node:test 是异步收集，推迟清理
  setTimeout(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }, 5000);
  void readdirSync;
}
