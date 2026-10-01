export type TaskType = "wax" | "edge" | "base";
export type Priority = "normal" | "rush";
export type OrderStatus = "pending" | "promised" | "working" | "done";
export type BoardType = "全地域" | "公园板" | "竞速板" | "粉雪板";

export interface Slot {
  start: number;
  end: number;
}

export type Schedule = Partial<Record<TaskType, Slot>>;

export interface WorkOrder {
  id: string;
  board: string;
  length: number;
  boardType: BoardType;
  sideEdge: number; // 侧刃角
  baseEdge: number; // 底刃角
  waxType: string;
  baseDamage: string;
  tasks: TaskType[];
  promise: number; // 承诺完工时刻（距开店分钟数）
  priority: Priority;
  status: OrderStatus;
  slot?: Schedule;
  completedAt?: number;
  createdAt: number;
}

export type WriteState = "idle" | "writing" | "error";
