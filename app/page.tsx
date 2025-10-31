"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import "./globals.css";

type Trend = "Up" | "Sideways" | "Down";

type Inputs = {
  trend: Trend;
  earningsDays?: number;
  ivNearRank: number;
  ivFarRank: number;
  buyDelta: number;   // 远月腿 Δ（原样）
  sellDelta: number;  // 近月腿 Δ（原样）
  buyTheta: number;   // 远月腿 Θ（原样）
  sellTheta: number;  // 近月腿 Θ（原样）
  priceNear?: number;
  priceFar?: number;
  sellDTE?: number;   // 近月卖腿剩余天数（用于“提前回补/滚动”判断）
};

type StrategyResult = {
  side: "Call" | "Put" | "Neutral";
  name: string;              // 策略名
  score: number;             // 0-100
  advice: "open" | "small" | "wait";
  netDelta: number;
  netTheta: number;
  ivDiff: number;            // 近 - 远（IV Rank）
  warnings: string[];
  adjustments: string[];     // 调整提示（roll / 提前回补 / 净Δ修正）
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
  ivNearRank: 70,
  ivFarRank: 40,
  buyDelta: 0.8,
  sellDelta: 0.25,
  buyTheta: -0.04,
  sellTheta: 0.09,
  priceNear: 205,
  priceFar: 207,
  sellDTE: 21
};

function toNumber(n: any, def = 0) {
  const v = typeof n === "number" ? n : parseFloat(n);
  return Number.isFinite(v) ? v : def;
}

function computeStrategy(i: Inputs): StrategyResult {
  const netDelta = toNumber(i.buyDelta) + toNumber(i.sellDelta);
  const netTheta = toNumber(i.buyTheta) + toNumber(i.sellTheta);
  const ivDiff = toNumber(i.ivNearRank) - toNumber(i.ivFarRank);
  const sellDTE = toNumber(i.sellDTE, 999);
  const sellDeltaAbs = Math.abs(toNumber(i.sellDelta));

  // 评分：趋势(30) + Δ(25) + Θ(25) + IV结构(20)
  let score = 0;
  if (i.trend === "Up") score += 30;
  else if (i.trend === "Sideways") score += 20;
  else score += 10;

  if (netDelta > 0) score += 25;
  if (netTheta > 0) score += 25;
  if (ivDiff > 0) score += 20;

  // 财报前高IV降权
  if (toNumber(i.earningsDays, 999) <= 5 && i.ivNearRank > 70) score -= 15;

  // 端别自动选择
  let side: StrategyResult["side"] = "Neutral";
  if (i.trend === "Up") side = "Call";
  else if (i.trend === "Sideways") side = "Put";
  else side = "Neutral";

  // 策略判定
  let name = "等待 / 结构不理想";
  if (i.trend === "Up" && netDelta > 0 && netTheta > 0 && ivDiff > 0) {
    name = "PMCC / Call Diagonal";
  } else if (i.trend === "Sideways" && netTheta > 0 && ivDiff > 0) {
    name = "Put Diagonal";
  } else if (i.trend === "Down" && netTheta > 0) {
    name = "Bear Call Spread";
    side = "Call";
  }

  // 开仓建议
  let advice: StrategyResult["advice"] = "wait";
  if (score >= 80) advice = "open";
  else if (score >= 60) advice = "small";

  // 警告
  const warnings: string[] = [];
  if (ivDiff <= 0) warnings.push("Diagonal 结构警告：远月 IV Rank ≥ 近月，买贵卖便宜，不宜做 Diagonal/PMCC。");
  if (netTheta <= 0) warnings.push("Theta 为负：时间在耗损，考虑提高近月卖腿价外程度或缩短卖腿 DTE。");
  if (toNumber(i.earningsDays, 999) <= 5 && i.ivNearRank > 70) {
    warnings.push("临近财报且近月 IV Rank 很高：小仓或等待 IV Crush 后再建买方腿。");
  }

  // 行权Δ建议（按策略类型）
  const strikeGuide: StrategyResult["strikeGuide"] = {};
  if (name === "PMCC / Call Diagonal") {
    strikeGuide.longDeltaRange = [0.75, 0.85];
    strikeGuide.shortDeltaRange = [0.20, 0.35];
    strikeGuide.note = "目标净Δ≈0.35–0.65；远月买深价内（Δ≈0.8），近月卖价外（Δ≈0.25–0.35）。";
  } else if (name === "Put Diagonal") {
    strikeGuide.longDeltaRange = [-0.45, -0.25];
    strikeGuide.shortDeltaRange = [-0.35, -0.20];
    strikeGuide.note = "目标净Δ≈-0.15～+0.15，净Θ>0；若净Δ偏负，适当上移卖腿（绝对Δ变小）。";
  } else if (name === "Bear Call Spread") {
    strikeGuide.shortDeltaRange = [0.20, 0.35];
    strikeGuide.note = "选择近月上方阻力附近卖出 Call（Δ≈0.25），买更价外 Call 做保护；7–20 天到期 Θ 收益更快。";
  }

  // 调整提示
  const adjustments: string[] = [];
  // 1) 卖腿 Δ 过高
  if ((name === "PMCC / Call Diagonal" || name === "Put Diagonal") && sellDeltaAbs > 0.45) {
    adjustments.push("短腿 Δ > 0.45：考虑 roll up（抬高行权价）或 roll out（延长到期），降低被触发概率。");
  }
  // 2) 卖腿 DTE 临近 & Δ 很小：提前回补
  if (sellDTE <= 10 && sellDeltaAbs < 0.15) {
    adjustments.push("短腿 DTE ≤ 10 且 Δ < 0.15：考虑提前买回，卖下一期（锁定剩余 Theta）。");
  }
  // 3) 净Δ偏离目标区间
  if (name === "PMCC / Call Diagonal") {
    if (netDelta < 0.35) {
      adjustments.push("净Δ低于 0.35：把买腿调得更 ITM（Δ↑）或把卖腿更 OTM（短腿 Δ↓），增强方向性。");
    } else if (netDelta > 0.65) {
      adjustments.push("净Δ高于 0.65：把卖腿略向 ATM 移动（短腿 Δ↑）或把买腿更远（Δ↓），降低方向暴露。");
    }
  } else if (name === "Put Diagonal") {
    if (netDelta < -0.15) {
      adjustments.push("净Δ < -0.15：上移卖腿（绝对Δ变小）或把买腿更接近 ATM，使净Δ回到 -0.15～+0.15。");
    } else if (netDelta > 0.15) {
      adjustments.push("净Δ > +0.15：下移卖腿（绝对Δ变大）或把买腿更远 OTM，使净Δ回到 -0.15～+0.15。");
    }
  }
  // 4) Theta 偏弱
  if (netTheta <= 0.01) {
    adjustments.push("净Θ较弱：缩短卖腿 DTE（15–30 天）、卖腿略靠近 ATM（Δ≈0.25–0.35），或等待高 IV 再开。");
  }

  const explanation =
    `趋势：${i.trend}；净Δ=${netDelta.toFixed(2)}；净Θ=${netTheta.toFixed(2)}；` +
    `IV结构差(近-远)=${ivDiff.toFixed(2)}；评分=${score.toFixed(0)} → 策略：${name}` +
    (warnings.length ? `；⚠️ 提示：${warnings.join(" / ")}` : "");

  return {
    side, name, score, advice, netDelta, netTheta, ivDiff,
    warnings, adjustments, strikeGuide, explanation
  };
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
      <h1>🧠 Option Strategy Decision Dashboard</h1>
      <p className="small">直接把券商期权链里的 Δ / Θ / IV Rank（含正负号）原样填入即可。</p>

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
              <label>近月 IV Rank</label>
              <input type="number" value={inputs.ivNearRank} onChange={set("ivNearRank")} />
            </div>
            <div>
              <label>远月 IV Rank</label>
              <input type="number" value={inputs.ivFarRank} onChange={set("ivFarRank")} />
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

          <div className="row">
            <div>
              <label>近月标的价格（可选）</label>
              <input type="number" value={inputs.priceNear ?? ""} onChange={set("priceNear")} />
            </div>
            <div>
              <label>远月标的价格（可选）</label>
              <input type="number" value={inputs.priceFar ?? ""} onChange={set("priceFar")} />
            </div>
          </div>

          <div className="row">
            <div>
              <label>近月卖腿剩余天数（DTE，建议填）</label>
              <input type="number" value={inputs.sellDTE ?? ""} onChange={set("sellDTE")} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={() => setInputs(example)}>填充示例</button>
            <button onClick={() => setInputs({
              trend: "Sideways", earningsDays: 3, ivNearRank: 65, ivFarRank: 40,
              buyDelta: -0.30, sellDelta: -0.28, buyTheta: -0.03, sellTheta: 0.08,
              priceNear: 205, priceFar: 206, sellDTE: 12
            })}>横盘示例</button>
            <button onClick={() => setInputs({
              trend: "Down", earningsDays: 7, ivNearRank: 72, ivFarRank: 60,
              buyDelta: 0.00, sellDelta: 0.28, buyTheta: 0.00, sellTheta: 0.10, sellDTE: 9
            })}>下跌示例</button>
          </div>
        </div>

        <div className="card">
          <h2>② 输出</h2>
          <p>推荐端别：<strong>{result.side}</strong></p>
          <p>推荐策略：<span className={badgeClass}>
            {result.name}
          </span></p>
          <p>开仓建议：<span className={badgeClass}>
            {result.advice === "open" ? "✅ 强势开仓" : result.advice === "small" ? "⚙️ 小仓观察" : "⚠️ 等待结构修复"}
          </span></p>
          <p>评分：<strong>{result.score.toFixed(0)}</strong> / 100</p>
          <p>净 Delta：<strong>{result.netDelta.toFixed(2)}</strong></p>
          <p>净 Theta：<strong>{result.netTheta.toFixed(2)}</strong></p>
          <p>IV 结构差（近-远）：<strong>{result.ivDiff.toFixed(2)}</strong></p>

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
              <ul>
                {result.warnings.map((w, idx) => <li key={idx} className="small">{w}</li>)}
              </ul>
            </>
          )}

          {result.adjustments.length > 0 && (
            <>
              <h3 style={{ marginTop: 10 }}>🔧 调整提示</h3>
              <ul>
                {result.adjustments.map((a, idx) => <li key={idx} className="small">{a}</li>)}
              </ul>
            </>
          )}

          <label style={{ marginTop: 8 }}>解释</label>
          <textarea readOnly value={result.explanation} />
        </div>
      </div>
    </div>
  );
}
