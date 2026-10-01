import type { Schedule, StoreState } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { fmtTime, fmtDuration } from "../lib/seed";
import { liveStatus } from "../lib/schedule";

interface Props {
  state: StoreState;
  schedule: Schedule;
  selectIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleRush: (id: string) => void;
}

export function QueuePanel({
  state,
  schedule,
  selectIds,
  onToggleSelect,
  onToggleRush,
}: Props) {
  const byId = new Map(state.orders.map((o) => [o.id, o]));

  return (
    <div className="queue-list">
      {state.queue.length === 0 && (
        <p className="empty-hint">可重排队列已空，新增工单或推进时间试试。</p>
      )}
      {state.queue.map((id, idx) => {
        const o = byId.get(id)!;
        const finish = schedule.finish[id];
        const status = liveStatus(o, schedule, state.now);
        const selected = selectIds.includes(id);
        const overPromise =
          o.originalPromiseMin != null && finish > o.originalPromiseMin;
        return (
          <article
            key={id}
            className={`queue-card ${o.rush ? "rush" : ""} ${
              selected ? "selected" : ""
            }`}
          >
            <label className="queue-check" title="勾选后随“确认排程”给出承诺">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(id)}
              />
            </label>
            <div className="queue-main">
              <div className="queue-title">
                <b>
                  {idx + 1}. {o.id}
                </b>
                {o.rush && <span className="tag tag-rush">加急</span>}
                <span className={`tag tag-${status}`}>{STATUS_LABEL[status]}</span>
                {o.needsBaseRepair && (
                  <span className="tag tag-base">占底板专用工位</span>
                )}
              </div>
              <h3>
                {o.brand} · {o.customer}
              </h3>
              <p className="queue-meta">
                {o.boardType} · 侧刃 {o.sideAngle ?? "—"}° / 底刃{" "}
                {o.baseAngle ?? "—"}° · {o.waxType}
                {o.damageDesc !== "无" && o.damageDesc ? ` · ${o.damageDesc}` : ""}
              </p>
              <div className="queue-times">
                <span>
                  预计完工 <strong>{fmtTime(finish)}</strong>（剩{" "}
                  {fmtDuration(Math.max(finish - state.now, 0))}）
                </span>
                <span className={overPromise ? "overdue" : ""}>
                  原承诺{" "}
                  {o.originalPromiseMin != null
                    ? fmtTime(o.originalPromiseMin)
                    : "未承诺"}
                  {overPromise && " ⚠ 将晚于承诺，需沟通"}
                </span>
                <button
                  className="link-btn"
                  onClick={() => onToggleRush(id)}
                  title="加急单插到队首并重算后续完工"
                >
                  {o.rush ? "取消加急" : "标为加急"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
