import { useCallback, useMemo, useRef, useState } from "react";
import type { NewOrderInput, Schedule, StoreState } from "./types";
import {
  addOrder,
  advanceTime,
  commitOrders,
  recompute,
  toggleRush,
  type ActionReport,
} from "./actions";
import {
  ChunkedStore,
  createLocalBackend,
  type FlushResult,
} from "./store";
import { createSeedState } from "./seed";

export interface Notice {
  kind: "info" | "success" | "warn" | "error";
  text: string;
}

export interface PendingInfo {
  version: number;
  failedChunk: number;
  total: number;
  error: string;
  label: string;
}

export interface BoardApi {
  confirmed: StoreState;
  draft: StoreState;
  schedule: Schedule;
  confirmedSchedule: Schedule;
  /** 草稿是否有未确认改动 */
  dirty: boolean;
  /** 是否存在写入失败、等待续传的确认 */
  writePending: boolean;
  notice: Notice | null;
  pending: PendingInfo | null;
  selectIds: string[];
  toggleSelect: (id: string) => void;
  selectAll: (on: boolean) => void;
  addNew: (input: NewOrderInput) => void;
  setRush: (id: string) => void;
  commitSelected: () => void;
  advance: (deltaMin: number) => void;
  undo: () => void;
  retryFlush: () => void;
  armFailures: (n: number) => void;
  failuresLeft: number;
  resetDemo: () => void;
}

type LocalBackend = ReturnType<typeof createLocalBackend>;

function loadInitial(store: ChunkedStore<StoreState>): StoreState {
  return store.load()?.state ?? createSeedState();
}

export function useScheduleBoard(): BoardApi {
  const backendRef = useRef<LocalBackend | null>(null);
  if (backendRef.current === null) {
    backendRef.current = createLocalBackend();
  }
  const storeRef = useRef<ChunkedStore<StoreState> | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new ChunkedStore<StoreState>(backendRef.current);
  }

  const [confirmed, setConfirmed] = useState<StoreState>(() =>
    loadInitial(storeRef.current!)
  );
  const [draft, setDraft] = useState<StoreState>(confirmed);
  const [pending, setPending] = useState<PendingInfo | null>(null);
  // 等待落盘的“下一版状态”：写入成功后才提交为确认态
  const pendingStateRef = useRef<StoreState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(
    storeRef.current.load()
      ? { kind: "info", text: "已从本地存储恢复上次确认状态" }
      : { kind: "info", text: "演示数据已就绪：调队列、插加急后点“确认排程”" }
  );
  const [selectIds, setSelectIds] = useState<string[]>([]);
  const [failuresLeft, setFailuresLeft] = useState(0);

  const schedule = useMemo(() => recompute(draft), [draft]);
  const confirmedSchedule = useMemo(() => recompute(confirmed), [confirmed]);
  const dirty = confirmed !== draft;
  const writePending = pending !== null;

  /** 确认动作统一入口：先存，成功才更新确认态与草稿；失败保留快照等续传 */
  const confirmAction = useCallback(
    (report: ActionReport, label: string) => {
      if (pendingStateRef.current) {
        setNotice({
          kind: "warn",
          text: "上一笔确认写入尚未完成，请先“继续重试”或“撤销”",
        });
        return;
      }
      if (report.state.version === draft.version) {
        setNotice({ kind: "info", text: "没有需要确认的变化" });
        return;
      }
      pendingStateRef.current = report.state;
      const result: FlushResult = storeRef.current!.save(
        report.state,
        report.state.version
      );
      if (result.ok) {
        pendingStateRef.current = null;
        setConfirmed(report.state);
        setDraft(report.state);
        setSelectIds((ids) => ids.filter((id) => report.state.queue.includes(id)));
        setPending(null);
        setNotice({
          kind: "success",
          text: `${label}（已写入，排程版本 v${report.state.version}）`,
        });
      } else {
        setPending({
          version: report.state.version,
          failedChunk: result.failedChunk,
          total: result.total,
          error: result.error,
          label,
        });
        // 写入失败：界面不应用新状态，仍显示上次确认内容
        setNotice({
          kind: "error",
          text: `写入失败于第 ${result.failedChunk}/${result.total} 块：${result.error}。已保留上次确认状态，可从该块继续重试。`,
        });
      }
    },
    [draft.version]
  );

  const commitSelected = useCallback(() => {
    const targets = selectIds.filter((id) => draft.queue.includes(id));
    if (targets.length === 0) {
      setNotice({ kind: "warn", text: "请先在队列里勾选要给出承诺的工单" });
      return;
    }
    const report = commitOrders(draft, targets, schedule);
    confirmAction(report, `已承诺 ${targets.length} 张工单并锁定时段`);
  }, [confirmAction, draft, schedule, selectIds]);

  const advance = useCallback(
    (deltaMin: number) => {
      const report = advanceTime(draft, deltaMin, schedule);
      const parts: string[] = [];
      if (report.started.length) parts.push(`开工 ${report.started.length} 张`);
      if (report.finished.length) parts.push(`完工 ${report.finished.length} 张`);
      confirmAction(
        report,
        `时间推进 ${deltaMin} 分钟${parts.length ? `，${parts.join("、")}` : ""}`
      );
    },
    [confirmAction, draft, schedule]
  );

  const retryFlush = useCallback(() => {
    const waiting = pendingStateRef.current;
    if (!waiting) return;
    const result = storeRef.current!.retry();
    if (result.ok) {
      const label = pending?.label ?? "确认完成";
      pendingStateRef.current = null;
      setConfirmed(waiting);
      setDraft(waiting);
      setSelectIds((ids) => ids.filter((id) => waiting.queue.includes(id)));
      setPending(null);
      setFailuresLeft(backendRef.current!.failuresLeft());
      setNotice({
        kind: "success",
        text: `从失败块继续写入成功：${label}（v${waiting.version}）`,
      });
    } else {
      setPending((p) =>
        p
          ? {
              ...p,
              failedChunk: result.failedChunk,
              total: result.total,
              error: result.error,
            }
          : p
      );
      setNotice({
        kind: "error",
        text: `仍失败于第 ${result.failedChunk}/${result.total} 块：${result.error}`,
      });
    }
  }, [pending]);

  /** 撤销：丢弃草稿，连同未完成写入一起回滚到上次确认状态 */
  const undo = useCallback(() => {
    storeRef.current!.abortPending();
    pendingStateRef.current = null;
    setPending(null);
    setFailuresLeft(backendRef.current!.failuresLeft());
    setDraft(confirmed);
    setSelectIds([]);
    setNotice({
      kind: "info",
      text: `已撤销，恢复到上次确认状态（v${confirmed.version}）`,
    });
  }, [confirmed]);

  const addNew = useCallback(
    (input: NewOrderInput) => {
      setDraft(addOrder(draft, input));
      setNotice({
        kind: "info",
        text: input.rush
          ? "加急单已插到队首，后续完工时间已重算，确认后锁定承诺"
          : "工单已加入可重排队列，确认排程后给出承诺",
      });
    },
    [draft]
  );

  const setRush = useCallback(
    (id: string) => {
      setDraft(toggleRush(draft, id));
      setNotice({ kind: "info", text: "加急标记已切换，后续完工时间已重算" });
    },
    [draft]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }, []);

  const selectAll = useCallback(
    (on: boolean) => setSelectIds(on ? [...draft.queue] : []),
    [draft.queue]
  );

  const armFailures = useCallback((n: number) => {
    backendRef.current!.armFailures(n);
    setFailuresLeft(n);
    setNotice({
      kind: "warn",
      text: n > 0 ? `已注入 ${n} 次写入故障，下次确认会停在故障块` : "已清除故障注入",
    });
  }, []);

  const resetDemo = useCallback(() => {
    storeRef.current!.reset();
    const fresh = createSeedState();
    pendingStateRef.current = null;
    setConfirmed(fresh);
    setDraft(fresh);
    setSelectIds([]);
    setPending(null);
    setFailuresLeft(0);
    backendRef.current!.armFailures(0);
    setNotice({ kind: "info", text: "已重置为初始演示数据" });
  }, []);

  return {
    confirmed,
    draft,
    schedule,
    confirmedSchedule,
    dirty,
    writePending,
    notice,
    pending,
    selectIds,
    toggleSelect,
    selectAll,
    addNew,
    setRush,
    commitSelected,
    advance,
    undo,
    retryFlush,
    armFailures,
    failuresLeft,
    resetDemo,
  };
}
