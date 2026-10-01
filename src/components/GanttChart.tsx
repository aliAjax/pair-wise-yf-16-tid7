import type { Schedule, ScheduledOp, StoreState } from "../lib/types";
import { OP_KIND_LABEL } from "../lib/types";
import { fmtTime } from "../lib/seed";
import { CAPACITY } from "../lib/schedule";

const START = 8 * 60;
const END = 20 * 60;
const SPAN = END - START;
const HOURS = Array.from({ length: SPAN / 60 + 1 }, (_, i) => START + i * 60);

const KIND_COLOR: Record<ScheduledOp["kind"], string> = {
  base: "var(--accent)",
  edge: "var(--primary)",
  wax: "var(--secondary)",
};

interface Props {
  schedule: Schedule;
  state: StoreState;
}

export function GanttChart({ schedule, state }: Props) {
  const lanes: Array<{ key: string; title: string; kind: ScheduledOp["kind"]; lane: number }> = [];
  (["base", "edge", "wax"] as const).forEach((kind) => {
    for (let i = 0; i < CAPACITY[kind]; i += 1) {
      lanes.push({
        key: `${kind}-${i}`,
        title: `${OP_KIND_LABEL[kind]} ${i + 1}`,
        kind,
        lane: i,
      });
    }
  });

  const orderById = new Map(state.orders.map((o) => [o.id, o]));
  const left = (min: number) => `${((min - START) / SPAN) * 100}%`;
  const width = (s: number, e: number) =>
    `${Math.max(((e - s) / SPAN) * 100, 0.6)}%`;

  return (
    <div className="gantt">
      <div className="gantt-head">
        <div className="gantt-axis">
          {HOURS.map((h) => (
            <span key={h} style={{ left: left(h) }}>
              {fmtTime(h)}
            </span>
          ))}
        </div>
      </div>
      {lanes.map((l) => {
        const blocks = schedule.ops.filter(
          (op) => op.resource === l.kind && op.lane === l.lane
        );
        return (
          <div className="gantt-row" key={l.key}>
            <div className="gantt-label">
              {l.title}
              {l.kind === "base" && <em>专用 ×1</em>}
            </div>
            <div className="gantt-track">
              {HOURS.map((h) => (
                <i key={h} className="gridline" style={{ left: left(h) }} />
              ))}
              <i
                className="nowline"
                style={{ left: left(Math.min(Math.max(state.now, START), END)) }}
                title={`当前 ${fmtTime(state.now)}`}
              />
              {blocks.map((b) => (
                <div
                  key={`${b.orderId}-${b.kind}`}
                  className={`gantt-block ${b.locked ? "locked" : ""}`}
                  style={{
                    left: left(b.start),
                    width: width(b.start, b.end),
                    background: KIND_COLOR[b.kind],
                  }}
                  title={`${b.orderId} ${OP_KIND_LABEL[b.kind]} ${fmtTime(b.start)}–${fmtTime(b.end)}${
                    b.locked ? "（已锁定）" : ""
                  }`}
                >
                  <b>{b.orderId}</b>
                  <span>
                    {fmtTime(b.start)}-{fmtTime(b.end)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="gantt-legend">
        {(["base", "edge", "wax"] as const).map((k) => (
          <span key={k} className="legend-item">
            <i style={{ background: KIND_COLOR[k] }} />
            {OP_KIND_LABEL[k]}
          </span>
        ))}
        <span className="legend-item">
          <i className="legend-locked" /> 已锁定时段（已开工/已承诺）
        </span>
        {orderById.size > 0 && (
          <span className="legend-item">
            <i className="legend-now" /> 当前时间 {fmtTime(state.now)}
          </span>
        )}
      </div>
    </div>
  );
}
