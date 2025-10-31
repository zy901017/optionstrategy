"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import "./globals.css";

type Trend = "Up" | "Sideways" | "Down";

type Inputs = {
  trend: Trend;
  earningsDays?: number;
  totalIvRank: number;   // 总体 IV Rank (0-100)
  termIvNear: number;    // 近月 ATM/到期行右侧 IV（%）
  termIvFar: number;     // 远月 ATM/到期行右侧 IV（%）
  buyDelta: number;
  sellDelta: number;
  buyTheta: number;
  sellTheta: number;
  sellDTE?: number;
};

type StrategyResult = {
  side: "Call" | "Put" | "Neutral";
  name: string;
  score: number;
  advice: "open" | "small" | "wait";
  netDelta: number;
  netTheta: number;
  ivStructDiff: number;   // termIvNear - termIvFar
  warnings: string[];
  adjustments: string[];
  strikeGuide?: {
    longDeltaRange?: [number, number];
    shortDeltaRange?: [number, number];
    note?: string;
  };
  explanation: string;
};

const example: Inputs = {
  trend: "Up",
  earningsDays: 10,
  totalIvRank: 70,
  termIvNear: 37.34,
  termIvFar: 28.47,
  buyDelta: 0.8,
  sellDelta: 0.25,
  buyTheta: -0.04,
  sellTheta: 0.09,
  sellDTE: 21
};

function num(n:any, d=0) { const v = typeof n === "number" ? n : parseFloat(n); return Number.isFinite(v)?v:d; }

function computeStrategy(i: Inputs): StrategyResult {
  const netDelta = num(i.buyDelta) + num(i.sellDelta);
  const netTheta = num(i.buyTheta) + num(i.sellTheta);
  const ivStructDiff = num(i.termIvNear) - num(i.termIvFar); // 关键改动
  const sellDTE = num(i.sellDTE, 999);
  const sellDeltaAbs = Math.abs(num(i.sellDelta));

  // 评分：趋势(30) + Δ(25) + Θ(25) + 结构(20)
  let score = 0;
  if (i.trend === "Up") score += 30;
  else if (i.trend === "Sideways") score += 20;
  else score += 10;

  if (netDelta > 0) score += 25;
  if (netTheta > 0) score += 25;
  if (ivStructDiff > 0) score += 20;

  // 财报前高 IV（用总 IV Rank）降权
  if (num(i.earningsDays, 999) <= 5 && i.totalIvRank > 70) score -= 15;

  // 端别
  let side: StrategyResult["side"] = "Neutral";
  if (i.trend === "Up") side = "Call";
  else if (i.trend === "Sideways") side = "Put";
  else side = "Neutral";

  // 策略
  let name = "等待 / 结构不理想";
  if (i.trend === "Up" && netDelta > 0 && netTheta > 0 && ivStructDiff > 0) {
    name = "PMCC / Call Diagonal";
  } else if (i.trend === "Sideways" && netTheta > 0 && ivStructDiff > 0) {
    name = "Put Diagonal";
  } else if (i.trend === "Down" && netTheta > 0) {
    name = "Bear Call Spread";
    side = "Call";
  }

  // 建议
  let advice: StrategyResult["advice"] = "wait";
  if (score >= 80) advice = "open";
  else if (score >= 60) advice = "small";

  // 警告
  const warnings: string[] = [];
  if (ivStructDiff <= 0) warnings.push("Diagonal 结构警告：近月 IV ≤ 远月 IV，卖近买远不占优。");
  if (netTheta <= 0) warnings.push("Theta 为负：时间在耗损，建议提高近月卖腿 Δ 或缩短 DTE。");
  if (num(i.earningsDays, 999) <= 5 && i.totalIvRank > 70) warnings.push("财报临近且总 IV Rank 高：小仓或等待 IV Crush。");

  // Δ区间
  const strikeGuide: StrategyResult["strikeGuide"] = {};
  if (name === "PMCC / Call Diagonal") {
    strikeGuide.longDeltaRange = [0.75, 0.85];
    strikeGuide.shortDeltaRange = [0.20, 0.35];
    strikeGuide.note = "目标净Δ≈0.35–0.65；远月买深价内（Δ≈0.8），近月卖价外（Δ≈0.25–0.35）。";
  } else if (name === "Put Diagonal") {
    strikeGuide.longDeltaRange = [-0.45, -0.25];
    strikeGuide.shortDeltaRange = [-0.35, -0.20];
    strikeGuide.note = "目标净Δ≈-0.15～+0.15，净Θ>0；若净Δ偏负，上移卖腿（绝对Δ变小）。";
  } else if (name === "Bear Call Spread") {
    strikeGuide.shortDeltaRange = [0.20, 0.35];
    strikeGuide.note = "近月上方阻力附近卖 Call（Δ≈0.25），买更价外 Call 做保护；7–20 DTE Θ 收益快。";
  }

  // 调整提示
  const adjustments: string[] = [];
  if ((name === "PMCC / Call Diagonal" || name === "Put Diagonal") && sellDeltaAbs > 0.45) {
    adjustments.push("短腿 Δ > 0.45：考虑 roll up（抬高行权价）或 roll out（延长到期）。");
  }
  if (sellDTE <= 10 && sellDeltaAbs < 0.15) {
    adjustments.push("短腿 DTE ≤ 10 且 Δ < 0.15：提前回补，卖下一期（锁定剩余 Θ）。");
  }
  if (name === "PMCC / Call Diagonal") {
    if (netDelta < 0.35) adjustments.push("净Δ<0.35：买腿更 ITM 或卖腿更 OTM。");
    else if (netDelta > 0.65) adjustments.push("净Δ>0.65：卖腿略靠近 ATM 或买腿更远。");
  } else if (name === "Put Diagonal") {
    if (netDelta < -0.15) adjustments.push("净Δ<-0.15：上移卖腿或买腿更接近 ATM。");
    else if (netDelta > 0.15) adjustments.push("净Δ>+0.15：下移卖腿或买腿更远 OTM。");
  }
  if (netTheta <= 0.01) adjustments.push("净Θ较弱：缩短卖腿 DTE（15–30 天）、卖腿靠近 ATM（Δ≈0.25–0.35），或在更高 IV 再开。");

  const explanation =
    `趋势:${i.trend}；净Δ=${netDelta.toFixed(2)}；净Θ=${netTheta.toFixed(2)}；`+
    `IV结构差(近-远)=${ivStructDiff.toFixed(2)}%；总IVR=${i.totalIvRank.toFixed(0)}；`+
    `评分=${score.toFixed(0)} → 策略：${name}` + (warnings.length?`；⚠️ ${warnings.join(" / ")}`:"");

  return { side, name, score, advice, netDelta, netTheta, ivStructDiff, warnings, adjustments, strikeGuide, explanation };
}

export default function Page() {
  const [inputs, setInputs] = useState<Inputs>(example);
  const result = useMemo(() => computeStrategy(inputs), [inputs]);

  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setInputs(prev => ({ ...prev, [k]: e.target.value === "" ? "" : (k === "trend" ? e.target.value : Number(e.target.value)) }) as any);

  const badgeClass = clsx("badge", {
    ok: result.advice === "open",
    warn: result.advice === "small",
    danger: result.advice === "wait"
  });

  return (
    <div className="wrapper">
      <h1>🧠 Option Strategy Dashboard v2</h1>
      <p className="small">IV 结构使用：到期行右侧的 IV（近月 − 远月）；总 IV Rank 用于环境判断。</p>

      <div className="grid">
        <div className="card">
          <h2>① 输入</h2>

          <div className="row">
            <div>
              <label>趋势方向</label>
              <select value={inputs.trend} onChange={set("trend")}>
                <option value="Up">Up（上涨）</option>
                <option value="Sideways">Sideways（横盘）</option>
                <option value="Down">Down（下跌）</option>
              </select>
            </div>
            <div>
              <label>财报天数（可留空）</label>
              <input type="number" value={inputs.earningsDays ?? ""} onChange={set("earningsDays")} />
            </div>
          </div>

          <div className="row">
            <div>
              <label>近月到期 IV（%）</label>
              <input type="number" step="0.01" value={inputs.termIvNear} onChange={set("termIvNear")} />
            </div>
            <div>
              <label>远月到期 IV（%）</label>
              <input type="number" step="0.01" value={inputs.termIvFar} onChange={set("termIvFar")} />
            </div>
          </div>

          <div className="row">
            <div>
              <label>总 IV Rank（0-100）</label>
              <input type="number" value={inputs.totalIvRank} onChange={set("totalIvRank")} />
            </div>
            <div>
              <label>近月卖腿剩余天数（DTE）</label>
              <input type="number" value={inputs.sellDTE ?? ""} onChange={set("sellDTE")} />
            </div>
          </div>

          <div className="row">
            <div>
              <label>买腿 Delta（远月，原样）</label>
              <input type="number" step="0.01" value={inputs.buyDelta} onChange={set("buyDelta")} />
            </div>
            <div>
              <label>卖腿 Delta（近月，原样）</label>
              <input type="number" step="0.01" value={inputs.sellDelta} onChange={set("sellDelta")} />
            </div>
          </div>

          <div className="row">
            <div>
              <label>买腿 Theta（远月，原样）</label>
              <input type="number" step="0.01" value={inputs.buyTheta} onChange={set("buyTheta")} />
            </div>
            <div>
              <label>卖腿 Theta（近月，原样）</label>
              <input type="number" step="0.01" value={inputs.sellTheta} onChange={set("sellTheta")} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={() => setInputs(example)}>填充示例</button>
            <button onClick={() => setInputs({
              trend: "Sideways", earningsDays: 3, totalIvRank: 55,
              termIvNear: 31.2, termIvFar: 29.0,
              buyDelta: -0.30, sellDelta: -0.28, buyTheta: -0.03, sellTheta: 0.08, sellDTE: 12
            })}>横盘示例</button>
            <button onClick={() => setInputs({
              trend: "Down", earningsDays: 7, totalIvRank: 72,
              termIvNear: 34.5, termIvFar: 33.8,
              buyDelta: 0.00, sellDelta: 0.28, buyTheta: 0.00, sellTheta: 0.10, sellDTE: 9
            })}>下跌示例</button>
          </div>
        </div>

        <div className="card">
          <h2>② 输出</h2>
          <p>推荐端别：<strong>{result.side}</strong></p>
          <p>推荐策略：<span className={badgeClass}>{result.name}</span></p>
          <p>开仓建议：<span className={badgeClass}>
            {result.advice === "open" ? "✅ 强势开仓" : result.advice === "small" ? "⚙️ 小仓观察" : "⚠️ 等待结构修复"}
          </span></p>
          <p>评分：<strong>{result.score.toFixed(0)}</strong> / 100</p>
          <p>净 Delta：<strong>{result.netDelta.toFixed(2)}</strong></p>
          <p>净 Theta：<strong>{result.netTheta.toFixed(2)}</strong></p>
          <p>IV 结构差（近-远）：<strong>{result.ivStructDiff.toFixed(2)}%</strong></p>
          <p>总 IV Rank：<strong>{inputs.totalIvRank.toFixed(0)}</strong></p>

          {result.strikeGuide && (
            <>
              <h3 style={{ marginTop: 10 }}>行权 Δ 区间建议</h3>
              {result.strikeGuide.longDeltaRange && (
                <p>买腿 Δ ≈ <strong>{result.strikeGuide.longDeltaRange[0]}</strong> ~ <strong>{result.strikeGuide.longDeltaRange[1]}</strong></p>
              )}
              {result.strikeGuide.shortDeltaRange && (
                <p>卖腿 Δ ≈ <strong>{result.strikeGuide.shortDeltaRange[0]}</strong> ~ <strong>{result.strikeGuide.shortDeltaRange[1]}</strong></p>
              )}
              {result.strikeGuide.note && <p className="small">说明：{result.strikeGuide.note}</p>}
            </>
          )}

          {result.warnings.length > 0 && (
            <>
              <h3 style={{ marginTop: 10 }}>⚠️ 风险提示</h3>
              <ul>{result.warnings.map((w,i)=><li key={i} className="small">{w}</li>)}</ul>
            </>
          )}

          {result.adjustments.length > 0 && (
            <>
              <h3 style={{ marginTop: 10 }}>🔧 调整提示</h3>
              <ul>{result.adjustments.map((a,i)=><li key={i} className="small">{a}</li>)}</ul>
            </>
          )}

          <label style={{ marginTop: 8 }}>解释</label>
          <textarea readOnly value={result.explanation} />
        </div>
      </div>
    </div>
  );
}
