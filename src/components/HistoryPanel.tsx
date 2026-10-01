import { useMemo, useState } from "react";
import type { MaintenanceOrder, Schedule, StoreState } from "../lib/types";
import { fmtTime } from "../lib/seed";
import { liveStatus, opsOfOrder } from "../lib/schedule";
import { HISTORY_ARCHIVE } from "../lib/seed";

interface Props {
  state: StoreState;
  schedule: Schedule;
}

export function HistoryPanel({ state, schedule }: Props) {
  const [customer, setCustomer] = useState("");

  // 今日已完工：本次排程里所有工序都已跨过当前时间的单
  const todayDone = useMemo(
    () =>
      state.orders.filter(
        (o) => liveStatus(o, schedule, state.now) === "completed"
      ),
    [state.orders, schedule, state.now]
  );

  const archive = HISTORY_ARCHIVE.filter(
    (h) => !customer || h.customer.includes(customer)
  );
  const recent = todayDone.filter(
    (o) => !customer || o.customer.includes(customer)
  );

  return (
    <div className="history">
      <div className="filter-bar">
        <input
          placeholder="按客户姓名检索历史维护记录"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        />
        <span className="version-tag">
          完工参数取自当前排程版本 v{schedule.version}
        </span>
      </div>

      {recent.length > 0 && (
        <>
          <h4 className="history-group">本次排程已完工</h4>
          <div className="records">
            {recent.map((o) => (
              <FinishedCard key={o.id} o={o} schedule={schedule} now={state.now} />
            ))}
          </div>
        </>
      )}

      <h4 className="history-group">客户历史维护记录</h4>
      <div className="records">
        {archive.map((h) => (
          <article key={h.orderId} className="history-card">
            <b>{h.orderId}</b>
            <div>
              <h3>
                {h.customer} · {h.brand}
              </h3>
              <p>
                {fmtTime(h.finishedMin)} 完工 · {h.boardType} · 侧刃{" "}
                {h.sideAngle}° / 底刃 {h.baseAngle}° · {h.waxType}
              </p>
              <p className="muted">{h.summary}</p>
            </div>
          </article>
        ))}
        {archive.length === 0 && <p className="empty-hint">没有匹配的客户记录</p>}
      </div>
    </div>
  );
}

function FinishedCard({
  o,
  schedule,
}: {
  o: MaintenanceOrder;
  schedule: Schedule;
  now: number;
}) {
  const ops = opsOfOrder(schedule, o.id);
  return (
    <article className="history-card today">
      <b>{o.id}</b>
      <div>
        <h3>
          {o.customer} · {o.brand}
        </h3>
        <p>
          {fmtTime(schedule.finish[o.id])} 完工 · {o.boardType} · 侧刃{" "}
          {o.sideAngle ?? "—"}° / 底刃 {o.baseAngle ?? "—"}° · {o.waxType}
          {o.needsBaseRepair &&
            ` · P-Tex：${o.repairSpots.join("、") || o.damageDesc}`}
        </p>
        <p className="muted">
          本次工序：
          {ops.map((op) => `${fmtTime(op.start)}-${fmtTime(op.end)}`).join("，")}
          {o.preference ? ` · 偏好：${o.preference}` : ""}
        </p>
      </div>
    </article>
  );
}
