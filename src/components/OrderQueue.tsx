import { fmtTime, isLate, orderCompletion, TASK_LABELS } from "../schedule";
import type { BoardType, WorkOrder } from "../types";

interface Props {
  orders: WorkOrder[];
  filter: BoardType | "全部";
  onToggleRush: (id: string) => void;
  onRemove: (id: string) => void;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
}

const STATUS_LABELS: Record<WorkOrder["status"], string> = {
  pending: "待维护",
  promised: "已承诺",
  working: "进行中",
  done: "已完工",
};

export default function OrderQueue({
  orders,
  filter,
  onToggleRush,
  onRemove,
  onStart,
  onComplete,
}: Props) {
  const visible = orders
    .filter((o) => o.status !== "done")
    .filter((o) => (filter === "全部" ? true : o.boardType === filter))
    .sort((a, b) => {
      const aWorking = a.status === "working";
      const bWorking = b.status === "working";
      if (aWorking !== bWorking) return aWorking ? -1 : 1;
      if (a.priority !== b.priority) return a.priority === "rush" ? -1 : 1;
      return a.promise - b.promise;
    });

  if (visible.length === 0) {
    return <p className="empty-queue">当前筛选下没有待排队的工单。</p>;
  }

  return (
    <div className="queue">
      {visible.map((o) => {
        const completion = orderCompletion(o.slot);
        const late = isLate(o);
        return (
          <article
            key={o.id}
            className={`queue-card ${o.priority === "rush" ? "is-rush" : ""} ${late ? "is-late" : ""}`}
          >
            <div className="queue-card-main">
              <div className="queue-card-id">
                <strong>{o.id}</strong>
                <span className={`badge status-${o.status}`}>{STATUS_LABELS[o.status]}</span>
                {o.priority === "rush" && <span className="badge rush">加急</span>}
                {late && <span className="badge late">延期</span>}
              </div>
              <h3>{o.board}</h3>
              <p className="queue-card-meta">
                <span className="chip">{o.boardType}</span>
                <span>刃角 侧{o.sideEdge}° / 底{o.baseEdge}°</span>
                <span>{o.waxType}</span>
                <span className="queue-card-damage">{o.baseDamage}</span>
              </p>
              <p className="queue-card-tasks">
                {o.tasks.map((t) => (
                  <span key={t} className={`task-tag task-${t}`}>
                    {TASK_LABELS[t]}
                  </span>
                ))}
              </p>
            </div>
            <div className="queue-card-time">
              <div className="time-block">
                <small>承诺</small>
                <strong>{fmtTime(o.promise)}</strong>
              </div>
              <div className="time-block">
                <small>排程完工</small>
                <strong className={late ? "text-late" : ""}>{fmtTime(completion)}</strong>
              </div>
              <div className="queue-card-actions">
                {o.status === "pending" && (
                  <>
                    <button onClick={() => onToggleRush(o.id)}>
                      {o.priority === "rush" ? "取消加急" : "加急插入"}
                    </button>
                    <button className="danger" onClick={() => onRemove(o.id)}>
                      移除
                    </button>
                  </>
                )}
                {o.status === "promised" && (
                  <button className="primary" onClick={() => onStart(o.id)}>
                    开工
                  </button>
                )}
                {o.status === "working" && (
                  <button className="primary" onClick={() => onComplete(o.id)}>
                    完工
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
