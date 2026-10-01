import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  cloneOrders,
  fmtTime,
  isLate,
  orderCompletion,
  recomputeSlots,
} from "./schedule";
import { STORAGE_KEY, seedOrders } from "./seed";
import type { BoardType, WorkOrder, WriteState } from "./types";
import ScheduleBoard from "./components/ScheduleBoard";
import OrderQueue from "./components/OrderQueue";
import ParamTable from "./components/ParamTable";
import History from "./components/History";
import OrderForm from "./components/OrderForm";
import WriteBar from "./components/WriteBar";

const project = {
  id: "hxyfront-62004",
  sourceNo: 6,
  port: 62004,
  title: "滑雪板调校维护",
  prompt:
    "维护工单、底板修补与完工排程接成可重排队列：打蜡与修边可并行，底板修补同一时间只占一个工位，容量不足按原承诺排队；加急插入重算后续完工时间，已开始 / 已承诺工单保留原时段；撤销恢复上次确认状态，写入失败从原地继续重试；完工后参数表与历史记录按本次排程展示。",
};

const FILTERS: (BoardType | "全部")[] = ["全部", "全地域", "公园板", "竞速板", "粉雪板"];

function loadInitial(): WorkOrder[] {
  const seed = seedOrders();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkOrder[];
      if (Array.isArray(parsed) && parsed.length) {
        return recomputeSlots(parsed);
      }
    }
  } catch {
    // 本地数据损坏时退回种子
  }
  return recomputeSlots(seed);
}

export default function App() {
  const [confirmed, setConfirmed] = useState<WorkOrder[]>(() => loadInitial());
  const [draft, setDraft] = useState<WorkOrder[]>(() => loadInitial());
  const [writeState, setWriteState] = useState<WriteState>("idle");
  const [filter, setFilter] = useState<BoardType | "全部">("全部");
  const [formOpen, setFormOpen] = useState(false);

  const hasChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(confirmed),
    [draft, confirmed]
  );

  const changeCount = useMemo(() => {
    const cMap = new Map(confirmed.map((o) => [o.id, o]));
    let n = 0;
    for (const d of draft) {
      const c = cMap.get(d.id);
      if (!c || JSON.stringify(c) !== JSON.stringify(d)) n += 1;
    }
    n += confirmed.filter((c) => !draft.some((d) => d.id === c.id)).length;
    return n;
  }, [draft, confirmed]);

  // 任何排程改动都重算待维护工单的时段（已开始 / 已承诺保留）
  const updateDraft = (updater: (prev: WorkOrder[]) => WorkOrder[]) => {
    setDraft((prev) => recomputeSlots(updater(prev)));
  };

  const addOrder = (data: Omit<WorkOrder, "id" | "status" | "slot" | "createdAt">) => {
    const id = `ORD-${Math.floor(100 + Math.random() * 900)}`;
    updateDraft((prev) => [
      ...prev,
      { ...data, id, status: "pending", createdAt: Date.now() },
    ]);
    setFormOpen(false);
  };

  const toggleRush = (id: string) =>
    updateDraft((prev) =>
      prev.map((o) =>
        o.id === id && o.status === "pending"
          ? { ...o, priority: o.priority === "rush" ? "normal" : "rush" }
          : o
      )
    );

  const removeOrder = (id: string) =>
    updateDraft((prev) => prev.filter((o) => o.id !== id));

  const startOrder = (id: string) =>
    updateDraft((prev) =>
      prev.map((o) => (o.id === id && o.status === "promised" ? { ...o, status: "working" } : o))
    );

  const completeOrder = (id: string) =>
    updateDraft((prev) =>
      prev.map((o) =>
        o.id === id && o.status === "working"
          ? { ...o, status: "done", completedAt: orderCompletion(o.slot) }
          : o
      )
    );

  const completeAll = () =>
    updateDraft((prev) =>
      prev.map((o) =>
        o.status !== "done"
          ? { ...o, status: "done", completedAt: orderCompletion(o.slot) }
          : o
      )
    );

  const undo = () => {
    setDraft(recomputeSlots(cloneOrders(confirmed)));
    setWriteState("idle");
  };

  // 模拟写入：可能失败，失败时保留 draft 以便从原地重试
  const commit = () => {
    if (writeState === "writing") return;
    setWriteState("writing");
    window.setTimeout(() => {
      const ok = Math.random() >= 0.45;
      if (ok) {
        const finalized = draft.map((o) =>
          o.status === "pending" ? { ...o, status: "promised" as const } : o
        );
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(finalized));
        } catch {
          // 存储不可用时仍在内存中确认
        }
        setConfirmed(finalized);
        setDraft(finalized);
        setWriteState("idle");
      } else {
        setWriteState("error"); // 保留 draft，等待重试
      }
    }, 700);
  };

  // 指标
  const pendingCount = draft.filter((o) => o.status !== "done").length;
  const doneCount = draft.filter((o) => o.status === "done").length;
  const doneWithEdge = draft.filter((o) => o.status === "done");
  const avgEdge = doneWithEdge.length
    ? Math.round((doneWithEdge.reduce((s, o) => s + o.sideEdge, 0) / doneWithEdge.length) * 10) / 10
    : 0;
  const baseQueue = draft.filter((o) => o.tasks.includes("base") && o.status !== "done").length;
  const lateCount = draft.filter((o) => o.status !== "done" && isLate(o)).length;

  const baseQueueOrders = draft
    .filter((o) => o.tasks.includes("base") && o.status !== "done")
    .sort((a, b) => {
      const aWorking = a.status === "working";
      const bWorking = b.status === "working";
      if (aWorking !== bWorking) return aWorking ? -1 : 1;
      if (a.priority !== b.priority) return a.priority === "rush" ? -1 : 1;
      return a.promise - b.promise;
    });

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        <article>
          <small>待维护工单</small>
          <strong>{pendingCount}</strong>
        </article>
        <article>
          <small>完工工单</small>
          <strong>{doneCount}</strong>
        </article>
        <article>
          <small>平均刃角</small>
          <strong>{avgEdge || "—"}</strong>
        </article>
        <article>
          <small>底板修补排队</small>
          <strong>{baseQueue}</strong>
        </article>
      </section>

      <WriteBar
        hasChanges={hasChanges}
        writeState={writeState}
        onChangeCount={changeCount}
        onUndo={undo}
        onCommit={commit}
      />

      <section className="toolbar">
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={filter === f ? "chip-active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          {lateCount > 0 && <span className="late-hint">{lateCount} 单可能延期</span>}
          <button onClick={completeAll}>全部完工</button>
          <button className="primary" onClick={() => setFormOpen(true)}>
            新增工单
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel station-panel">
          <h2>工位容量</h2>
          <ul className="station-list">
            <li>
              <span className="dot dot-ok" />
              打蜡工位
              <small>可并行 · 不排队</small>
            </li>
            <li>
              <span className="dot dot-ok" />
              修边工位
              <small>可并行 · 不排队</small>
            </li>
            <li>
              <span className="dot dot-busy" />
              底板修补工位
              <small>同一时间只占一个工位</small>
            </li>
          </ul>
          <h3>底板修补队列</h3>
          <ol className="base-queue">
            {baseQueueOrders.length === 0 && <li className="empty-queue">暂无底板修补工单。</li>}
            {baseQueueOrders.map((o) => (
              <li key={o.id} className={o.priority === "rush" ? "is-rush" : ""}>
                <span className={`badge status-${o.status}`}>
                  {o.status === "working" ? "进行中" : o.status === "promised" ? "已承诺" : "待维护"}
                </span>
                {o.id}
                {o.priority === "rush" && <em className="badge rush">加急</em>}
                <small>{fmtTime(orderCompletion(o.slot))}</small>
              </li>
            ))}
          </ol>
          <p className="station-note">
            容量不足时按原承诺时刻排队；加急单插入后排在最前，后续工单完工时间自动重算，已开始 / 已承诺工单保留原时段。
          </p>
        </aside>

        <section className="panel schedule-panel">
          <div className="heading">
            <div>
              <p>完工排程</p>
              <h2>工位甘特图</h2>
            </div>
          </div>
          <ScheduleBoard orders={draft} />
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>维护工单</p>
            <h2>可重排队列</h2>
          </div>
        </div>
        <OrderQueue
          orders={draft}
          filter={filter}
          onToggleRush={toggleRush}
          onRemove={removeOrder}
          onStart={startOrder}
          onComplete={completeOrder}
        />
      </section>

      <section className="bottom-grid">
        <section className="panel">
          <div className="heading">
            <div>
              <p>刃角参数表</p>
              <h2>完工参数（按本次排程）</h2>
            </div>
          </div>
          <ParamTable orders={draft} />
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>历史记录</p>
              <h2>客户维护历史</h2>
            </div>
          </div>
          <History orders={draft} />
        </section>
      </section>

      {formOpen && <OrderForm onCreate={addOrder} onClose={() => setFormOpen(false)} />}
    </main>
  );
}
