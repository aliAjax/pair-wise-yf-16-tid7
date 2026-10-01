import { AXIS_MIN, ORDER_COLORS, TASK_LABELS, fmtTime, orderCompletion } from "../schedule";
import type { TaskType, WorkOrder } from "../types";

const ROWS: { type: TaskType; label: string; hint: string }[] = [
  { type: "wax", label: "打蜡", hint: "可并行" },
  { type: "edge", label: "修边", hint: "可并行" },
  { type: "base", label: "底板修补", hint: "同一时间只占一个工位 · 串行" },
];

function colorFor(orders: WorkOrder[], id: string): string {
  const idx = orders.findIndex((o) => o.id === id);
  return ORDER_COLORS[(idx < 0 ? 0 : idx) % ORDER_COLORS.length];
}

export default function ScheduleBoard({ orders }: { orders: WorkOrder[] }) {
  const active = orders.filter((o) => o.status !== "done");
  const ticks: number[] = [];
  for (let t = 0; t <= AXIS_MIN; t += 60) ticks.push(t);

  return (
    <div className="gantt">
      <div className="gantt-axis">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${(t / AXIS_MIN) * 100}%` }}>
            {fmtTime(t)}
          </span>
        ))}
      </div>
      {ROWS.map((row) => (
        <div className="gantt-row" key={row.type}>
          <div className="gantt-row-label">
            <strong>{row.label}</strong>
            <small>{row.hint}</small>
          </div>
          <div className="gantt-track">
            {active.map((o) => {
              const slot = o.slot?.[row.type];
              if (!slot) return null;
              const left = (slot.start / AXIS_MIN) * 100;
              const width = ((slot.end - slot.start) / AXIS_MIN) * 100;
              const color = colorFor(orders, o.id);
              return (
                <div
                  key={o.id}
                  className={`gantt-bar status-${o.status} ${o.priority === "rush" ? "is-rush" : ""}`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: o.status === "pending" ? "#ffffff" : color,
                    borderColor: color,
                    color: o.status === "pending" ? color : "#ffffff",
                  }}
                  title={`${o.id} ${TASK_LABELS[row.type]} ${fmtTime(slot.start)}-${fmtTime(slot.end)}`}
                >
                  <span className="gantt-bar-id">{o.id}</span>
                  {o.priority === "rush" && <em className="gantt-bar-flag">加急</em>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="gantt-legend">
        <span><i className="swatch solid" />已承诺 / 进行中（保留原时段）</span>
        <span><i className="swatch dashed" />待维护（参与重排）</span>
        <span><i className="swatch rush" />加急单</span>
        <span className="gantt-completion">
          最近完工：{active.length ? fmtTime(Math.max(...active.map((o) => orderCompletion(o.slot)))) : "—"}
        </span>
      </div>
    </div>
  );
}
