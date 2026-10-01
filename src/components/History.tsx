import { TASK_LABELS, fmtTime, orderCompletion } from "../schedule";
import type { WorkOrder } from "../types";

export default function History({ orders }: { orders: WorkOrder[] }) {
  const done = orders
    .filter((o) => o.status === "done")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  if (done.length === 0) {
    return <p className="empty-queue">暂无完工历史，完工后按本次排程展示。</p>;
  }

  return (
    <div className="history">
      {done.map((o, i) => (
        <article key={o.id}>
          <b>{String(i + 1).padStart(2, "0")}</b>
          <div>
            <h3>
              {o.id} · {o.board}
            </h3>
            <p>
              <span className="chip">{o.boardType}</span>
              {o.tasks.map((t) => (
                <span key={t} className={`task-tag task-${t}`}>
                  {TASK_LABELS[t]}
                </span>
              ))}
            </p>
            <p className="history-time">
              完工于 {fmtTime(o.completedAt ?? orderCompletion(o.slot))} · 刃角 侧{o.sideEdge}°/底{o.baseEdge}°
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}
