import { fmtTime, orderCompletion } from "../schedule";
import type { WorkOrder } from "../types";

export default function ParamTable({ orders }: { orders: WorkOrder[] }) {
  const done = orders
    .filter((o) => o.status === "done")
    .sort((a, b) => orderCompletion(a.slot) - orderCompletion(b.slot));

  return (
    <div className="param-table-wrap">
      <table className="param-table">
        <thead>
          <tr>
            <th>#</th>
            <th>工单号</th>
            <th>雪板</th>
            <th>板型</th>
            <th>侧刃角</th>
            <th>底刃角</th>
            <th>打蜡类型</th>
            <th>完工时刻</th>
          </tr>
        </thead>
        <tbody>
          {done.length === 0 && (
            <tr>
              <td colSpan={8} className="table-empty">
                尚未完工工单，完工后按本次排程展示刃角参数。
              </td>
            </tr>
          )}
          {done.map((o, i) => (
            <tr key={o.id}>
              <td>{String(i + 1).padStart(2, "0")}</td>
              <td>{o.id}</td>
              <td>{o.board}</td>
              <td>{o.boardType}</td>
              <td>{o.sideEdge}°</td>
              <td>{o.baseEdge}°</td>
              <td>{o.waxType}</td>
              <td>{fmtTime(orderCompletion(o.slot))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
