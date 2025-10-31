# Option Strategy Decision Dashboard

根据 **趋势 / IV Rank 结构 / Δ / Θ** 自动推荐：
- PMCC / Call Diagonal
- Put Diagonal
- Bear Call Spread / Neutral

并提供：
- 自动端别（Call / Put / Neutral）
- Δ≈0.8 / 0.3 行权区间建议（按策略）
- Diagonal 结构警告（远月 IVR ≥ 近月 IVR）
- 评分与开仓建议（≥80 开、60–79 小仓、<60 等待）
- 🔧 调整提示：卖腿 Δ 超阈值 roll、DTE 近回补、净Δ偏离修正、Θ 偏弱提升建议

## 本地运行
```bash
pnpm i # 或 npm i / yarn
pnpm dev # http://localhost:3000
```

## 部署到 Vercel
1) 将本项目推到 GitHub
2) Vercel → New Project → Import GitHub Repo → Framework 选择 Next.js → Deploy
3) （可选）后续添加 .env 并实现 /app/api/ibkr 与 /app/api/finnhub

## 输入说明（所见即所得）
- 买腿/卖腿的 **Delta / Theta** 按券商期权链“原样输入”（含正负号）
- IV Rank：近月与远月分别填（单位 %）
- 趋势方向：Up / Sideways / Down（可先用主观 + MA 判断）
- 财报天数：可选；若 ≤5 且近月 IVR>70，会降低评分并给风险提示

## 逻辑校验（关键断言）
- `netDelta = buyDelta + sellDelta`
- `netTheta = buyTheta + sellTheta`
- `ivDiff = ivNearRank - ivFarRank`（>0 才适合 Diagonal/PMCC：近月贵、远月便宜）
- 决策：
  - Up & netΔ>0 & netΘ>0 & ivDiff>0 → PMCC / Call Diagonal
  - Sideways & netΘ>0 & ivDiff>0 → Put Diagonal
  - Down & netΘ>0 → Bear Call Spread
  - 否则 → 等待
- 评分：趋势(30) + Δ(25) + Θ(25) + IV结构(20)；财报前高IV减 15

## API 预留
- `GET /api/ibkr` → 501（占位）
- `GET /api/finnhub` → 501（占位）
未来可将 IBKR / Finnhub 数据填充至前端表单或直接计算。
