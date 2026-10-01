import { useMemo, useState } from "react";
import type { MaintenanceOrder, Schedule, StoreState } from "../lib/types";
import { STATUS_LABEL, type OrderStatus } from "../lib/types";
import { fmtTime } from "../lib/seed";
import { liveStatus, opsOfOrder } from "../lib/schedule";

interface Props {
  state: StoreState;
  schedule: Schedule;
}

const FILTERS: Array<"all" | OrderStatus> = [
  "all",
  "queued",
  "started",
  "promised",
  "completed",
];

export function ParamsTable({ state, schedule }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const rows = useMemo(() => {
    const lockedIds = new Set(state.lockedOps.map((o) => o.orderId));
    return state.orders
      .map((o) => {
        const live = liveStatus(o, schedule, state.now);
        const status: OrderStatus =
          live === "completed"
            ? "completed"
            : live === "started"
              ? "started"
              : o.promised
                ? "promised"
                : "queued";
        return { o, status, locked: lockedIds.has(o.id) };
      })
      .filter((r) => (filter === "all" ? true : r.status === filter))
      .sort((a, b) => (schedule.finish[a.o.id] ?? 0) - (schedule.finish[b.o.id] ?? 0));
  }, [state, schedule, filter]);

  return (
    <div className="params">
      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={filter === f ? "chip-on" : ""}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "全部" : STATUS_LABEL[f]}
          </button>
        ))}
        <span className="version-tag">按排程版本 v{schedule.version} 展示</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>工单</th>
              <th>雪板</th>
              <th>板型</th>
              <th>侧刃</th>
              <th>底刃</th>
              <th>打蜡</th>
              <th>底板修补</th>
              <th>工序时段（本次排程）</th>
              <th>完工</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, status, locked }) => (
              <Row key={o.id} o={o} status={status} locked={locked} schedule={schedule} now={state.now} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="empty-hint">
                  当前筛选下没有工单
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  o,
  status,
  locked,
  schedule,
  now,
}: {
  o: MaintenanceOrder;
  status: OrderStatus;
  locked: boolean;
  schedule: Schedule;
  now: number;
}) {
  const ops = opsOfOrder(schedule, o.id);
  return (
    <tr className={o.rush ? "row-rush" : ""}>
      <td>
        <b>{o.id}</b>
        {o.rush && <span className="tag tag-rush">加急</span>}
        {locked && <span className="tag tag-lock">时段锁定</span>}
      </td>
      <td>
        {o.brand}
        <small>{o.lengthCm}cm · {o.customer}</small>
      </td>
      <td>{o.boardType}</td>
      <td>{o.sideAngle ?? "—"}°</td>
      <td>{o.baseAngle ?? "—"}°</td>
      <td>{o.waxType}</td>
      <td>
        {o.needsBaseRepair ? (
          <>
            P-Tex
            {o.repairSpots.length > 0 && <small>{o.repairSpots.join("、")}</small>}
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="op-cells">
        {ops.map((op) => (
          <span key={op.kind} className={`op-pill op-${op.kind} ${op.locked ? "locked" : ""}`}>
            {fmtTime(op.start)}-{fmtTime(op.end)}
          </span>
        ))}
      </td>
      <td>{fmtTime(schedule.finish[o.id])}</td>
      <td>
        <span className={`status-dot s-${status}`} />
        {STATUS_LABEL[status]}
        {status !== "completed" && schedule.finish[o.id] <= now && "（待出队）"}
      </td>
    </tr>
  );
}
