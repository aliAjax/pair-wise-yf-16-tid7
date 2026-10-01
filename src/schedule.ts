import type { Schedule, Slot, TaskType, WorkOrder } from "./types";

// 开店时刻 09:00，时间轴按距开店分钟数计算
export const DAY_START_MIN = 9 * 60;
export const DAY_END_MIN = 18 * 60;
export const AXIS_MIN = 540; // 09:00 - 18:00

export const TASK_DURATIONS: Record<TaskType, number> = {
  wax: 20,
  edge: 15,
  base: 45,
};

export const TASK_LABELS: Record<TaskType, string> = {
  wax: "打蜡",
  edge: "修边",
  base: "底板修补",
};

export const TASK_STATIONS: Record<TaskType, string> = {
  wax: "打蜡工位",
  edge: "修边工位",
  base: "底板修补工位",
};

export const ORDER_COLORS = [
  "#0369a1",
  "#14b8a6",
  "#8b5cf6",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#ec4899",
];

export function fmtTime(minFromOpen: number): string {
  const total = DAY_START_MIN + Math.round(minFromOpen);
  const h = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}小时${m}分` : `${h}小时`;
}

export function orderCompletion(slot: Schedule | undefined): number {
  if (!slot) return 0;
  return Math.max(slot.base?.end ?? 0, slot.edge?.end ?? 0, slot.wax?.end ?? 0);
}

export function isLate(order: WorkOrder): boolean {
  if (order.status === "done") return false;
  return orderCompletion(order.slot) > order.promise;
}

// 在串行工位上寻找最早可用时段，跳过已占用区间
function earliestBaseStart(intervals: Slot[], duration: number, ready: number): number {
  let start = ready;
  for (const iv of intervals) {
    if (iv.end <= start) continue;
    if (iv.start >= start + duration) break;
    start = Math.max(start, iv.end);
  }
  return start;
}

/**
 * 重算排程：
 * - 已开始(working) / 已承诺(promised) 工单保留原时段，不参与重排
 * - 待维护(pending) 工单按队列顺序（加急优先，再按承诺时刻）排队
 * - 打蜡 / 修边可并行；底板修补同一时间只占一个工位（串行）
 */
export function recomputeSlots(orders: WorkOrder[]): WorkOrder[] {
  const locked = orders.filter((o) => o.status === "promised" || o.status === "working");
  const free = orders.filter((o) => o.status === "pending");

  const baseIntervals: Slot[] = locked
    .filter((o) => o.slot?.base)
    .map((o) => ({ ...o.slot!.base! }))
    .sort((a, b) => a.start - b.start);

  const queue = [...free].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "rush" ? -1 : 1;
    return a.promise - b.promise;
  });

  const slotById = new Map<string, Schedule>();
  for (const o of locked) slotById.set(o.id, o.slot!);

  for (const o of queue) {
    const hasBase = o.tasks.includes("base");
    let baseStart = 0;
    if (hasBase) {
      baseStart = earliestBaseStart(baseIntervals, TASK_DURATIONS.base, 0);
      baseIntervals.push({ start: baseStart, end: baseStart + TASK_DURATIONS.base });
      baseIntervals.sort((a, b) => a.start - b.start);
    }
    const baseEnd = hasBase ? baseStart + TASK_DURATIONS.base : 0;
    const slot: Schedule = {
      base: hasBase ? { start: baseStart, end: baseStart + TASK_DURATIONS.base } : undefined,
      edge: o.tasks.includes("edge")
        ? { start: baseEnd, end: baseEnd + TASK_DURATIONS.edge }
        : undefined,
      wax: o.tasks.includes("wax")
        ? { start: baseEnd, end: baseEnd + TASK_DURATIONS.wax }
        : undefined,
    };
    slotById.set(o.id, slot);
  }

  return orders.map((o) => (slotById.has(o.id) ? { ...o, slot: slotById.get(o.id) } : o));
}

export function cloneOrders(orders: WorkOrder[]): WorkOrder[] {
  return orders.map((o) => ({ ...o, tasks: [...o.tasks], slot: o.slot ? { ...o.slot } : undefined }));
}
