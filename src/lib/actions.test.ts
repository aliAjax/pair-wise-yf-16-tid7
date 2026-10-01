// 动作层单测：确认承诺锁定、时间推进自动开工/完工、加急为草稿编辑
import test from "node:test";
import assert from "node:assert/strict";
import {
  addOrder,
  advanceTime,
  commitOrders,
  recompute,
  toggleRush,
} from "./actions";
import { createSeedState } from "./seed";

function findOp(
  sch: ReturnType<typeof recompute>,
  id: string,
  kind: "base" | "edge" | "wax"
) {
  const op = sch.ops.find((o) => o.orderId === id && o.kind === kind);
  if (!op) throw new assert.AssertionError({ message: `missing ${id}/${kind}` });
  return op;
}

test("确认排程：所选工单锁定当前时段并退出可重排队列", () => {
  const s0 = createSeedState();
  const sch0 = recompute(s0);
  const finish118 = sch0.finish["ORD-118"];
  const priorPromise118 = s0.orders.find((o) => o.id === "ORD-118")!
    .originalPromiseMin;

  const report = commitOrders(s0, ["ORD-118"], sch0);
  assert.equal(report.state.version, s0.version + 1);
  assert.ok(!report.state.queue.includes("ORD-118"));
  const o118 = report.state.orders.find((o) => o.id === "ORD-118")!;
  assert.equal(o118.promised, true);
  // 已给过原承诺时间：确认排程保留原承诺，不被排程结果改写
  assert.equal(o118.originalPromiseMin, priorPromise118);

  // 再次重算：ORD-118 自己的时段必须与确认时一致（锁定），不被其他单影响
  const sch1 = recompute(report.state);
  const lockedEdges = report.state.lockedOps.filter(
    (op) => op.orderId === "ORD-118"
  );
  assert.equal(lockedEdges.length, 2); // 修边 + 打蜡
  assert.equal(sch1.finish["ORD-118"], finish118);
  // 锁定块都处于当前时间之后（未开工才允许承诺锁定）
  assert.ok(lockedEdges.every((op) => op.start >= s0.now));

  // 没有原承诺的新单：确认时把本次完工时间作为承诺
  const s2 = createSeedState();
  const noPromise = s2.orders.map((o) =>
    o.id === "ORD-124" ? { ...o, originalPromiseMin: null } : o
  );
  const s2b = { ...s2, orders: noPromise };
  const sch2 = recompute(s2b);
  const finish124 = sch2.finish["ORD-124"];
  const r2 = commitOrders(s2b, ["ORD-124"], sch2);
  assert.equal(
    r2.state.orders.find((o) => o.id === "ORD-124")!.originalPromiseMin,
    finish124
  );
});

test("加急插入是草稿编辑：不改版本，确认后才升版本", () => {
  const s0 = createSeedState();
  const s1 = toggleRush(s0, "ORD-121");
  assert.equal(s1.version, s0.version); // 草稿不升版本
  assert.deepEqual(s1.queue[0], "ORD-121"); // 插到队首
  assert.equal(s1.orders.find((o) => o.id === "ORD-121")!.rush, true);

  const sch = recompute(s1);
  const report = commitOrders(s1, ["ORD-121"], sch);
  assert.equal(report.state.version, s0.version + 1);
});

test("推进时间：跨过开工点锁定为进行中，跨过完工点出队完工", () => {
  const s0 = createSeedState(); // now=09:00
  const sch0 = recompute(s0);

  // ORD-121 的底板修补排在 09:30–11:10；推进 45 分钟到 09:45 → 已开工
  const r1 = advanceTime(s0, 45, sch0);
  assert.ok(r1.started.includes("ORD-121"));
  assert.ok(!r1.finished.includes("ORD-121"));
  assert.ok(!r1.state.queue.includes("ORD-121")); // 已开工退出可重排队列
  const sch1 = recompute(r1.state);
  // 开工锁定的底板时段仍是 09:30–11:10，未因重排移动
  const base121 = findOp(sch1, "ORD-121", "base");
  assert.equal(base121.start, 9 * 60 + 30);
  assert.equal(base121.locked, true);

  // 再推进到全部结束：ORD-118 等已完工
  const r2 = advanceTime(r1.state, 600, sch1);
  assert.ok(r2.finished.length > 0);
});

test("新增普通单入队尾、加急单入队首", () => {
  const s0 = createSeedState();
  const s1 = addOrder(s0, {
    customer: "测试",
    brand: "Test 150",
    lengthCm: 150,
    boardType: "公园板",
    sideAngle: 88,
    baseAngle: 1,
    waxType: "温蜡",
    needsBaseRepair: false,
    damageDesc: "无",
    repairSpots: [],
    preference: "",
    rush: false,
    originalPromiseMin: 18 * 60,
  });
  assert.equal(s1.queue[s1.queue.length - 1], s1.orders.at(-1)!.id);

  const s2 = addOrder(s1, {
    customer: "急客",
    brand: "Rush 160",
    lengthCm: 160,
    boardType: "竞速板",
    sideAngle: 87,
    baseAngle: 0,
    waxType: "含氟蜡",
    needsBaseRepair: true,
    damageDesc: "待检",
    repairSpots: ["板头"],
    preference: "",
    rush: true,
    originalPromiseMin: 12 * 60,
  });
  assert.equal(s2.queue[0], s2.orders.at(-1)!.id);
});
