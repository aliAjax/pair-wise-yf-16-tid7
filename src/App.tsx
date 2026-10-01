import { useScheduleBoard } from "./lib/useScheduleBoard";
import { fmtTime } from "./lib/seed";
import { GanttChart } from "./components/GanttChart";
import { QueuePanel } from "./components/QueuePanel";
import { NewOrderForm } from "./components/NewOrderForm";
import { ParamsTable } from "./components/ParamsTable";
import { HistoryPanel } from "./components/HistoryPanel";

function App() {
  const api = useScheduleBoard();
  const {
    confirmed,
    draft,
    schedule,
    dirty,
    writePending,
    notice,
    pending,
    selectIds,
  } = api;

  const activeCount = draft.queue.length;
  const doneToday = draft.orders.filter(
    (o) =>
      schedule.ops.some((op) => op.orderId === o.id) &&
      (schedule.finish[o.id] ?? Infinity) <= draft.now
  ).length;
  const rushCount = draft.queue.filter(
    (id) => draft.orders.find((o) => o.id === id)?.rush
  ).length;
  const baseBusy = draft.now < 9 * 60 + 30; // ORD-112 修补占用到 09:30

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62004 · 滑雪板调校维护工作台</p>
        <h1>维护工单 · 底板修补 · 完工排程</h1>
        <span>
          一份可重排队列：打蜡 / 修边双工位并行，底板修补仅 1 个专用工位；加急插入后重算后续完工，
          已开始 / 已承诺工单保留原时段；确认后写入，失败可从断点继续，撤销恢复上次确认状态。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>当前时间</small>
          <strong>{fmtTime(draft.now)}</strong>
        </article>
        <article>
          <small>可重排队列</small>
          <strong>{activeCount}</strong>
        </article>
        <article>
          <small>已完工（今日）</small>
          <strong>{doneToday}</strong>
        </article>
        <article>
          <small>加急 / 底板工位</small>
          <strong>
            {rushCount} / {baseBusy ? "占用中" : "空闲"}
          </strong>
        </article>
      </section>

      <section className="panel toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">工作台时钟</span>
          {[15, 30, 60, 120].map((d) => (
            <button key={d} onClick={() => api.advance(d)} disabled={writePending}>
              推进 {d} 分钟
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <span className="toolbar-label">排程</span>
          <button
            className="primary"
            onClick={api.commitSelected}
            disabled={writePending || selectIds.length === 0}
            title="把勾选工单的当前排程作为承诺锁定"
          >
            确认排程（{selectIds.length}）
          </button>
          <button onClick={api.undo} disabled={!dirty && !writePending}>
            撤销到上次确认 v{confirmed.version}
          </button>
        </div>
        <div className="toolbar-group fault">
          <span className="toolbar-label">故障演练</span>
          {[1, 2, 0].map((n) => (
            <button
              key={n}
              className={n > 0 && api.failuresLeft === n ? "chip-on" : ""}
              onClick={() => api.armFailures(n)}
            >
              {n === 0 ? "清除注入" : `注入${n}次失败`}
            </button>
          ))}
          <button onClick={api.resetDemo}>重置演示</button>
        </div>
      </section>

      {notice && <div className={`notice notice-${notice.kind}`}>{notice.text}</div>}
      {pending && (
        <div className="notice notice-error pending-bar">
          <span>
            上次确认（v{pending.version} · {pending.label}）写入失败：第{" "}
            {pending.failedChunk}/{pending.total} 块，{pending.error}
          </span>
          <button className="primary" onClick={api.retryFlush}>
            从第 {pending.failedChunk} 块继续重试
          </button>
        </div>
      )}

      <section className="panel">
        <div className="heading">
          <div>
            <p>工位占用</p>
            <h2>完工排程 · 工位甘特图</h2>
          </div>
          <span className="version-tag">
            {dirty ? "草稿（未确认）" : `已确认 v${schedule.version}`}
          </span>
        </div>
        <GanttChart schedule={schedule} state={draft} />
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="heading">
            <div>
              <p>可重排队列</p>
              <h2>维护工单</h2>
            </div>
            <div className="mini-actions">
              <button onClick={() => api.selectAll(true)}>全选</button>
              <button onClick={() => api.selectAll(false)}>清空</button>
            </div>
          </div>
          <QueuePanel
            state={draft}
            schedule={schedule}
            selectIds={selectIds}
            onToggleSelect={api.toggleSelect}
            onToggleRush={api.setRush}
          />
        </section>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>新工单</p>
              <h2>登记维护需求</h2>
            </div>
          </div>
          <NewOrderForm onCreate={api.addNew} />
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>刃角参数表</p>
            <h2>工单参数与状态筛选</h2>
          </div>
        </div>
        <ParamsTable state={draft} schedule={schedule} />
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>完工联动</p>
            <h2>客户历史维护记录</h2>
          </div>
        </div>
        <HistoryPanel state={draft} schedule={schedule} />
      </section>

      <footer className="foot">
        底板修补工位容量 1 · 修边 / 打蜡工位容量 2 · 默认工序时长 修补 90′ / 修边 40′ / 打蜡 30′
      </footer>
    </main>
  );
}

export default App;
