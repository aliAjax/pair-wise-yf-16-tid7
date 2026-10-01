import { useState } from "react";
import { TASK_LABELS } from "../schedule";
import type { BoardType, TaskType, WorkOrder } from "../types";

interface Props {
  onCreate: (data: Omit<WorkOrder, "id" | "status" | "slot" | "createdAt">) => void;
  onClose: () => void;
}

const BOARD_TYPES: BoardType[] = ["全地域", "公园板", "竞速板", "粉雪板"];
const WAX_TYPES = ["低温蜡", "高温蜡", "通用蜡", "氟蜡"];
const TASK_OPTIONS: TaskType[] = ["wax", "edge", "base"];

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m - 9 * 60;
}

export default function OrderForm({ onCreate, onClose }: Props) {
  const [board, setBoard] = useState("");
  const [length, setLength] = useState(158);
  const [boardType, setBoardType] = useState<BoardType>("全地域");
  const [sideEdge, setSideEdge] = useState(88);
  const [baseEdge, setBaseEdge] = useState(1);
  const [waxType, setWaxType] = useState(WAX_TYPES[0]);
  const [baseDamage, setBaseDamage] = useState("");
  const [tasks, setTasks] = useState<TaskType[]>(["wax", "edge"]);
  const [promise, setPromise] = useState("12:00");
  const [rush, setRush] = useState(false);

  const toggleTask = (t: TaskType) => {
    setTasks((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const submit = () => {
    if (!board.trim()) return;
    onCreate({
      board: board.trim(),
      length,
      boardType,
      sideEdge,
      baseEdge,
      waxType,
      baseDamage: baseDamage.trim() || "无明显损伤",
      tasks,
      promise: toMinutes(promise),
      priority: rush ? "rush" : "normal",
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>新增维护工单</p>
            <h2>登记雪板</h2>
          </div>
          <button onClick={onClose}>关闭</button>
        </div>
        <div className="field-grid">
          <label>
            <span>雪板品牌 / 型号</span>
            <input value={board} onChange={(e) => setBoard(e.target.value)} placeholder="如 Burton 156" />
          </label>
          <label>
            <span>长度 (cm)</span>
            <input
              type="number"
              value={length}
              min={120}
              max={180}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </label>
          <label>
            <span>板型</span>
            <select value={boardType} onChange={(e) => setBoardType(e.target.value as BoardType)}>
              {BOARD_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <span>打蜡类型</span>
            <select value={waxType} onChange={(e) => setWaxType(e.target.value)}>
              {WAX_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <span>侧刃角 (°)</span>
            <input
              type="number"
              value={sideEdge}
              min={85}
              max={90}
              step={0.5}
              onChange={(e) => setSideEdge(Number(e.target.value))}
            />
          </label>
          <label>
            <span>底刃角 (°)</span>
            <input
              type="number"
              value={baseEdge}
              min={0}
              max={3}
              step={0.5}
              onChange={(e) => setBaseEdge(Number(e.target.value))}
            />
          </label>
          <label>
            <span>承诺完工时刻</span>
            <input type="time" value={promise} onChange={(e) => setPromise(e.target.value)} />
          </label>
          <label className="checkbox-label">
            <span>服务项目</span>
            <div className="task-checks">
              {TASK_OPTIONS.map((t) => (
                <label key={t} className="check-pill">
                  <input
                    type="checkbox"
                    checked={tasks.includes(t)}
                    onChange={() => toggleTask(t)}
                  />
                  {TASK_LABELS[t]}
                </label>
              ))}
            </div>
          </label>
          <label className="full">
            <span>底板损伤 / 客户偏好</span>
            <input
              value={baseDamage}
              onChange={(e) => setBaseDamage(e.target.value)}
              placeholder="如 底板划痕5cm，待补P-Tex；客户偏好弱咬雪"
            />
          </label>
        </div>
        <div className="modal-footer">
          <label className="rush-check">
            <input type="checkbox" checked={rush} onChange={(e) => setRush(e.target.checked)} />
            加急单（插入队列最前，重算后续完工时间）
          </label>
          <button className="primary" onClick={submit} disabled={!board.trim() || tasks.length === 0}>
            加入排程
          </button>
        </div>
      </div>
    </div>
  );
}
