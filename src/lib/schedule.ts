// 可重排维护排程引擎（纯函数，无副作用，便于单测）
//
// 规则：
// 1. 底板修补同一时间只占一个工位（容量 1），修边、打蜡各 2 个工位可并行；
// 2. 同一工单按 底板修补 → 修边 → 打蜡 串行，无底板损伤则跳过修补；
// 3. 已开始 / 已承诺 / 已完工工单的工序时段为锁定块，重排时保留原时段；
// 4. 工位容量不足时按原承诺排队：排序键 = 加急优先 → 原承诺时间 → 进队顺序；
// 5. 加急单插入后，其后的未锁定工单全部重算完工时间。

import type {
  MaintenanceOrder,
  OpKind,
  ResourceKind,
  Schedule,
  ScheduledOp,
} from "./types";

/** 各工序默认时长（分钟） */
export const DEFAULT_DURATION: Record<OpKind, number> = {
  base: 90,
  edge: 40,
  wax: 30,
};

/** 工位容量：底板修补专用工位只有 1 个，打蜡/修边可并行 */
export const CAPACITY: Record<ResourceKind, number> = {
  base: 1,
  edge: 2,
  wax: 2,
};

/** 工序顺序（修补在修边、打蜡之前） */
const OP_FLOW: OpKind[] = ["base", "edge", "wax"];

export function opsOf(order: MaintenanceOrder): OpKind[] {
  return OP_FLOW.filter((kind) =>
    kind === "base" ? order.needsBaseRepair : true
  );
}

export function durationOf(order: MaintenanceOrder, kind: OpKind): number {
  return order.durationMin[kind] ?? DEFAULT_DURATION[kind];
}

export interface RescheduleInput {
  orders: MaintenanceOrder[];
  /** 未完工工单队列顺序（id） */
  queue: string[];
  /** 已锁定的工序时段（进行中 / 已承诺 / 已完工） */
  lockedOps: ScheduledOp[];
  /** 工作台当前时间（分钟）：未开工工单不得早于此时间 */
  nowMin?: number;
  version: number;
}

interface Lane {
  kind: ResourceKind;
  index: number;
  /** 该工位上已占用的时间段（锁定块 + 本次排入的块），按开始时间排序 */
  blocks: Array<{ start: number; end: number; orderId: string }>;
}

/** 在某工位上找最早可容纳 dur 的空档，且不早于 earliest */
function earliestSlot(lane: Lane, earliest: number, dur: number) {
  let cursor = earliest;
  for (const b of lane.blocks) {
    if (b.end <= cursor) continue; // 已在游标之前
    if (b.start >= cursor + dur) break; // 当前空档放得下
    cursor = Math.max(cursor, b.end); // 被占用，顺延到块尾
  }
  return cursor;
}

function sortPriority(
  a: MaintenanceOrder,
  b: MaintenanceOrder,
  indexOf: (id: string) => number
): number {
  if (a.rush !== b.rush) return a.rush ? -1 : 1;
  const pa = a.originalPromiseMin ?? Infinity;
  const pb = b.originalPromiseMin ?? Infinity;
  if (pa !== pb) return pa - pb;
  // 最终按队列中的先后（加急单在插入时已置于队首）
  return indexOf(a.id) - indexOf(b.id);
}

/**
 * 重算排程。
 * - 锁定工单：直接采用锁定块，完工时间取原时段；
 * - 其余工单：按优先级贪心分配到每个资源的最早可用工位（多工位时挑空档最早的）。
 */
export function reschedule(input: RescheduleInput): Schedule {
  const { lockedOps, version } = input;
  const byId = new Map(input.orders.map((o) => [o.id, o]));

  const lanes = new Map<ResourceKind, Lane[]>();
  for (const kind of ["base", "edge", "wax"] as ResourceKind[]) {
    lanes.set(
      kind,
      Array.from({ length: CAPACITY[kind] }, (_, index) => ({
        kind,
        index,
        blocks: [],
      }))
    );
  }

  const ops: ScheduledOp[] = [];

  // 先把锁定块铺到工位上（同 resource/lane 已固定）
  for (const op of lockedOps) {
    const lane = lanes.get(op.resource)![op.lane];
    lane.blocks.push({ start: op.start, end: op.end, orderId: op.orderId });
    ops.push({ ...op, locked: true });
  }
  for (const list of lanes.values()) {
    for (const lane of list) lane.blocks.sort((a, b) => a.start - b.start);
  }

  const lockedOrderIds = new Set(lockedOps.map((o) => o.orderId));
  const finish: Record<string, number> = {};

  // 锁定工单完工时间以其锁定块为准
  for (const id of lockedOrderIds) {
    const ends = lockedOps.filter((o) => o.orderId === id).map((o) => o.end);
    finish[id] = Math.max(...ends);
  }

  // 未锁定工单：加急优先 → 原承诺 → 队列位置
  const indexOf = (id: string) => input.queue.indexOf(id);
  const pending = input.queue
    .map((id) => byId.get(id))
    .filter((o): o is MaintenanceOrder => !!o && !lockedOrderIds.has(o.id))
    .sort((a, b) => sortPriority(a, b, indexOf));

  for (const order of pending) {
    // 未开工工单不能被排进过去：以受理时间与当前时间的较大者为下界
    let readyAt = Math.max(order.createdAtMin, input.nowMin ?? 0);
    for (const kind of opsOf(order)) {
      const dur = durationOf(order, kind);
      const resourceLanes = lanes.get(kind)!;
      // 容量 >1 时选最早空档的工位；容量为 1（底板修补）时即唯一专用工位
      let best: { lane: Lane; start: number } | null = null;
      for (const lane of resourceLanes) {
        const start = earliestSlot(lane, readyAt, dur);
        if (!best || start < best.start) best = { lane, start };
      }
      const lane = best!.lane;
      const start = best!.start;
      const end = start + dur;
      lane.blocks.push({ start, end, orderId: order.id });
      lane.blocks.sort((a, b) => a.start - b.start);
      ops.push({
        orderId: order.id,
        kind,
        start,
        end,
        resource: kind,
        lane: lane.index,
        locked: false,
      });
      readyAt = end;
    }
    finish[order.id] = readyAt;
  }

  ops.sort((a, b) => a.start - b.start || a.end - b.end);
  return { ops, finish, version };
}

/** 取工单在某版排程中的各道工序（按工序流顺序） */
export function opsOfOrder(schedule: Schedule, orderId: string): ScheduledOp[] {
  const order: Record<OpKind, ScheduledOp> = {} as Record<OpKind, ScheduledOp>;
  for (const op of schedule.ops) {
    if (op.orderId === orderId) order[op.kind] = op;
  }
  return OP_FLOW.map((k) => order[k]).filter(Boolean);
}

/** 判断在 now 时刻工单的实际状态（已完工 / 进行中 / 排队中，承诺为单独标记） */
export function liveStatus(
  order: MaintenanceOrder,
  schedule: Schedule,
  now: number
): "completed" | "started" | "queued" {
  const ops = opsOfOrder(schedule, order.id);
  if (!ops.length) return "queued";
  const started = ops.some((o) => o.start <= now);
  const done = ops.every((o) => o.end <= now);
  if (done) return "completed";
  return started ? "started" : "queued";
}

/** 插入加急单：放在所有未锁定普通单之前（同类之间仍按承诺/顺序） */
export function insertRush(queue: string[], rushId: string): string[] {
  const rest = queue.filter((id) => id !== rushId);
  return [rushId, ...rest];
}
