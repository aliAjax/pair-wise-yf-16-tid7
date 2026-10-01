// 排程动作（纯函数）：在 StoreState 上产生下一版状态

import { insertRush, reschedule, type RescheduleInput } from "./schedule";
import type {
  MaintenanceOrder,
  NewOrderInput,
  Schedule,
  ScheduledOp,
  StoreState,
} from "./types";
import { createOrder } from "./seed";

export interface ActionReport {
  state: StoreState;
  /** 本次变为已承诺（锁定）的工单 */
  locked: string[];
  /** 本次变为已开工的工单 */
  started: string[];
  /** 本次变为已完工的工单 */
  finished: string[];
}

function withLockedOps(
  state: StoreState,
  ids: string[],
  schedule: Schedule
): { lockedOps: ScheduledOp[]; locked: string[] } {
  const picked = new Set(ids);
  const extra = schedule.ops.filter(
    (op) => picked.has(op.orderId) && !op.locked
  );
  return {
    lockedOps: [...state.lockedOps, ...extra.map((op) => ({ ...op, locked: true }))],
    locked: ids,
  };
}

function bump(state: StoreState, patch: Partial<StoreState>): StoreState {
  return { ...state, ...patch, version: state.version + 1 };
}

/** 草稿编辑不升版本（只有确认写入成功才升） */
function edit(state: StoreState, patch: Partial<StoreState>): StoreState {
  return { ...state, ...patch };
}

/** 确认排程：所选工单的当前排程时段锁定为承诺时段 */
export function commitOrders(
  state: StoreState,
  ids: string[],
  schedule: Schedule
): ActionReport {
  const targets = ids.filter((id) => state.queue.includes(id));
  if (targets.length === 0) {
    return { state, locked: [], started: [], finished: [] };
  }
  const { lockedOps } = withLockedOps(state, targets, schedule);
  const targetSet = new Set(targets);
  const orders = state.orders.map((o) =>
    targetSet.has(o.id)
      ? {
          ...o,
          promised: true,
          originalPromiseMin: o.originalPromiseMin ?? schedule.finish[o.id],
        }
      : o
  );
  // 已锁定工单退出可重排队列；若确认时整单已跨过完工点，也一并出队
  const nowDone = new Set(
    state.queue.filter((id) => (schedule.finish[id] ?? Infinity) <= state.now)
  );
  const removeIds = new Set(targets);
  for (const id of nowDone) removeIds.add(id);
  const finished = [...nowDone];
  const next: StoreState = bump(state, {
    orders,
    lockedOps,
    queue: state.queue.filter((id) => !removeIds.has(id)),
  });
  return { state: next, locked: targets, started: [], finished };
}

/** 推进工作台时间：跨过开工点的单转为已开始并锁定，跨过完工点的单完工出队 */
export function advanceTime(
  state: StoreState,
  deltaMin: number,
  schedule: Schedule
): ActionReport {
  const now = state.now + deltaMin;
  const started: string[] = [];
  const finished: string[] = [];
  const lockIds: string[] = [];

  for (const id of state.queue) {
    const ops = schedule.ops.filter((o) => o.orderId === id);
    if (!ops.length) continue;
    const allDone = ops.every((o) => o.end <= now);
    const anyStarted = ops.some((o) => o.start <= now);
    if (allDone) {
      finished.push(id);
      lockIds.push(id);
    } else if (anyStarted) {
      started.push(id);
      lockIds.push(id);
    }
  }

  const { lockedOps } =
    lockIds.length > 0 ? withLockedOps(state, lockIds, schedule) : { lockedOps: state.lockedOps };
  const lockSet = new Set(lockIds);
  const orders = state.orders.map((o) =>
    lockSet.has(o.id)
      ? {
          ...o,
          promised: o.promised || started.includes(o.id) || finished.includes(o.id),
          originalPromiseMin: o.originalPromiseMin ?? schedule.finish[o.id],
        }
      : o
  );

  const next = bump(state, {
    now,
    orders,
    lockedOps,
    queue: state.queue.filter((id) => !lockSet.has(id)),
  });
  return { state: next, locked: lockIds.filter((id) => !started.includes(id) && !finished.includes(id)), started, finished };
}

/** 切换加急；加急单插到可重排队列最前，随后由 reschedule 重算后续完工 */
export function toggleRush(state: StoreState, id: string): StoreState {
  const orders = state.orders.map((o) =>
    o.id === id ? { ...o, rush: !o.rush } : o
  );
  const target = orders.find((o) => o.id === id);
  let queue = state.queue;
  if (target?.rush) queue = insertRush(queue, id);
  return edit(state, { orders, queue });
}

let localCounter = 125;

export function addOrder(state: StoreState, input: NewOrderInput): StoreState {
  const id = `ORD-${localCounter++}`;
  const order: MaintenanceOrder = createOrder(input, state.nextSeq, state.now);
  const withId: MaintenanceOrder = { ...order, id };
  const queue = input.rush
    ? insertRush(state.queue, id)
    : [...state.queue, id];
  const next: StoreState = edit(state, {
    orders: [...state.orders, withId],
    queue,
    nextSeq: state.nextSeq + 1,
  });
  return next;
}

export function recompute(state: StoreState, version = state.version): Schedule {
  const input: RescheduleInput = {
    orders: state.orders,
    queue: state.queue,
    lockedOps: state.lockedOps,
    nowMin: state.now,
    version,
  };
  return reschedule(input);
}
