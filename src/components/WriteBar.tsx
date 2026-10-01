import type { WriteState } from "../types";

interface Props {
  hasChanges: boolean;
  writeState: WriteState;
  onChangeCount: number;
  onUndo: () => void;
  onCommit: () => void;
}

export default function WriteBar({
  hasChanges,
  writeState,
  onChangeCount,
  onUndo,
  onCommit,
}: Props) {
  return (
    <div className={`write-bar write-${writeState}`}>
      <div className="write-status">
        {writeState === "idle" && !hasChanges && (
          <>
            <span className="dot dot-ok" />
            <span>排程已确认，写入上次成功。</span>
          </>
        )}
        {writeState === "idle" && hasChanges && (
          <>
            <span className="dot dot-dirty" />
            <span>
              有 {onChangeCount} 处排程更改尚未写入（加急 / 重排 / 完工）。
            </span>
          </>
        )}
        {writeState === "writing" && (
          <>
            <span className="dot dot-writing" />
            <span>正在写入排程…</span>
          </>
        )}
        {writeState === "error" && (
          <>
            <span className="dot dot-error" />
            <span>写入失败：已保留本次排程，可从这里继续重试。</span>
          </>
        )}
      </div>
      <div className="write-actions">
        <button onClick={onUndo} disabled={writeState === "writing" || !hasChanges}>
          撤销
        </button>
        {writeState === "error" ? (
          <button className="primary" onClick={onCommit}>
            重试写入
          </button>
        ) : (
          <button
            className="primary"
            onClick={onCommit}
            disabled={writeState === "writing" || !hasChanges}
          >
            {writeState === "writing" ? "写入中…" : "确认写入"}
          </button>
        )}
      </div>
    </div>
  );
}
