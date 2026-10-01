import { useState } from "react";
import type {
  BoardType,
  NewOrderInput,
  WaxType,
} from "../lib/types";

const BOARD_TYPES: BoardType[] = ["全地域", "公园板", "竞速板", "粉雪板"];
const WAX_TYPES: WaxType[] = ["低温蜡", "温蜡", "含氟蜡", "不打蜡"];

/** 底板可标记区域（按百分比坐标定位） */
const SPOTS: Array<{ id: string; x: number; y: number }> = [
  { id: "板头", x: 50, y: 10 },
  { id: "左刃头", x: 28, y: 26 },
  { id: "右刃头", x: 72, y: 26 },
  { id: "固定器区", x: 50, y: 46 },
  { id: "中部", x: 50, y: 66 },
  { id: "左刃尾", x: 28, y: 82 },
  { id: "右刃尾", x: 72, y: 82 },
  { id: "板尾", x: 50, y: 92 },
];

interface Props {
  onCreate: (input: NewOrderInput) => void;
}

export function NewOrderForm({ onCreate }: Props) {
  const [customer, setCustomer] = useState("");
  const [brand, setBrand] = useState("");
  const [lengthCm, setLengthCm] = useState(156);
  const [boardType, setBoardType] = useState<BoardType>("全地域");
  const [sideAngle, setSideAngle] = useState(88);
  const [baseAngle, setBaseAngle] = useState(1);
  const [waxType, setWaxType] = useState<WaxType>("低温蜡");
  const [needsBaseRepair, setNeedsBaseRepair] = useState(false);
  const [damageDesc, setDamageDesc] = useState("");
  const [repairSpots, setRepairSpots] = useState<string[]>([]);
  const [preference, setPreference] = useState("");
  const [rush, setRush] = useState(false);
  const [promiseClock, setPromiseClock] = useState("18:00");

  const toggleSpot = (id: string) =>
    setRepairSpots((spots) =>
      spots.includes(id) ? spots.filter((s) => s !== id) : [...spots, id]
    );

  const submit = () => {
    if (!customer.trim() || !brand.trim()) return;
    const [h, m] = promiseClock.split(":").map(Number);
    onCreate({
      customer: customer.trim(),
      brand: brand.trim(),
      lengthCm,
      boardType,
      sideAngle,
      baseAngle,
      waxType,
      needsBaseRepair,
      damageDesc: needsBaseRepair ? damageDesc.trim() || "底板待检" : "无",
      repairSpots: needsBaseRepair ? repairSpots : [],
      preference: preference.trim(),
      rush,
      originalPromiseMin: h * 60 + m,
    });
    setCustomer("");
    setBrand("");
    setDamageDesc("");
    setRepairSpots([]);
    setPreference("");
    setRush(false);
    setNeedsBaseRepair(false);
  };

  return (
    <div className="new-form">
      <div className="form-row">
        <label>
          <span>客户</span>
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="客户姓名"
          />
        </label>
        <label>
          <span>雪板品牌 / 型号</span>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="如 Burton Custom 156"
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          <span>长度 (cm)</span>
          <input
            type="number"
            value={lengthCm}
            min={120}
            max={210}
            onChange={(e) => setLengthCm(Number(e.target.value))}
          />
        </label>
        <label>
          <span>板型</span>
          <select
            value={boardType}
            onChange={(e) => setBoardType(e.target.value as BoardType)}
          >
            {BOARD_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>打蜡类型</span>
          <select
            value={waxType}
            onChange={(e) => setWaxType(e.target.value as WaxType)}
          >
            {WAX_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row">
        <label>
          <span>侧刃角度 {sideAngle}°</span>
          <input
            type="range"
            min={85}
            max={90}
            step={1}
            value={sideAngle}
            onChange={(e) => setSideAngle(Number(e.target.value))}
          />
        </label>
        <label>
          <span>底刃角度 {baseAngle}°</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.5}
            value={baseAngle}
            onChange={(e) => setBaseAngle(Number(e.target.value))}
          />
        </label>
        <label>
          <span>期望承诺时间</span>
          <input
            type="time"
            value={promiseClock}
            onChange={(e) => setPromiseClock(e.target.value)}
          />
        </label>
      </div>

      <label className="switch-line">
        <input
          type="checkbox"
          checked={needsBaseRepair}
          onChange={(e) => setNeedsBaseRepair(e.target.checked)}
        />
        <span>需要底板修补（占用唯一专用工位）</span>
      </label>

      {needsBaseRepair && (
        <div className="damage-zone">
          <div className="board-marker">
            <div className="board-shape">
              {SPOTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`spot ${repairSpots.includes(s.id) ? "on" : ""}`}
                  style={{ left: `${s.x}%`, top: `${s.y}%` }}
                  onClick={() => toggleSpot(s.id)}
                  title={s.id}
                >
                  {s.id}
                </button>
              ))}
            </div>
            <small>点击标记底板损伤位置</small>
          </div>
          <label className="damage-desc">
            <span>损伤描述</span>
            <textarea
              value={damageDesc}
              onChange={(e) => setDamageDesc(e.target.value)}
              placeholder="如 纵向划痕 12cm、板底烧板两处"
              rows={3}
            />
            <span className="spot-chips">
              {repairSpots.length ? repairSpots.join("、") : "尚未标记位置"}
            </span>
          </label>
        </div>
      )}

      <label>
        <span>客户偏好</span>
        <input
          value={preference}
          onChange={(e) => setPreference(e.target.value)}
          placeholder="如 弱咬雪、竞速调校"
        />
      </label>

      <div className="form-actions">
        <label className="switch-line">
          <input
            type="checkbox"
            checked={rush}
            onChange={(e) => setRush(e.target.checked)}
          />
          <span>加急单（插入队首，重算后续）</span>
        </label>
        <button
          className="primary"
          disabled={!customer.trim() || !brand.trim()}
          onClick={submit}
        >
          加入可重排队列
        </button>
      </div>
    </div>
  );
}
