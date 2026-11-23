'use client'
import { useEffect, useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import { DashboardFreshness, DashboardState } from '../components/DashboardStatus'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

export default function Consumption() {
  const [data, setData] = useState(null)
  const [cpi, setCpi] = useState(null)

  useEffect(() => {
    fetch('/api/consumption').then(r => r.json()).then(setData)
    fetch('/api/cpi').then(r => r.json()).then(setCpi)
  }, [])

  if (!data?.total?.length || !cpi?.headline?.length) return (
    <DashboardState />
  )

  const { total, basic, discretionary } = data
  const latest = total.at(-1)
  const prev = total.at(-2)
  const diff = latest && prev ? (latest.value - prev.value).toFixed(1) : '0.0'
  const diffStr = Number(diff) > 0 ? `+${diff}pp` : `${diff}pp`

  const cpiMap = {}
  cpi.headline.forEach(v => { cpiMap[v.date] = v.value })
  const cpiCoreMap = {}
  cpi.core.forEach(v => { cpiCoreMap[v.date] = v.value })

  const labels = total.map(v => v.date)

  const chart1 = {
    labels,
    datasets: [{
      label: 'Real Consumption (Y/Y %)',
      data: total.map(v => v.value),
      backgroundColor: total.map(v => v.value >= 0 ? 'rgba(155,89,182,0.7)' : 'rgba(226,75,74,0.7)'),
      borderColor: total.map(v => v.value >= 0 ? '#9B59B6' : '#E24B4A'),
      borderWidth: 1,
    }]
  }

  // 基礎的 vs 選択的：共通ラベルで合わせる
  const basicMap = {}
  basic.forEach(v => { basicMap[v.date] = v.value })
  const discMap = {}
  discretionary.forEach(v => { discMap[v.date] = v.value })

  const chart2 = {
    labels,
    datasets: [
      {
        label: 'Basic (food, utilities etc.)',
        data: labels.map(d => basicMap[d] ?? null),
        borderColor: '#378ADD',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        spanGaps: false,
      },
      {
        label: 'Discretionary (travel, leisure etc.)',
        data: labels.map(d => discMap[d] ?? null),
        borderColor: '#F5A623',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        spanGaps: false,
      },
      {
        label: 'Total',
        data: total.map(v => v.value),
        borderColor: '#9B59B6',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        borderDash: [4, 3],
      },
    ]
  }

  const chart3 = {
    labels,
    datasets: [
      {
        label: 'Real Consumption',
        data: total.map(v => v.value),
        borderColor: '#9B59B6',
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.3,
      },
      {
        label: 'CPI Headline',
        data: labels.map(d => cpiMap[d] ?? null),
        borderColor: '#378ADD',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        borderDash: [4, 3],
      },
      {
        label: 'CPI Core',
        data: labels.map(d => cpiCoreMap[d] ?? null),
        borderColor: '#D85A30',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        borderDash: [4, 3],
      },
    ]
  }

  const barOpts = {
    responsive: true,
    plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
    scales: { y: { ticks: { callback: v => v.toFixed(1) + '%' } } }
  }
  const lineOpts = {
    responsive: true,
    plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
    scales: { y: { ticks: { callback: v => v.toFixed(1) + '%' } } }
  }

  const s = {
    wrap:      { maxWidth: '980px', margin: '0 auto', padding: '24px', fontFamily: 'sans-serif' },
    header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '12px' },
    nav:       { fontSize: '12px', color: '#378ADD', textDecoration: 'none', marginRight: '16px' },
    grid3:     { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' },
    grid2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
    card:      { background: '#f8f8f6', borderRadius: '10px', padding: '14px 16px' },
    cardLabel: { fontSize: '10px', color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' },
    cardVal:   { fontSize: '26px', fontWeight: '600', color: '#111' },
    box:       { background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '16px', marginBottom: '16px' },
    boxTitle:  { fontSize: '13px', fontWeight: '500', marginBottom: '12px', color: '#333' },
    badge:     { display: 'inline-block', fontSize: '10px', background: '#F3E8FF', color: '#6B21A8', borderRadius: '4px', padding: '2px 7px', marginLeft: '8px', fontWeight: '600' },
    note:      { fontSize: '11px', color: '#aaa', marginTop: '8px' },
  }

  return (
    <main className="dashboard-page" style={s.wrap}>
      <DashboardFreshness data={{ data, cpi }} source="MIC · e-Stat" />
      <div style={s.header}>
        <div>
          <a href="/" style={s.nav}>← Home</a>
          <a href="/tokyo-cpi" style={s.nav}>Tokyo CPI</a>
          <a href="/trade" style={s.nav}>Trade</a>
          <span style={{fontSize:'20px', fontWeight:'600', color:'#111'}}>
            Household Consumption
            <span style={s.badge}>Family Survey</span>
          </span>
        </div>
        <span style={{fontSize:'12px', color:'#888'}}>Source: MIC e-Stat / ~6 weeks lag vs CPI</span>
      </div>

      <div style={s.grid3}>
        <div style={s.card}>
          <div style={s.cardLabel}>Real Consumption (Y/Y)</div>
          <div style={s.cardVal}>{latest ? latest.value.toFixed(1) + '%' : '--'}</div>
          <div style={{fontSize:'11px', color: Number(diff) >= 0 ? '#1D9E75' : '#E24B4A', marginTop:'3px'}}>{diffStr} vs prior</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>Latest Period</div>
          <div style={{fontSize:'22px', fontWeight:'600', color:'#111'}}>{latest?.date ?? '--'}</div>
          <div style={{fontSize:'11px', color:'#888', marginTop:'3px'}}>2+ person households</div>
        </div>
        <div style={s.card}>
          <div style={s.cardLabel}>CPI Headline (same period)</div>
          <div style={{fontSize:'22px', fontWeight:'600', color:'#111'}}>
            {cpiMap[latest?.date] != null ? cpiMap[latest.date].toFixed(1) + '%' : '--'}
          </div>
          <div style={{fontSize:'11px', color:'#888', marginTop:'3px'}}>Price pressure context</div>
        </div>
      </div>

      <div style={s.grid2}>
        <div style={s.box}>
          <div style={s.boxTitle}>Real Consumption Y/Y (%) — Last 24 months</div>
          <Bar data={chart1} options={barOpts} />
          <div style={s.note}>※ 2+ person households, real (CPI-deflated)</div>
        </div>
        <div style={s.box}>
          <div style={s.boxTitle}>Basic vs Discretionary Spending (Y/Y %)</div>
          <Line data={chart2} options={lineOpts} />
          {total.some(v => v.date >= basic[0]?.date && !(v.date in basicMap)) ? (
            <div style={{ fontSize: '11px', marginTop: '8px', opacity: 0.75 }}>
              Gap: the Statistics Bureau publishes no basic / discretionary split for months shown blank. Values are not interpolated.
            </div>
          ) : null}
          <div style={s.note}>※ Basic: food, utilities etc. / Discretionary: travel, leisure etc.</div>
        </div>
      </div>

      <div style={s.box}>
        <div style={s.boxTitle}>Consumption vs CPI — Price vs Demand Check (Y/Y %)</div>
        <Line data={chart3} options={lineOpts} />
        <div style={s.note}>※ CPI data may be 1–2 months ahead of consumption data</div>
      </div>
    </main>
  )
}
