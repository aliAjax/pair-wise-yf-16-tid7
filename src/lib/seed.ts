import type {
  MaintenanceOrder,
  NewOrderInput,
  ScheduledOp,
  StoreState,
} from "./types";

/** 分钟（从 00:00 起）转 HH:mm */
export function fmtTime(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmtRange(start: number, end: number): string {
  return `${fmtTime(start)}–${fmtTime(end)}`;
}

export function fmtDuration(min: number): string {
  return `${Math.round(min)} 分钟`;
}

export const DAY_START = 8 * 60; // 08:00 开店

let seqCounter = 100;

function makeOrder(
  partial: Omit<MaintenanceOrder, "seq" | "createdAtMin" | "originalPromiseMin"> &
    Partial<Pick<MaintenanceOrder, "seq" | "createdAtMin" | "originalPromiseMin">>
): MaintenanceOrder {
  return {
    seq: seqCounter++,
    createdAtMin: DAY_START,
    originalPromiseMin: null,
    ...partial,
  };
}

/** 初始演示数据：两条在程单（已开始/已承诺，时段锁定）+ 当天队列 */
export function createSeedState(): StoreState {
  const orders: MaintenanceOrder[] = [
    // 进行中：底板修补已开工，专用工位被占到 09:30
    makeOrder({
      id: "ORD-112",
      customer: "李铮",
      brand: "F2 竞速板 165",
      lengthCm: 165,
      boardType: "竞速板",
      sideAngle: 87,
      baseAngle: 1,
      waxType: "含氟蜡",
      needsBaseRepair: true,
      damageDesc: "底板纵向划痕 12cm",
      repairSpots: ["板尾", "中部"],
      preference: "竞技调校，咬雪要强",
      durationMin: { base: 90, edge: 50, wax: 30 },
      rush: false,
      promised: true,
      originalPromiseMin: 12 * 60,
      seq: 1,
    }),
    // 已承诺未开工：承诺过 11:00 取
    makeOrder({
      id: "ORD-106",
      customer: "周岚",
      brand: "Burton Custom 156",
      lengthCm: 156,
      boardType: "全地域",
      sideAngle: 88,
      baseAngle: 1,
      waxType: "低温蜡",
      needsBaseRepair: false,
      damageDesc: "无",
      repairSpots: [],
      preference: "日常巡航，弱一点的咬雪",
      durationMin: { edge: 40, wax: 30 },
      rush: false,
      promised: true,
      originalPromiseMin: 11 * 60,
      seq: 2,
    }),
    // 排队中
    makeOrder({
      id: "ORD-118",
      customer: "陈野",
      brand: "Jones 粉雪板 158",
      lengthCm: 158,
      boardType: "粉雪板",
      sideAngle: 89,
      baseAngle: 0,
      waxType: "温蜡",
      needsBaseRepair: false,
      damageDesc: "无",
      repairSpots: [],
      preference: "粉雪浮力优先，边刃轻度",
      durationMin: { edge: 35, wax: 35 },
      rush: false,
      promised: false,
      originalPromiseMin: 16 * 60,
      seq: 3,
    }),
    makeOrder({
      id: "ORD-121",
      customer: "高翔",
      brand: "Nitro 公园板 152",
      lengthCm: 152,
      boardType: "公园板",
      sideAngle: 88,
      baseAngle: 1,
      waxType: "不打蜡",
      needsBaseRepair: true,
      damageDesc: "板底烧板两处、边缘磕碰",
      repairSpots: ["板头", "固定器区"],
      preference: "道具玩家，边刃别太利",
      durationMin: { base: 100, edge: 30, wax: 20 },
      rush: false,
      promised: false,
      originalPromiseMin: 15 * 60,
      seq: 4,
    }),
    makeOrder({
      id: "ORD-124",
      customer: "苏晴",
      brand: "Salomon 全地域 159",
      lengthCm: 159,
      boardType: "全地域",
      sideAngle: 87,
      baseAngle: 1,
      waxType: "低温蜡",
      needsBaseRepair: false,
      damageDesc: "无",
      repairSpots: [],
      preference: "周末雪场，标准调校",
      durationMin: { edge: 45, wax: 30 },
      rush: false,
      promised: false,
      originalPromiseMin: 18 * 60,
      seq: 5,
    }),
  ];

  // 锁定时段（与 ORD-112 / ORD-106 的承诺一致，重排时不得移动）
  // 每次新建对象，避免不同调用方共享引用
  const mk = (
    op: Omit<ScheduledOp, "locked">
  ): ScheduledOp => ({ ...op, locked: true });
  const lockedOps: ScheduledOp[] = [
    mk({ orderId: "ORD-112", kind: "base", start: 8 * 60, end: 9 * 60 + 30, resource: "base", lane: 0 }),
    mk({ orderId: "ORD-112", kind: "edge", start: 9 * 60 + 30, end: 10 * 60 + 20, resource: "edge", lane: 0 }),
    mk({ orderId: "ORD-112", kind: "wax", start: 10 * 60 + 20, end: 10 * 60 + 50, resource: "wax", lane: 0 }),
    mk({ orderId: "ORD-106", kind: "edge", start: 10 * 60, end: 10 * 60 + 40, resource: "edge", lane: 1 }),
    mk({ orderId: "ORD-106", kind: "wax", start: 10 * 60 + 40, end: 11 * 60 + 10, resource: "wax", lane: 1 }),
  ];

  return {
    version: 1,
    now: 9 * 60, // 工作台当前 09:00
    nextSeq: 6,
    orders,
    queue: ["ORD-118", "ORD-121", "ORD-124"],
    lockedOps,
  };
}

export function createOrder(
  input: NewOrderInput,
  seq: number,
  createdAtMin: number,
  historical = false
): MaintenanceOrder {
  return {
    ...input,
    id: `ORD-${seq}`,
    promised: false,
    durationMin: {},
    historical,
    seq,
    createdAtMin,
  };
}

/** 历史维护记录（完工归档，不参与当天排程） */
export const HISTORY_ARCHIVE: Array<{
  orderId: string;
  customer: string;
  brand: string;
  boardType: MaintenanceOrder["boardType"];
  finishedMin: number;
  summary: string;
  waxType: MaintenanceOrder["waxType"];
  sideAngle: number | null;
  baseAngle: number | null;
}> = [
  {
    orderId: "ORD-088",
    customer: "李铮",
    brand: "F2 竞速板 165",
    boardType: "竞速板",
    finishedMin: 9 * 60 + 40,
    summary: "侧刃 87° / 底刃 1°，含氟蜡，板底抛光",
    waxType: "含氟蜡",
    sideAngle: 87,
    baseAngle: 1,
  },
  {
    orderId: "ORD-091",
    customer: "周岚",
    brand: "Burton Custom 156",
    boardType: "全地域",
    finishedMin: 17 * 60 + 20,
    summary: "侧刃 88°，低温蜡，常规保养",
    waxType: "低温蜡",
    sideAngle: 88,
    baseAngle: 1,
  },
  {
    orderId: "ORD-104",
    customer: "高翔",
    brand: "Nitro 公园板 152",
    boardType: "公园板",
    finishedMin: 16 * 60 + 10,
    summary: "P-Tex 补板底 2 处，边刃轻度开刃",
    waxType: "不打蜡",
    sideAngle: 88,
    baseAngle: 1,
  },
];
