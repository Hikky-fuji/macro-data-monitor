'use client'
import React, { useEffect, useState } from 'react'
import { Line, Bar, Doughnut, Scatter } from 'react-chartjs-2'
import { DashboardFreshness, DashboardState } from '../../components/DashboardStatus'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Title, Tooltip, Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend)

// Inline plugin: draw sector labels on scatter chart
const scatterLabelPlugin = {
  id: 'scatterLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.sectorLabels) return
      chart.getDatasetMeta(i).data.forEach((pt, j) => {
        const label = ds.sectorLabels[j]
        if (!label) return
        const placeLeft = pt.x > chart.chartArea.right - 105
        const x = placeLeft ? pt.x - 9 : pt.x + 9
        const y = pt.y - 7
        ctx.save()
        ctx.font = '600 11px sans-serif'
        ctx.textAlign = placeLeft ? 'right' : 'left'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(255,255,255,0.96)'
        ctx.strokeText(label, x, y)
        ctx.fillStyle = '#17212B'
        ctx.fillText(label, x, y)
        ctx.restore()
      })
    })
  },
}
ChartJS.register(scatterLabelPlugin)

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function USEmploymentPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/us-employment')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(e => setError(String(e)))
  }, [])

  if (error) return <DashboardState type="error" message={error} />
  if (!data) return <DashboardState message="Connecting to BLS and FRED data…" />

  const { employment, sectors, sectorAhe, sep } = data
  const { payems, unrate, u6rate, civpart, prime_part, ahe } = employment

  // ── helpers ──────────────────────────────────────────────────────────
  const lat    = arr => arr?.length ? arr[arr.length - 1] : null
  const momDiff = arr => arr?.length >= 2 ? arr[arr.length-1].value - arr[arr.length-2].value : null
  const momPct  = arr => arr?.length >= 2 ? (arr[arr.length-1].value / arr[arr.length-2].value - 1) * 100 : null
  const yoyVal  = arr => arr?.length >= 13 ? (arr[arr.length-1].value / arr[arr.length-13].value - 1) * 100 : null

  const fmtK    = v => v != null ? (v >= 0 ? '+' : '') + Math.round(v) + 'K' : '--'
  const fmtPct  = (v, d = 2) => v != null ? v.toFixed(d) + '%' : '--'
  const fmtSign = (v, d = 2, sfx = '%') => v != null ? (v >= 0 ? '+' : '') + v.toFixed(d) + sfx : '--'
  const dc      = v => v == null ? '#888' : v >= 0 ? '#1D9E75' : '#E24B4A'
  const dcInv   = v => v == null ? '#888' : v <= 0 ? '#1D9E75' : '#E24B4A'
  const cellClr = v => v == null ? '#888' : v >= 0 ? '#1D9E75' : '#E24B4A'
  const sepYearEnd = sep?.yearEnd || []
  const latestSepLongRun = lat(sep?.longRun)
  const sepLongRunValue = latestSepLongRun?.value ?? null
  const sepReleaseLabel = latestSepLongRun?.date
    ? `${MONTH_NAMES[Number(latestSepLongRun.date.slice(5, 7)) - 1]} ${latestSepLongRun.date.slice(0, 4)}`
    : null
  const sepDots = sepYearEnd.map(point => ({
    date: `${point.date.slice(0, 4)}-12`,
    value: point.value,
  }))

  // ── 3-month helpers ──────────────────────────────────────────────────
  const get3mChanges = arr => {
    if (!arr || arr.length < 4) return [null, null, null]
    const s = arr.slice(-4)
    return [s[1].value - s[0].value, s[2].value - s[1].value, s[3].value - s[2].value]
  }
  const get3mMoMPct = arr => {
    if (!arr || arr.length < 4) return [null, null, null]
    const s = arr.slice(-4)
    return s.slice(1).map((v, i) => (v.value / s[i].value - 1) * 100)
  }

  const nfp3months = payems?.length >= 4 ? payems.slice(-4) : []
  const m3labels   = nfp3months.slice(1).map(v => {
    const d = new Date(v.date + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  })
  const aheMoM3  = get3mMoMPct(ahe)
  const aheYoY3  = ahe?.length >= 14
    ? [
        (ahe[ahe.length-3].value / ahe[ahe.length-15].value - 1) * 100,
        (ahe[ahe.length-2].value / ahe[ahe.length-14].value - 1) * 100,
        (ahe[ahe.length-1].value / ahe[ahe.length-13].value - 1) * 100,
      ]
    : [null, null, null]
  const unr3  = unrate?.slice(-3).map(v => v.value)  ?? [null, null, null]
  const civ3  = civpart?.slice(-3).map(v => v.value) ?? [null, null, null]

  const sectorRows = [
    { key: 'goods',          label: 'Goods Producing' },
    { key: 'construction',   label: '  Construction',         indent: true },
    { key: 'wholesale',      label: '  Wholesale',            indent: true },
    { key: 'retail',         label: '  Retail Trade',         indent: true },
    { key: 'transportation', label: '  Transportation',       indent: true },
    { key: 'utilities',      label: '  Utilities',            indent: true },
    { key: 'info',           label: '  Information',          indent: true },
    { key: 'fire',           label: '  Financial',            indent: true },
    { key: 'pbs',            label: '  Prof. & Bus.',         indent: true },
    { key: 'ehs',            label: '  Edu & Health',         indent: true },
    { key: 'lah',            label: '  Leisure & Hosp.',      indent: true },
    { key: 'govt',           label: 'Government' },
  ]

  // ── NFP stacked bar: Goods / High Inc Svc / Low Inc Svc / Govt ───────
  // High Inc Svc = Info + Fire + PBS + Utilities
  // Low Inc Svc  = Retail + EHS + LAH + Wholesale + Transportation
  const n = 14  // 14 obs → 13 M/M changes → show last 12
  const trimLast = arr => arr?.slice(-n) || []

  const addSeries = (keys, len = n) => {
    const arrays = keys.map(k => trimLast(sectors[k]))
    const result = []
    for (let i = 0; i < len; i++) {
      let sum = 0
      for (const arr of arrays) sum += (arr[i]?.value ?? 0)
      result.push({ date: arrays[0]?.[i]?.date ?? '', value: sum })
    }
    return result
  }

  const goodsSum   = addSeries(['goods'])
  const highSvcSum = addSeries(['info', 'fire', 'pbs', 'utilities'])
  const lowSvcSum  = addSeries(['retail', 'ehs', 'lah', 'wholesale', 'transportation'])
  const govtSum    = addSeries(['govt'])

  const momChg12 = arr => arr.slice(1, 14).map((v, i) => v.value - arr[i].value)
  const stackLbls  = goodsSum.slice(1, 14).map(v => v.date.slice(0, 7))
  const goodsChg   = momChg12(goodsSum)
  const highSvcChg = momChg12(highSvcSum)
  const lowSvcChg  = momChg12(lowSvcSum)
  const govtChg    = momChg12(govtSum)

  // ── NFP 12M bar (total) ──────────────────────────────────────────────
  const nfp13   = payems?.length >= 13 ? payems.slice(-13) : []
  const nfp12Lb = nfp13.slice(1).map(v => v.date.slice(0, 7))
  const nfp12Vl = nfp13.slice(1).map((v, i) => v.value - nfp13[i].value)

  // ── Sector employment change horizontal bar (latest month) ────────────
  const barSectorDefs = [
    { key: 'goods',          label: 'Goods Prod.',      group: 'goods' },
    { key: 'construction',   label: 'Construction',     group: 'goods' },
    { key: 'info',           label: 'Information',      group: 'highSvc' },
    { key: 'fire',           label: 'Financial',        group: 'highSvc' },
    { key: 'pbs',            label: 'Prof. & Bus.',     group: 'highSvc' },
    { key: 'utilities',      label: 'Utilities',        group: 'highSvc' },
    { key: 'wholesale',      label: 'Wholesale',        group: 'lowSvc' },
    { key: 'retail',         label: 'Retail',           group: 'lowSvc' },
    { key: 'transportation', label: 'Transport',        group: 'lowSvc' },
    { key: 'ehs',            label: 'Edu & Health',     group: 'lowSvc' },
    { key: 'lah',            label: 'Leisure & Hosp.',  group: 'lowSvc' },
    { key: 'govt',           label: 'Government',       group: 'govt' },
  ]
  const groupColors = { goods: '#378ADD', highSvc: '#1D9E75', lowSvc: '#9B59B6', govt: '#F5A623' }
  const sectorLatestChg = barSectorDefs.map(d => momDiff(sectors[d.key]) ?? 0)
  const sectorBarColors = barSectorDefs.map(d => {
    const v = momDiff(sectors[d.key]) ?? 0
    return v >= 0 ? groupColors[d.group] + 'CC' : 'rgba(226,75,74,0.75)'
  })

  // ── AHE scatter (level $ vs YoY %) ───────────────────────────────────
  const aheScatterDefs = [
    { key: 'overall',       label: 'All Private',  color: '#333' },
    { key: 'goods',         label: 'Goods Prod.',  color: '#378ADD' },
    { key: 'construction',  label: 'Construction', color: '#378ADD' },
    { key: 'wholesale',     label: 'Wholesale',    color: '#1D9E75' },
    { key: 'retail',        label: 'Retail',       color: '#9B59B6' },
    { key: 'transportation',label: 'Transport',    color: '#9B59B6' },
    { key: 'utilities',     label: 'Utilities',    color: '#1D9E75' },
    { key: 'info',          label: 'Information',  color: '#1D9E75' },
    { key: 'finance',       label: 'Financial',    color: '#1D9E75' },
    { key: 'professional',  label: 'Prof. Svcs',   color: '#1D9E75' },
    { key: 'eduHealth',     label: 'Edu & Health', color: '#9B59B6' },
    { key: 'leisure',       label: 'Leisure & Hosp.', color: '#9B59B6' },
  ]
  const scatterPoints = aheScatterDefs
    .map(d => {
      const arr = sectorAhe[d.key]
      const level = lat(arr)?.value
      const yoy   = yoyVal(arr)
      if (level == null || yoy == null) return null
      return { x: level, y: yoy, label: d.label, color: d.color }
    })
    .filter(Boolean)

  // ── AHE YoY horizontal bar ────────────────────────────────────────────
  const aheSectorDefs = [
    { key: 'overall',       label: 'All Private (CES05)' },
    { key: 'goods',         label: 'Goods Prod.' },
    { key: 'construction',  label: 'Construction' },
    { key: 'wholesale',     label: 'Wholesale' },
    { key: 'retail',        label: 'Retail' },
    { key: 'transportation',label: 'Transportation' },
    { key: 'utilities',     label: 'Utilities' },
    { key: 'info',          label: 'Information' },
    { key: 'finance',       label: 'Financial' },
    { key: 'professional',  label: 'Prof. Services' },
    { key: 'eduHealth',     label: 'Edu & Health' },
    { key: 'leisure',       label: 'Leisure & Hosp.' },
  ]
  const aheYoYs = aheSectorDefs.map(d => yoyVal(sectorAhe[d.key]) ?? 0)

  // ── Employment by sector donut ────────────────────────────────────────
  const donutGroups = [
    { label: 'Goods Producing',   color: '#378ADD', keys: ['goods'] },
    { label: 'High Income Svc',   color: '#1D9E75', keys: ['info', 'fire', 'pbs', 'utilities'] },
    { label: 'Low Income Svc',    color: '#9B59B6', keys: ['ehs', 'lah', 'retail', 'wholesale', 'transportation'] },
    { label: 'Government',        color: '#F5A623', keys: ['govt'] },
  ]
  const donutVals = donutGroups.map(g =>
    g.keys.reduce((sum, k) => sum + (lat(sectors[k])?.value ?? 0), 0)
  )
  const totalEmp = donutVals.reduce((a, b) => a + b, 0)

  // ── Long-term U-3 (post-COVID 2021-01+) + SEP path ──────────────────
  const unrPostCovid = (unrate || []).filter(v => v.date >= '2021-01-01')
  const histLabels   = unrPostCovid.map(v => v.date.slice(0, 7))

  // Generate monthly labels through the final year available in the latest SEP.
  const lastHistDate = histLabels.length ? histLabels[histLabels.length - 1] : '2025-01'
  const genFutureMonths = (fromYM, toYM) => {
    const months = []
    let [y, m] = fromYM.split('-').map(Number)
    m += 1
    if (m > 12) { m = 1; y++ }
    const [ty, tm] = toYM.split('-').map(Number)
    while (y < ty || (y === ty && m <= tm)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }
  const latestSepDot = lat(sepDots)
  const forecastEnd = latestSepDot?.date ?? lastHistDate
  const futureMonths = genFutureMonths(lastHistDate, forecastEnd)
  const allUnrLabels = [...histLabels, ...futureMonths]
  const unrLineData  = [...unrPostCovid.map(v => v.value), ...Array(futureMonths.length).fill(null)]
  const sepLongRunData = allUnrLabels.map(() => sepLongRunValue)
  const sepDotMap = new Map(sepDots.map(dot => [dot.date, dot.value]))
  const sepDotData   = allUnrLabels.map(l => {
    return sepDotMap.get(l) ?? null
  })

  // ── U-3 vs U-6 (5Y / 60M) ────────────────────────────────────────────
  const unr60   = unrate?.slice(-60) || []
  const u6_60   = u6rate?.slice(-60) || []
  const unr60Lb = unr60.map(v => v.date.slice(0, 7))

  // ── Labor participation long-term (10Y) ───────────────────────────────
  const civ120   = civpart?.slice(-120) || []
  const prm120   = prime_part?.slice(-120) || []
  const civ120Lb = civ120.map(v => v.date.slice(0, 7))

  // ── Cumulative employment since Jan 2022 ─────────────────────────────
  const refIdx    = payems?.findIndex(v => v.date.slice(0, 7) === '2022-01') ?? -1
  const cumData   = refIdx >= 0 ? payems.slice(refIdx).map(v => v.value - payems[refIdx].value) : []
  const cumLabels = refIdx >= 0 ? payems.slice(refIdx).map(v => v.date.slice(0, 7)) : []

  // ── Styles ───────────────────────────────────────────────────────────
  const s = {
    wrap:     { maxWidth: '1060px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' },
    header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '12px' },
    sec:      { fontSize: '11px', fontWeight: '700', color: '#1A56DB', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 0 6px', marginTop: '24px', borderBottom: '2px solid #ddeeff', marginBottom: '14px' },
    grid4:    { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' },
    grid2:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
    card:     { background: '#f8f8f6', borderRadius: '10px', padding: '14px 16px' },
    cardLbl:  { fontSize: '10px', color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' },
    cardVal:  { fontSize: '22px', fontWeight: '600', color: '#111' },
    cardSub:  { fontSize: '11px', marginTop: '3px' },
    box:      { background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '16px', marginBottom: '16px' },
    boxTitle: { fontSize: '13px', fontWeight: '500', marginBottom: '4px', color: '#333' },
    boxSub:   { fontSize: '10px', color: '#aaa', marginBottom: '10px' },
    table:    { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
    th:       { textAlign: 'right', padding: '5px 10px', color: '#888', fontWeight: '500', borderBottom: '1px solid #eee', fontSize: '11px' },
    thL:      { textAlign: 'left',  padding: '5px 10px', color: '#888', fontWeight: '500', borderBottom: '1px solid #eee', fontSize: '11px' },
    td:       { padding: '4px 10px', borderBottom: '1px solid #f5f5f5' },
    tdR:      { padding: '4px 10px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' },
  }

  const lineOpts = {
    responsive: true,
    plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
    scales:  { y: { ticks: { callback: v => v.toFixed(1) + '%' } } },
  }

  const nfpBarOpts = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => (ctx.parsed.y >= 0 ? '+' : '') + Math.round(ctx.parsed.y) + 'K' } },
    },
    scales: { y: { ticks: { callback: v => (v >= 0 ? '+' : '') + Math.round(v) + 'K' } } },
  }

  const stackedBarOpts = {
    responsive: true,
    plugins: {
      legend:  { position: 'top' },
      tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => `${ctx.dataset.label}: ${(ctx.parsed.y >= 0 ? '+' : '')}${Math.round(ctx.parsed.y)}K` } },
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, ticks: { callback: v => (v >= 0 ? '+' : '') + Math.round(v) + 'K' } },
    },
  }

  const hbarEmpOpts = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend:  { display: false },
      tooltip: { callbacks: { label: ctx => (ctx.parsed.x >= 0 ? '+' : '') + Math.round(ctx.parsed.x) + 'K' } },
    },
    scales: { x: { ticks: { callback: v => (v >= 0 ? '+' : '') + Math.round(v) + 'K' } } },
  }

  const hbarWageOpts = {
    indexAxis: 'y',
    responsive: true,
    plugins: {
      legend:  { display: false },
      tooltip: { callbacks: { label: ctx => ctx.parsed.x.toFixed(2) + '%' } },
    },
    scales: {
      x: {
        grid: { color: '#DCE3EA' },
        ticks: { color: '#344454', font: { size: 12, weight: '600' }, callback: v => v.toFixed(1) + '%' },
      },
      y: {
        grid: { display: false },
        ticks: { color: '#1F2D3A', font: { size: 12, weight: '600' } },
      },
    },
  }

  const scatterOpts = {
    responsive: true,
    layout: { padding: { top: 14, right: 18, bottom: 4, left: 4 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const pt = ctx.raw
            return `${pt.label}: $${pt.x.toFixed(2)}/hr · YoY ${pt.y.toFixed(2)}%`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#DCE3EA' },
        title: { display: true, text: 'Avg Hourly Earnings ($)', color: '#1F2D3A', font: { size: 12, weight: '600' } },
        ticks: { color: '#344454', font: { size: 12, weight: '600' }, callback: v => '$' + v.toFixed(0) },
      },
      y: {
        grid: { color: '#DCE3EA' },
        title: { display: true, text: 'AHE YoY (%)', color: '#1F2D3A', font: { size: 12, weight: '600' } },
        ticks: { color: '#344454', font: { size: 12, weight: '600' }, callback: v => v.toFixed(1) + '%' },
      },
    },
  }

  const doughnutOpts = {
    responsive: true,
    plugins: {
      legend: { position: 'right', labels: { font: { size: 11 }, padding: 10 } },
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${(ctx.raw / 1000).toFixed(1)}M` } },
    },
  }

  const cumOpts = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => (ctx.parsed.y >= 0 ? '+' : '') + Math.round(ctx.parsed.y) + 'K' } },
    },
    scales: { y: { ticks: { callback: v => (v >= 0 ? '+' : '') + (v / 1000).toFixed(1) + 'M' } } },
  }

  const sepChartOpts = {
    responsive: true,
    plugins: {
      legend:  { position: 'top' },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      y: {
        min: 2,
        ticks: { callback: v => v.toFixed(1) + '%' },
      },
    },
  }

  return (
    <main className="dashboard-page" style={s.wrap}>
      <DashboardFreshness data={data} source="BLS · FRED" />

      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
            <a href="/" style={{ color: '#aaa', textDecoration: 'none' }}>🇯🇵 Japan</a>
            {' → '}
            <a href="/#united-states" style={{ color: '#aaa', textDecoration: 'none' }}>🇺🇸 US</a>
            {' → Employment'}
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#111', margin: 0 }}>US Employment Dashboard</h1>
          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '3px' }}>BLS via FRED · SA · Monthly</div>
        </div>
        <a href="/#united-states" style={{ fontSize: '12px', color: '#555', textDecoration: 'none' }}>← US Home</a>
      </div>

      {/* ── Section 1: Headline KPIs ── */}
      <div style={s.sec}>Headline</div>
      <div style={s.grid4}>
        {[
          {
            label: 'NFP M/M Change (SA)',
            val: fmtK(momDiff(payems)),
            sub: nfp13.length >= 3 ? 'Prior: ' + fmtK(nfp13[nfp13.length-2].value - nfp13[nfp13.length-3].value) : '',
            color: dc(momDiff(payems)),
          },
          {
            label: 'Unemployment U-3 (SA)',
            val: fmtPct(lat(unrate)?.value, 1),
            sub: unrate?.length >= 2 ? fmtSign(lat(unrate).value - unrate[unrate.length-2].value, 1, 'pp') + ' vs prior' : '',
            color: dcInv(momDiff(unrate)),
          },
          {
            label: 'Broad Unemployment U-6 (SA)',
            val: fmtPct(lat(u6rate)?.value, 1),
            sub: u6rate?.length >= 2 ? fmtSign(lat(u6rate).value - u6rate[u6rate.length-2].value, 1, 'pp') + ' vs prior' : '',
            color: dcInv(momDiff(u6rate)),
          },
          {
            label: 'AHE YoY — All Private (SA)',
            val: fmtPct(yoyVal(ahe)),
            sub: 'M/M: ' + fmtSign(momPct(ahe), 2),
            color: dc(yoyVal(ahe)),
          },
        ].map(k => (
          <div key={k.label} style={s.card}>
            <div style={s.cardLbl}>{k.label}</div>
            <div style={s.cardVal}>{k.val}</div>
            <div style={{ ...s.cardSub, color: k.color }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Section 2: Highlight Tables ── */}
      <div style={s.sec}>Establishment Survey — Last 3 Months</div>
      <div style={s.grid2}>
        <div style={s.box}>
          <div style={s.boxTitle}>Employment Change by Sector (K, SA)</div>
          <div style={s.boxSub}>Level M/M difference · FRED</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.thL}>Sector</th>
                {m3labels.map(m => <th key={m} style={s.th}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {sectorRows.map(row => {
                const changes = get3mChanges(sectors[row.key])
                return (
                  <tr key={row.key}>
                    <td style={{ ...s.td, fontWeight: row.indent ? '400' : '600', color: row.indent ? '#555' : '#111' }}>
                      {row.label}
                    </td>
                    {changes.map((v, i) => (
                      <td key={i} style={{ ...s.tdR, color: cellClr(v), fontWeight: '500' }}>
                        {v != null ? (v >= 0 ? '+' : '') + Math.round(v) : '--'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={s.box}>
          <div style={s.boxTitle}>Avg Hourly Earnings (SA)</div>
          <div style={s.boxSub}>CES0500000003 · FRED</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.thL}>Metric</th>
                {m3labels.map(m => <th key={m} style={s.th}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...s.td, fontWeight: '600' }}>AHE M/M (All Private)</td>
                {aheMoM3.map((v, i) => (
                  <td key={i} style={{ ...s.tdR, color: cellClr(v), fontWeight: '600' }}>
                    {v != null ? fmtSign(v, 2) : '--'}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...s.td, fontWeight: '600' }}>AHE Y/Y (All Private)</td>
                {aheYoY3.map((v, i) => (
                  <td key={i} style={{ ...s.tdR, fontWeight: '600' }}>
                    {v != null ? fmtPct(v) : '--'}
                  </td>
                ))}
              </tr>
              <tr><td colSpan={4} style={{ ...s.td, padding: '4px 0' }} /></tr>
              <tr>
                <td style={{ ...s.td, fontWeight: '600' }}>Unemployment (U-3)</td>
                {unr3.map((v, i) => <td key={i} style={s.tdR}>{v != null ? v.toFixed(1) + '%' : '--'}</td>)}
              </tr>
              <tr>
                <td style={{ ...s.td, fontWeight: '600' }}>Fed SEP Long-Run Est.</td>
                {[0,1,2].map(i => (
                  <td key={i} style={{ ...s.tdR, color: '#D85A30', fontWeight: '500' }}>
                    {sepLongRunValue != null ? `${sepLongRunValue.toFixed(1)}%` : '--'}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...s.td, fontWeight: '600' }}>Labor Participation</td>
                {civ3.map((v, i) => <td key={i} style={s.tdR}>{v != null ? v.toFixed(1) + '%' : '--'}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 3: NFP Stacked Bar by Group ── */}
      <div style={s.sec}>NFP Change — by Sector Group (Last 12M)</div>
      <div style={s.box}>
        <div style={s.boxTitle}>Monthly NFP Change — Goods / High Income Svc / Low Income Svc / Government (K, SA)</div>
        <div style={s.boxSub}>SA · High Inc Svc = Info + Financial + Prof. + Utilities · Low Inc Svc = Retail + Edu&Health + Leisure + Wholesale + Transport</div>
        <Bar
          data={{
            labels: stackLbls,
            datasets: [
              { label: 'Goods Producing', data: goodsChg,   backgroundColor: 'rgba(55,138,221,0.8)',  stack: 'nfp' },
              { label: 'High Income Svc', data: highSvcChg, backgroundColor: 'rgba(29,158,117,0.8)',  stack: 'nfp' },
              { label: 'Low Income Svc',  data: lowSvcChg,  backgroundColor: 'rgba(155,89,182,0.8)',  stack: 'nfp' },
              { label: 'Government',      data: govtChg,    backgroundColor: 'rgba(245,166,35,0.8)',  stack: 'nfp' },
            ],
          }}
          options={stackedBarOpts}
        />
      </div>

      {/* ── Section 4: Sector bar + AHE scatter ── */}
      <div style={s.sec}>Sector Detail — Latest Month</div>
      <div style={s.grid2}>
        <div style={s.box}>
          <div style={s.boxTitle}>Sector Employment Change M/M (K, SA)</div>
          <div style={s.boxSub}>Blue=Goods · Green=High Inc · Purple=Low Inc · Orange=Govt · Red=negative</div>
          <div style={{ height: '360px' }}>
            <Bar
              data={{
                labels: barSectorDefs.map(d => d.label),
                datasets: [{ data: sectorLatestChg, backgroundColor: sectorBarColors }],
              }}
              options={hbarEmpOpts}
            />
          </div>
        </div>

        <div style={s.box}>
          <div style={s.boxTitle}>AHE Level ($) vs YoY Growth (%) by Sector</div>
          <div style={s.boxSub}>SA · Hover for sector name · CES series (FRED)</div>
          <Scatter
            data={{
              datasets: [{
                data: scatterPoints.map(p => ({ x: p.x, y: p.y, label: p.label })),
                sectorLabels: scatterPoints.map(p => p.label),
                pointBackgroundColor: scatterPoints.map(p => p.color),
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointRadius: 7,
                pointHoverRadius: 9,
              }],
            }}
            options={scatterOpts}
          />
        </div>
      </div>

      {/* ── Section 5: AHE YoY by sector ── */}
      <div style={s.sec}>Wage Growth by Sector (AHE YoY)</div>
      <div style={s.box}>
        <div style={s.boxTitle}>Average Hourly Earnings — Year-over-Year % by Sector (SA)</div>
        <div style={s.boxSub}>SA · CES sector series (FRED) · YoY calculated client-side</div>
        <Bar
          data={{
            labels: aheSectorDefs.map(d => d.label),
            datasets: [{
              data: aheYoYs,
              backgroundColor: aheYoYs.map(v => v >= 0 ? 'rgba(29,158,117,0.75)' : 'rgba(226,75,74,0.75)'),
            }],
          }}
          options={hbarWageOpts}
        />
      </div>

      {/* ── Section 6: Unemployment Long-Term + SEP path ── */}
      <div style={s.sec}>Unemployment Rate — Long Term</div>
      <div style={s.box}>
        <div style={s.boxTitle}>Unemployment Rate U-3 — Post-COVID (2021–) + Fed SEP Path (SA)</div>
        <div style={s.boxSub}>
          SA · UNRATE / UNRATEMD / UNRATEMDLR (FRED) · Orange dots = SEP year-end median
          {sepReleaseLabel ? ` · Updated ${sepReleaseLabel}` : ''}
          {sepLongRunValue != null ? ` · Dashed = Long-Run ${sepLongRunValue.toFixed(1)}%` : ''}
        </div>
        <Line
          data={{
            labels: allUnrLabels,
            datasets: [
              {
                label: 'U-3 Unemployment',
                data: unrLineData,
                borderColor: '#378ADD', borderWidth: 2, pointRadius: 0, tension: 0.3,
              },
              {
                label: `Fed SEP Long-Run${sepLongRunValue != null ? ` (${sepLongRunValue.toFixed(1)}%)` : ''}`,
                data: sepLongRunData,
                borderColor: '#D85A30', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, tension: 0,
              },
              {
                label: 'SEP Year-End Path',
                data: sepDotData,
                borderColor: '#D85A30', backgroundColor: '#D85A30',
                borderWidth: 0, pointRadius: 8, pointHoverRadius: 10,
                showLine: false,
              },
            ],
          }}
          options={sepChartOpts}
        />
      </div>

      {/* ── Section 7: U-3 vs U-6 (5Y) ── */}
      <div style={s.grid2}>
        <div style={s.box}>
          <div style={s.boxTitle}>U-3 vs U-6 — 5 Years (SA)</div>
          <div style={s.boxSub}>SA · UNRATE / U6RATE (FRED)</div>
          <Line
            data={{
              labels: unr60Lb,
              datasets: [
                { label: 'U-3 (Headline)', data: unr60.map(v => v.value), borderColor: '#378ADD', borderWidth: 2, pointRadius: 0, tension: 0.3 },
                { label: 'U-6 (Broad)',    data: u6_60.map(v => v.value), borderColor: '#D85A30', borderWidth: 2, pointRadius: 0, tension: 0.3 },
              ],
            }}
            options={lineOpts}
          />
        </div>

        {/* ── Section 8: Labor participation long-term ── */}
        <div style={s.box}>
          <div style={s.boxTitle}>Labor Force Participation Rate — 10 Years (SA)</div>
          <div style={s.boxSub}>SA · CIVPART / LNS11300060 (FRED)</div>
          <Line
            data={{
              labels: civ120Lb,
              datasets: [
                { label: 'Overall (16+)',   data: civ120.map(v => v.value), borderColor: '#1D9E75', borderWidth: 2, pointRadius: 0, tension: 0.3 },
                { label: 'Prime Age 25-54', data: prm120.map(v => v.value), borderColor: '#9B59B6', borderWidth: 2, pointRadius: 0, tension: 0.3 },
              ],
            }}
            options={lineOpts}
          />
        </div>
      </div>

      {/* ── Section 9: Sector donut + Cumulative growth ── */}
      <div style={s.sec}>Employment Composition &amp; Trend</div>
      <div style={s.grid2}>
        <div style={s.box}>
          <div style={s.boxTitle}>Employment by Sector Group — Latest Month</div>
          <div style={s.boxSub}>
            SA · Total: {totalEmp > 0 ? (totalEmp / 1000).toFixed(1) + 'M' : '--'} · Grouped (FRED)
          </div>
          <Doughnut
            data={{
              labels: donutGroups.map(g => g.label),
              datasets: [{
                data: donutVals,
                backgroundColor: donutGroups.map(g => g.color + 'CC'),
                borderWidth: 2,
                borderColor: '#fff',
              }],
            }}
            options={doughnutOpts}
          />
        </div>

        <div style={s.box}>
          <div style={s.boxTitle}>Cumulative NFP Growth Since January 2022 (K, SA)</div>
          <div style={s.boxSub}>SA · PAYEMS (FRED) · Base = 0 at Jan 2022</div>
          {cumData.length > 0 ? (
            <Line
              data={{
                labels: cumLabels,
                datasets: [{
                  label: 'Cumulative Change',
                  data: cumData,
                  borderColor: '#378ADD',
                  backgroundColor: 'rgba(55,138,221,0.08)',
                  borderWidth: 2,
                  pointRadius: 0,
                  tension: 0.3,
                  fill: true,
                }],
              }}
              options={{
                responsive: true,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => (ctx.parsed.y >= 0 ? '+' : '') + Math.round(ctx.parsed.y) + 'K' } } },
                scales:  { y: { ticks: { callback: v => (v >= 0 ? '+' : '') + (v / 1000).toFixed(1) + 'M' } } },
              }}
            />
          ) : (
            <div style={{ color: '#aaa', fontSize: 13 }}>Not enough data.</div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #eee', fontSize: '11px', color: '#aaa', textAlign: 'center' }}>
        Data: FRED (Federal Reserve Bank of St. Louis) · BLS · SA · Personal use only
      </div>
    </main>
  )
}
