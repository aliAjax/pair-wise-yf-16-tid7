// 雪板维护可重排队列：核心数据模型

/** 工序种类：底板修补 / 修边 / 打蜡（同时也是工位资源种类） */
export type OpKind = "base" | "edge" | "wax";
export type ResourceKind = OpKind;

export const OP_KIND_LABEL: Record<OpKind, string> = {
  base: "底板修补",
  edge: "修边",
  wax: "打蜡",
};

export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  base: "底板修补工位",
  edge: "修边工位",
  wax: "打蜡工位",
};

export type BoardType = "全地域" | "公园板" | "竞速板" | "粉雪板";
export type WaxType = "低温蜡" | "温蜡" | "含氟蜡" | "不打蜡";

export type OrderStatus = "completed" | "started" | "promised" | "queued";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  completed: "已完工",
  started: "进行中",
  promised: "已承诺",
  queued: "排队中",
};

/** 维护工单 */
export interface MaintenanceOrder {
  id: string;
  customer: string;
  brand: string;
  lengthCm: number;
  boardType: BoardType;
  /** 侧刃角度（度） */
  sideAngle: number | null;
  /** 底刃角度（度） */
  baseAngle: number | null;
  waxType: WaxType;
  needsBaseRepair: boolean;
  /** 底板损伤描述 */
  damageDesc: string;
  /** 修补位置标记 */
  repairSpots: string[];
  preference: string;
  /** 各工序实际需要的分钟数（未给则取默认值） */
  durationMin: Partial<Record<OpKind, number>>;
  /** 加急单：插入队首优先级 */
  rush: boolean;
  /** 是否已承诺（确认排程后锁定原时段） */
  promised: boolean;
  /** 历史完工单（演示数据） */
  historical?: boolean;
  /** 进入队列的先后顺序 */
  seq: number;
  /** 受理时间（分钟） */
  createdAtMin: number;
  /** 原承诺完工时间（分钟，null 表示尚未给过承诺） */
  originalPromiseMin: number | null;
}

/** 已排入日程的一道工序 */
export interface ScheduledOp {
  orderId: string;
  kind: OpKind;
  start: number;
  end: number;
  resource: ResourceKind;
  /** 同种类资源的工位编号，0 起 */
  lane: number;
  /** 已开始 / 已承诺的工单时段不可移动 */
  locked: boolean;
}

export interface Schedule {
  ops: ScheduledOp[];
  /** 工单完工时间（最后一道工序结束） */
  finish: Record<string, number>;
  /** 排程版本号（确认一次 +1） */
  version: number;
}

/** 持久化的确认状态快照 */
export interface StoreState {
  version: number;
  /** 工作台当前时间（分钟，演示时钟） */
  now: number;
  nextSeq: number;
  orders: MaintenanceOrder[];
  /** 未完工工单在可重排队列中的顺序（id） */
  queue: string[];
  /** 已锁定的工序时段（已开始 / 已承诺 / 已完工） */
  lockedOps: ScheduledOp[];
}

export interface NewOrderInput {
  customer: string;
  brand: string;
  lengthCm: number;
  boardType: BoardType;
  sideAngle: number | null;
  baseAngle: number | null;
  waxType: WaxType;
  needsBaseRepair: boolean;
  damageDesc: string;
  repairSpots: string[];
  preference: string;
  rush: boolean;
  originalPromiseMin: number | null;
}
