// 排程引擎单测：node:test，经 esbuild 打包后运行（npm test）
import test from "node:test";
import assert from "node:assert/strict";
import { reschedule, opsOf, CAPACITY } from "./schedule";
import type { MaintenanceOrder, ScheduledOp, StoreState } from "./types";

const DAY = 8 * 60;

function order(p: Partial<MaintenanceOrder> & { id: string; seq: number }): MaintenanceOrder {
  return {
    customer: "t",
    brand: "B",
    lengthCm: 156,
    boardType: "全地域",
    sideAngle: 88,
    baseAngle: 1,
    waxType: "低温蜡",
    needsBaseRepair: false,
    damageDesc: "",
    repairSpots: [],
    preference: "",
    durationMin: {},
    rush: false,
    promised: false,
    createdAtMin: DAY,
    originalPromiseMin: null,
    ...p,
  };
}

function find(ops: ScheduledOp[], id: string, kind: ScheduledOp["kind"]) {
  return ops.find((o) => o.orderId === id && o.kind === kind)!;
}

test("打蜡与修边在容量内并行，底板修补单工位串行", () => {
  const orders = [
    order({ id: "A", seq: 1 }),
    order({ id: "C", seq: 2 }),
    order({ id: "B", seq: 3, needsBaseRepair: true }),
  ];
  const s = reschedule({
    orders,
    queue: ["A", "C", "B"],
    lockedOps: [],
    version: 1,
  });
  const aEdge = find(s.ops, "A", "edge");
  const cEdge = find(s.ops, "C", "edge");
  const bBase = find(s.ops, "B", "base");
  const bEdge = find(s.ops, "B", "edge");
  assert.equal(CAPACITY.base, 1);
  assert.equal(CAPACITY.edge, 2);
  // A、C 同时开工但落在两个修边工位（并行）
  assert.equal(aEdge.start, DAY);
  assert.equal(cEdge.start, DAY);
  assert.notEqual(aEdge.lane, cEdge.lane);
  // B 的底板修补 90 分钟，修边必须在修补完成之后
  assert.equal(bBase.start, DAY);
  assert.equal(bEdge.start, DAY + 90);
});

test("第二张底板修补单必须等唯一专用工位空出", () => {
  const orders = [
    order({ id: "B1", seq: 1, needsBaseRepair: true, durationMin: { base: 60 } }),
    order({ id: "B2", seq: 2, needsBaseRepair: true, durationMin: { base: 60 } }),
  ];
  const s = reschedule({ orders, queue: ["B1", "B2"], lockedOps: [], version: 1 });
  const b1 = find(s.ops, "B1", "base");
  const b2 = find(s.ops, "B2", "base");
  assert.equal(b1.start, DAY);
  assert.equal(b1.end, DAY + 60);
  assert.equal(b2.start, DAY + 60);
  assert.equal(b2.lane, 0);
});

test("已开始/已承诺工单的时段锁定，重排不移动", () => {
  const locked: ScheduledOp[] = [
    { orderId: "L", kind: "edge", start: 480, end: 540, resource: "edge", lane: 0, locked: true },
  ];
  const orders = [order({ id: "L", seq: 1, promised: true }), order({ id: "Q", seq: 2 })];
  const s = reschedule({ orders, queue: ["Q"], lockedOps: locked, version: 1 });
  const lEdge = find(s.ops, "L", "edge");
  assert.equal(lEdge.start, 480);
  assert.equal(lEdge.locked, true);
  // Q 不能在 edge-0 工位的 480–540 落块，应落到另一工位 08:00 起
  const qEdge = find(s.ops, "Q", "edge");
  assert.equal(qEdge.lane, 1);
  assert.equal(qEdge.start, DAY);
});

test("加急单插入后抢占底板专用工位并重算后续完工时间", () => {
  const baseOverrides = {
    needsBaseRepair: true,
    durationMin: { base: 90, edge: 40, wax: 30 },
  };
  const orders = [
    order({ id: "N1", seq: 1, originalPromiseMin: 600 }),
    order({ id: "B2", seq: 2, ...baseOverrides, originalPromiseMin: 700 }),
    order({ id: "R", seq: 3, ...baseOverrides }),
  ];
  // 插入前：R 是普通单排在最后，B2 先占底板工位 08:00 起
  const s1 = reschedule({
    orders,
    queue: ["N1", "B2", "R"],
    lockedOps: [],
    version: 1,
  });
  assert.equal(find(s1.ops, "B2", "base").start, DAY);
  assert.equal(find(s1.ops, "R", "base").start, DAY + 90);

  // 加急插入：R 置为 rush 并移到队首
  const rushed = orders.map((o) => (o.id === "R" ? { ...o, rush: true } : o));
  const s2 = reschedule({
    orders: rushed,
    queue: ["R", "N1", "B2"],
    lockedOps: [],
    version: 2,
  });
  assert.equal(find(s2.ops, "R", "base").start, DAY); // 加急单抢到专用工位
  const b2Base = find(s2.ops, "B2", "base");
  assert.equal(b2Base.start, DAY + 90); // 后续底板单被顺延，完工时间重算
  assert.ok(s2.finish["B2"] > s1.finish["B2"]);
  assert.equal(s2.version, 2);
});

test("容量不足按原承诺时间排队（承诺早的先排）", () => {
  const orders = [
    order({ id: "LATE", seq: 1, originalPromiseMin: 1100 }),
    order({ id: "EARLY", seq: 2, originalPromiseMin: 540 }),
    order({ id: "MID", seq: 3, originalPromiseMin: 700 }),
  ];
  const s = reschedule({
    orders,
    queue: ["LATE", "EARLY", "MID"],
    lockedOps: [],
    version: 1,
  });
  // 修边工位只有 2 个，3 张单抢位：承诺最早的 EARLY、MID 并行先排，LATE 顺延
  assert.equal(find(s.ops, "EARLY", "edge").start, DAY);
  assert.equal(find(s.ops, "MID", "edge").start, DAY);
  assert.equal(find(s.ops, "LATE", "edge").start, DAY + 40);
});

test("同一单修补→修边→打蜡严格串行", () => {
  const o = order({ id: "X", seq: 1, needsBaseRepair: true });
  const s = reschedule({ orders: [o], queue: ["X"], lockedOps: [], version: 1 });
  assert.deepEqual(
    opsOf(o).map((k) => k),
    ["base", "edge", "wax"]
  );
  const base = find(s.ops, "X", "base");
  const edge = find(s.ops, "X", "edge");
  const wax = find(s.ops, "X", "wax");
  assert.ok(base.end <= edge.start);
  assert.ok(edge.end <= wax.start);
});

export type _Used = StoreState;
