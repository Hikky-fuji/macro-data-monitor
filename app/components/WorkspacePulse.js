'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { monthlyBlockContributions } from '../lib/us-cpi-scenarios.mjs'

const last = series => Array.isArray(series) && series.length ? series.at(-1) : null
const finite = value => Number.isFinite(value)

function signed(value, digits = 1, suffix = '') {
  if (!finite(value)) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`
}

function fixed(value, digits = 1, suffix = '') {
  return finite(value) ? `${value.toFixed(digits)}${suffix}` : '—'
}

function tone(value, inverse = false) {
  if (!finite(value) || value === 0) return 'neutral'
  const positive = inverse ? value < 0 : value > 0
  return positive ? 'positive' : 'negative'
}

function yearAgoValue(observations, current) {
  if (!current?.date) return null
  const targetYear = String(Number(current.date.slice(0, 4)) - 1)
  const target = `${targetYear}${current.date.slice(4)}`
  return observations.find(item => item.date === target && finite(item.value))?.value ?? null
}

function yoyFromIndex(observations) {
  const clean = (observations || []).filter(item => finite(item.value))
  const current = last(clean)
  const prior = yearAgoValue(clean, current)
  return {
    date: current?.date?.slice(0, 7),
    value: current && finite(prior) ? (current.value / prior - 1) * 100 : null,
  }
}

function pctChange(current, prior) {
  return finite(current) && finite(prior) && prior !== 0 ? (current / prior - 1) * 100 : null
}

function seriesValues(series, accessor = item => item?.value) {
  return (series || [])
    .map(accessor)
    .filter(finite)
    .slice(-24)
}

function yoySeries(observations) {
  const clean = (observations || []).filter(item => finite(item.value))
  return clean
    .map(item => {
      const prior = yearAgoValue(clean, item)
      return finite(prior) && prior !== 0 ? (item.value / prior - 1) * 100 : null
    })
    .filter(finite)
    .slice(-24)
}

function changeSeries(observations, difference = false) {
  const clean = (observations || []).filter(item => finite(item.value))
  return clean
    .map((item, index) => {
      const prior = clean[index - 1]?.value
      if (!finite(prior)) return null
      return difference ? item.value - prior : pctChange(item.value, prior)
    })
    .filter(finite)
    .slice(-24)
}

function momentumLabel(kind, direction, latest) {
  const labels = {
    inflation: {
      up: 'Accelerating',
      down: 'Disinflation',
      flat: 'Stable',
    },
    growth: {
      up: 'Accelerating',
      down: 'Slowing',
      flat: 'Stable',
    },
    activity: {
      up: 'Improving',
      down: 'Softening',
      flat: 'Stable',
    },
    employment: {
      up: 'Strengthening',
      down: 'Cooling',
      flat: 'Stable',
    },
    unemployment: {
      up: 'Rising',
      down: 'Falling',
      flat: 'Stable',
    },
    policy: {
      up: 'Tightening',
      down: 'Easing',
      flat: 'On hold',
    },
    balance: {
      up: 'Improving',
      down: 'Weakening',
      flat: 'Stable',
    },
  }

  if (kind === 'inflation' && latest < 0) return 'Deflation'
  if ((kind === 'growth' || kind === 'employment') && latest < 0) {
    return direction === 'up' ? 'Recovering' : 'Contracting'
  }
  return labels[kind]?.[direction] ?? {
    up: 'Rising',
    down: 'Falling',
    flat: 'Stable',
  }[direction]
}

function momentum(values, kind = 'direction') {
  const clean = (values || []).filter(finite)
  if (clean.length < 2) return { label: 'Awaiting history', direction: 'flat', arrow: '→' }
  const latest = clean.at(-1)
  const comparison = clean.slice(-4, -1)
  const reference = comparison.reduce((sum, value) => sum + value, 0) / comparison.length
  const range = Math.max(...clean) - Math.min(...clean)
  const threshold = Math.max(range * 0.06, 0.05)
  const direction = latest - reference > threshold
    ? 'up'
    : reference - latest > threshold
      ? 'down'
      : 'flat'
  const arrows = { up: '↑', down: '↓', flat: '→' }
  return {
    label: momentumLabel(kind, direction, latest),
    direction,
    arrow: arrows[direction],
  }
}

function Sparkline({ values, baseline, label, variant = 'line' }) {
  const clean = (values || []).filter(finite).slice(-24)
  if (clean.length < 2) return <div className="workspace-pulse__sparkline is-empty" />

  const width = 240
  const height = 46
  const padding = 3
  const domain = finite(baseline) ? [...clean, baseline] : clean
  let min = Math.min(...domain)
  let max = Math.max(...domain)
  if (min === max) {
    min -= 1
    max += 1
  }
  const x = index => padding + index * ((width - padding * 2) / (clean.length - 1))
  const y = value => padding + (max - value) * ((height - padding * 2) / (max - min))
  const points = clean.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const baselineY = finite(baseline) ? y(baseline) : null

  if (variant === 'bars') {
    const zeroY = finite(baselineY) ? baselineY : y(Math.max(min, Math.min(max, 0)))
    const slot = (width - padding * 2) / clean.length
    return (
      <svg
        className="workspace-pulse__sparkline is-bars"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}, latest ${clean.at(-1).toFixed(0)}`}
      >
        <line className="workspace-pulse__baseline" x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} />
        {clean.map((value, index) => (
          <rect
            className={value < 0 ? 'is-negative' : index === clean.length - 1 ? 'is-latest' : ''}
            key={index}
            x={padding + index * slot + slot * 0.15}
            width={slot * 0.7}
            y={Math.min(y(value), zeroY)}
            height={Math.max(Math.abs(y(value) - zeroY), 0.8)}
          />
        ))}
      </svg>
    )
  }

  return (
    <svg
      className="workspace-pulse__sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label}, latest ${clean.at(-1).toFixed(1)}`}
    >
      {finite(baselineY) && (
        <line className="workspace-pulse__baseline" x1={padding} x2={width - padding} y1={baselineY} y2={baselineY} />
      )}
      <polyline points={points} />
      <circle cx={x(clean.length - 1)} cy={y(clean.at(-1))} r="2.6" />
    </svg>
  )
}

function ContributionPanel({ panel }) {
  const scale = Math.max(0.05, ...panel.rows.map(row => Math.abs(row.contribution)).filter(finite))
  return (
    <>
      <div className="workspace-pulse__panel-head">
        <span>{panel.title}</span>
        <time>{panel.period}</time>
      </div>
      <div className="workspace-pulse__contrib" role="table" aria-label={panel.title}>
        <div className="workspace-pulse__contrib-row is-head" role="row">
          <span role="columnheader">Block</span>
          <span role="columnheader" aria-hidden="true" />
          <span role="columnheader">Contr.</span>
          <span role="columnheader">M/M</span>
        </div>
        {panel.rows.map(row => (
          <div className="workspace-pulse__contrib-row" role="row" key={row.label}>
            <span role="cell">{row.label}</span>
            <span role="cell" className="workspace-pulse__contrib-track" aria-hidden="true">
              {finite(row.contribution) ? (
                <i
                  className={row.contribution < 0 ? 'is-negative' : ''}
                  style={{
                    left: `${row.contribution < 0 ? 50 - Math.abs(row.contribution) / scale * 50 : 50}%`,
                    width: `${Math.abs(row.contribution) / scale * 50}%`,
                  }}
                />
              ) : null}
            </span>
            <b role="cell">{signed(row.contribution, 2)}</b>
            <b role="cell" className={`is-${tone(row.rate, true)}`}>{signed(row.rate, 1, '%')}</b>
          </div>
        ))}
        <div className="workspace-pulse__contrib-row is-total" role="row">
          <span role="cell">Headline</span>
          <span role="cell" aria-hidden="true" />
          <span role="cell" aria-hidden="true" />
          <b role="cell" className={`is-${tone(panel.headline, true)}`}>{signed(panel.headline, 1, '%')}</b>
        </div>
      </div>
      <p className="workspace-pulse__panel-note">{panel.note}</p>
    </>
  )
}

function LinePanel({ panel }) {
  return (
    <>
      <div className="workspace-pulse__panel-head">
        <span>{panel.title}</span>
        <time>{panel.period}</time>
      </div>
      <div className="workspace-pulse__panel-value">
        <small>{panel.mainLabel}</small>
        <strong>{panel.value}</strong>
      </div>
      <div className="workspace-pulse__trend">
        <Sparkline values={panel.series} baseline={panel.baseline} label={`${panel.title} trend`} />
      </div>
      <div className="workspace-pulse__details">
        {panel.details.map(row => (
          <div key={row.label}>
            <span>{row.label}</span>
            <b className={`is-${row.tone}`}>{row.value}</b>
          </div>
        ))}
      </div>
    </>
  )
}

function RulePanel({ panel }) {
  const values = [panel.actual, ...panel.rows.map(row => row.value)].filter(finite)
  const low = Math.floor(Math.min(...values) - 0.5)
  const high = Math.ceil(Math.max(...values) + 0.5)
  const position = value => `${((value - low) / (high - low)) * 100}%`
  return (
    <>
      <div className="workspace-pulse__panel-head">
        <span>{panel.title}</span>
        <time>{panel.period}</time>
      </div>
      <div className="workspace-pulse__rules" role="table" aria-label={panel.title}>
        <div className="workspace-pulse__rule-row is-head" role="row">
          <span role="columnheader">Rule</span>
          <span role="columnheader">{low.toFixed(0)}–{high.toFixed(0)}%</span>
          <span role="columnheader">Rate</span>
          <span role="columnheader">Gap</span>
        </div>
        {panel.rows.map(row => (
          <div className="workspace-pulse__rule-row" role="row" key={row.label}>
            <span role="cell">{row.label}</span>
            <span role="cell" className="workspace-pulse__rule-track" aria-hidden="true">
              {finite(panel.actual) ? <i className="is-actual" style={{ left: position(panel.actual) }} /> : null}
              {finite(row.value) ? <i style={{ left: position(row.value) }} /> : null}
            </span>
            <b role="cell">{fixed(row.value, 2, '%')}</b>
            <b role="cell">{signed(finite(row.value) ? (panel.actual - row.value) * 100 : null, 0, 'bp')}</b>
          </div>
        ))}
      </div>
      <p className="workspace-pulse__panel-note">{panel.note}</p>
    </>
  )
}

const PANELS = { contributions: ContributionPanel, line: LinePanel, rules: RulePanel }

function PulsePanel({ panel }) {
  const PanelBody = PANELS[panel?.type]
  return (
    <div className="workspace-pulse__panel">
      {PanelBody ? <PanelBody panel={panel} /> : <p className="workspace-pulse__panel-note">Detail unavailable</p>}
    </div>
  )
}

function detail(label, value, toneName = 'neutral') {
  return { label, value, tone: toneName }
}

function card({
  label,
  href,
  mainLabel,
  value,
  period,
  toneName = 'neutral',
  details,
  source,
  series,
  baseline,
  momentumKind,
  loading = false,
  unavailable = false,
  mode = 'AUTO',
  chart = 'line',
  wide = false,
  panel = null,
}) {
  return {
    label,
    href,
    mainLabel,
    value,
    period,
    tone: toneName,
    details,
    source,
    series,
    baseline,
    momentum: momentum(series, momentumKind),
    loading,
    unavailable,
    mode,
    chart,
    wide,
    panel,
  }
}

function japanCards(payload) {
  const hasSource = key => Object.prototype.hasOwnProperty.call(payload, key)
  const sourceLoading = key => !hasSource(key)
  const sourceFailed = key => hasSource(key) && payload[key] === null
  const { cpi, tokyoCpi, wages, bojPolicy } = payload
  const headline = last(cpi?.headline)
  const core = last(cpi?.core)
  const corecore = last(cpi?.corecore)
  const tokyoHeadline = last(tokyoCpi?.headline)
  const tokyoCore = last(tokyoCpi?.core)
  const tokyoCorecore = last(tokyoCpi?.corecore)
  const trimmedMean = last(bojPolicy?.coreInflation?.trimmedMean)
  const weightedMedian = last(bojPolicy?.coreInflation?.weightedMedian)
  const outputGap = last(bojPolicy?.activity?.outputGap)
  const realWage = last(wages?.real)
  const nominalWage = last(wages?.nominal)
  const scheduledWage = last(wages?.scheduled)

  return [
    card({
      label: 'Prices',
      href: '/cpi',
      mainLabel: 'Headline CPI',
      value: fixed(headline?.value, 1, '%'),
      period: headline?.date,
      toneName: tone(headline?.value - 2, true),
      details: [
        detail('Core', fixed(core?.value, 1, '%')),
        detail('Core-core', fixed(corecore?.value, 1, '%')),
      ],
      source: 'MIC · e-Stat',
      series: seriesValues(cpi?.headline),
      baseline: 2,
      momentumKind: 'inflation',
      loading: sourceLoading('cpi'),
      unavailable: sourceFailed('cpi') || (hasSource('cpi') && !finite(headline?.value)),
    }),
    card({
      label: 'Tokyo Prices',
      href: '/tokyo-cpi',
      mainLabel: 'Tokyo headline CPI',
      value: fixed(tokyoHeadline?.value, 1, '%'),
      period: tokyoHeadline?.date,
      toneName: tone(tokyoHeadline?.value - 2, true),
      details: [
        detail('Core', fixed(tokyoCore?.value, 1, '%')),
        detail('Core-core', fixed(tokyoCorecore?.value, 1, '%')),
      ],
      source: 'MIC · e-Stat',
      series: seriesValues(tokyoCpi?.headline),
      baseline: 2,
      momentumKind: 'inflation',
      loading: sourceLoading('tokyoCpi'),
      unavailable: sourceFailed('tokyoCpi') || (hasSource('tokyoCpi') && !finite(tokyoHeadline?.value)),
    }),
    card({
      label: 'Underlying Inflation',
      href: '/boj-policy',
      mainLabel: 'BOJ trimmed mean',
      value: fixed(trimmedMean?.value, 1, '%'),
      period: trimmedMean?.date,
      toneName: tone(trimmedMean?.value - 2, true),
      details: [
        detail('Weighted median', fixed(weightedMedian?.value, 1, '%')),
        detail('Output gap', signed(outputGap?.value, 2, '%'), tone(outputGap?.value)),
      ],
      source: 'BOJ research data',
      series: seriesValues(bojPolicy?.coreInflation?.trimmedMean),
      baseline: 2,
      momentumKind: 'inflation',
      loading: sourceLoading('bojPolicy'),
      unavailable: sourceFailed('bojPolicy') || (hasSource('bojPolicy') && !finite(trimmedMean?.value)),
    }),
    card({
      label: 'Wages',
      href: '/wages',
      mainLabel: 'Real wages YoY',
      value: signed(realWage?.yoy, 1, '%'),
      period: realWage?.date,
      toneName: tone(realWage?.yoy),
      details: [
        detail('Nominal wages', signed(nominalWage?.yoy, 1, '%'), tone(nominalWage?.yoy)),
        detail('Scheduled pay', signed(scheduledWage?.yoy, 1, '%'), tone(scheduledWage?.yoy)),
      ],
      source: 'MHLW',
      series: seriesValues(wages?.real, item => item?.yoy),
      baseline: 0,
      momentumKind: 'growth',
      loading: sourceLoading('wages'),
      unavailable: sourceFailed('wages') || (hasSource('wages') && !finite(realWage?.yoy)),
    }),
  ]
}

const CPI_BLOCK_LABELS = {
  food: 'Food',
  energy: 'Energy',
  coreGoods: 'Core goods',
  rentOfShelter: 'Shelter rent',
  medicalServices: 'Medical svcs',
  transportation: 'Transport svcs',
  otherCoreServices: 'Other core svcs',
}

function usCards(payload) {
  const hasSource = key => Object.prototype.hasOwnProperty.call(payload, key)
  const sourceLoading = key => !hasSource(key)
  const sourceFailed = key => hasSource(key) && payload[key] === null
  const { cpi, employment, consumption, manufacturing, macro } = payload
  // BLS publishes CPI 12-month changes from unadjusted indices.
  const nsaOrSa = item => item?.nsa?.observations?.some(point => finite(point.value)) ? item.nsa.observations : item?.observations
  const headlineCpi = yoyFromIndex(nsaOrSa(cpi?.series?.headline))
  const coreCpi = yoyFromIndex(nsaOrSa(cpi?.series?.core))
  const corePce = yoyFromIndex(consumption?.series?.corePce?.observations)
  const realPce = consumption?.series?.realPce?.observations?.filter(item => finite(item.value)) || []
  const saving = last(consumption?.series?.savingRate?.observations?.filter(item => finite(item.value)))
  const realPceLatest = last(realPce)
  const empire = last(manufacturing?.regional?.empire?.series?.headline?.observations?.filter(item => finite(item.value)))
  const philly = last(manufacturing?.regional?.philly?.series?.headline?.observations?.filter(item => finite(item.value)))
  const ism = last(manufacturing?.ism?.headline)
  const payrolls = employment?.employment?.payems || []
  const payrollLatest = last(payrolls)
  const payrollPrior = payrolls.at(-2)
  const unemployment = last(employment?.employment?.unrate)
  const payrollThreeMonth = payrolls.length >= 4 && finite(payrollLatest?.value) && finite(payrolls.at(-4)?.value)
    ? (payrollLatest.value - payrolls.at(-4).value) / 3
    : null
  const fedFunds = last(macro?.policy?.fedfunds)
  const latestRules = macro?.policy?.rules?.latest
  const currentRuleValues = ['taylor93', 'balanced', 'clarida', 'bullard']
    .map(key => latestRules?.[key])
    .filter(finite)
  const ruleRange = currentRuleValues.length
    ? `${Math.min(...currentRuleValues).toFixed(1)}–${Math.max(...currentRuleValues).toFixed(1)}%`
    : '—'
  const cpiBlocks = cpi?.series && cpi?.contributionWeights
    ? monthlyBlockContributions(cpi.series, cpi.contributionWeights, cpi.aggregateWeights)
    : null
  const ahe = (employment?.employment?.ahe || []).filter(item => finite(item.value))
  const aheYoy = yoyFromIndex(ahe)
  const aheMom = pctChange(last(ahe)?.value, ahe.at(-2)?.value)

  return [
    card({
      label: 'Prices',
      href: '/us/cpi',
      mainLabel: 'Headline CPI YoY',
      value: fixed(headlineCpi.value, 1, '%'),
      period: headlineCpi.date,
      toneName: tone(headlineCpi.value - 2, true),
      details: [
        detail('Core CPI', fixed(coreCpi.value, 1, '%')),
        detail('Core PCE', fixed(corePce.value, 1, '%')),
      ],
      source: 'BLS · FRED',
      series: yoySeries(nsaOrSa(cpi?.series?.headline)),
      baseline: 2,
      momentumKind: 'inflation',
      loading: sourceLoading('cpi'),
      unavailable: sourceFailed('cpi') || (hasSource('cpi') && !finite(headlineCpi.value)),
      wide: true,
      panel: cpiBlocks ? {
        type: 'contributions',
        title: 'What moved CPI M/M',
        period: cpiBlocks.date.slice(0, 7),
        headline: cpiBlocks.headline,
        rows: cpiBlocks.blocks.map(block => ({ label: CPI_BLOCK_LABELS[block.key], rate: block.rate, contribution: block.contribution })),
        note: `Contribution in pp, approx. with ${cpi.weightAsOf} weights · other core services is an implied residual`,
      } : null,
    }),
    card({
      label: 'Employment & Wages',
      href: '/us/employment',
      mainLabel: 'Nonfarm payrolls',
      value: signed(payrollLatest?.value - payrollPrior?.value, 0, 'K'),
      period: payrollLatest?.date?.slice(0, 7),
      toneName: tone(payrollLatest?.value - payrollPrior?.value),
      details: [
        detail('Unemployment', fixed(unemployment?.value, 1, '%'), tone(unemployment?.value - 4.5, true)),
        detail('3M avg payrolls', signed(payrollThreeMonth, 0, 'K'), tone(payrollThreeMonth)),
      ],
      source: 'BLS · FRED',
      series: changeSeries(payrolls, true),
      baseline: 0,
      momentumKind: 'employment',
      loading: sourceLoading('employment'),
      unavailable: sourceFailed('employment') || (hasSource('employment') && !finite(payrollLatest?.value)),
      wide: true,
      chart: 'bars',
      panel: {
        type: 'line',
        title: 'Average hourly earnings',
        period: aheYoy.date,
        mainLabel: 'AHE YoY',
        value: fixed(aheYoy.value, 1, '%'),
        series: yoySeries(ahe),
        details: [
          detail('AHE MoM', signed(aheMom, 1, '%'), tone(aheMom)),
          detail('Level', finite(last(ahe)?.value) ? `$${last(ahe).value.toFixed(2)}/hr` : '—'),
        ],
      },
    }),
    card({
      label: 'Monetary Policy',
      href: '/us-macro#fed-policy',
      mainLabel: 'Effective fed funds',
      value: fixed(fedFunds?.value, 2, '%'),
      period: fedFunds?.date?.slice(0, 7),
      toneName: 'neutral',
      details: [
        detail('Core PCE vs 2%', signed(corePce.value - 2, 1, 'pp'), tone(corePce.value - 2, true)),
        detail('Rule range', ruleRange),
      ],
      source: 'Federal Reserve · BLS',
      series: seriesValues(macro?.policy?.fedfunds),
      momentumKind: 'policy',
      loading: sourceLoading('macro'),
      unavailable: sourceFailed('macro') || (hasSource('macro') && !finite(fedFunds?.value)),
      wide: true,
      panel: latestRules ? {
        type: 'rules',
        title: 'Fed funds vs rules',
        period: `${latestRules.date} avg`,
        actual: latestRules.actual,
        rows: [
          { label: 'Taylor 1993', value: latestRules.taylor93 },
          { label: 'Balanced', value: latestRules.balanced },
          { label: 'Clarida proxy', value: latestRules.clarida },
          { label: 'Bullard proxy', value: latestRules.bullard },
        ],
        note: `White marker = actual ${fixed(latestRules.actual, 2, '%')} · gap = actual − rule · diagnostic, not a policy signal`,
      } : null,
    }),
    card({
      label: 'PCE & Consumption',
      href: '/us/consumption',
      mainLabel: 'Core PCE YoY',
      value: fixed(corePce.value, 1, '%'),
      period: corePce.date,
      toneName: tone(corePce.value - 2, true),
      details: [
        detail('Real PCE MoM', signed(pctChange(realPceLatest?.value, realPce.at(-2)?.value), 2, '%'), tone(pctChange(realPceLatest?.value, realPce.at(-2)?.value))),
        detail('Saving rate', fixed(saving?.value, 1, '%')),
      ],
      source: 'BEA · FRED',
      series: yoySeries(consumption?.series?.corePce?.observations),
      baseline: 2,
      momentumKind: 'inflation',
      loading: sourceLoading('consumption'),
      unavailable: sourceFailed('consumption') || (hasSource('consumption') && !finite(corePce.value)),
    }),
    card({
      label: 'Surveys & Sentiment',
      href: '/us/manufacturing',
      mainLabel: 'ISM Manufacturing',
      value: fixed(ism?.value, 1),
      period: ism?.date?.slice(0, 7),
      toneName: tone(ism?.value - 50),
      details: [
        detail('NY Empire', signed(empire?.value, 1), tone(empire?.value)),
        detail('Philly Fed', signed(philly?.value, 1), tone(philly?.value)),
      ],
      source: 'NY Fed · Philly Fed · ISM',
      series: seriesValues(manufacturing?.ism?.headline),
      baseline: 50,
      momentumKind: 'activity',
      loading: sourceLoading('manufacturing'),
      unavailable: sourceFailed('manufacturing') || (hasSource('manufacturing') && !finite(ism?.value)),
      mode: 'MIXED · ISM MANUAL',
    }),
  ]
}

async function fetchJson(path, parentSignal, timeoutMs = 12000) {
  const controller = new AbortController()
  let timedOut = false
  const abortFromParent = () => controller.abort()
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  parentSignal.addEventListener('abort', abortFromParent, { once: true })

  try {
    const response = await fetch(path, { signal: controller.signal })
    if (!response.ok) return null
    const payload = await response.json()
    return payload?.error ? null : payload
  } catch (error) {
    if (error.name === 'AbortError' && parentSignal.aborted && !timedOut) throw error
    return null
  } finally {
    window.clearTimeout(timeout)
    parentSignal.removeEventListener('abort', abortFromParent)
  }
}

const PULSE_CACHE_VERSION = 9

function readPulseCache(countryCode, maxAge) {
  try {
    const raw = window.localStorage.getItem(`japanpulse:pulse:${countryCode}:v${PULSE_CACHE_VERSION}`)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (!cached?.savedAt || !cached?.payload || Date.now() - cached.savedAt > maxAge) return null
    return cached.payload
  } catch {
    return null
  }
}

function writePulseCache(countryCode, payload) {
  try {
    window.localStorage.setItem(
      `japanpulse:pulse:${countryCode}:v${PULSE_CACHE_VERSION}`,
      JSON.stringify({ savedAt: Date.now(), payload }),
    )
  } catch {
    // Storage can be unavailable in private browsing; live fetching still works.
  }
}

// `dashboards` maps a card href to { title, subtitle, badge } for the dashboard it opens.
export default function WorkspacePulse({ countryCode, title = 'Core indicators · current pulse', dashboards = {} }) {
  const sourceTotal = countryCode === 'JP' ? 4 : 5
  const [cards, setCards] = useState(() => countryCode === 'JP' ? japanCards({}) : usCards({}))
  const [progress, setProgress] = useState({ completed: 0, total: sourceTotal })
  const [cacheMode, setCacheMode] = useState('none')
  const [deliveryMode, setDeliveryMode] = useState('progressive')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const config = countryCode === 'JP'
      ? {
          paths: {
            cpi: '/api/cpi',
            tokyoCpi: '/api/tokyo-cpi',
            wages: '/api/wages',
            bojPolicy: '/api/boj-policy',
          },
          build: japanCards,
        }
      : {
          paths: {
            cpi: '/api/us-cpi',
            employment: '/api/us-employment',
            consumption: '/api/us-consumption',
            manufacturing: '/api/us-manufacturing',
            macro: '/api/us-macro',
          },
          build: usCards,
        }

    const sources = Object.entries(config.paths)
    const cacheMaxAge = countryCode === 'JP' ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000
    const cachedPayload = readPulseCache(countryCode, cacheMaxAge)
    const collected = cachedPayload ? { ...cachedPayload } : {}
    const freshResults = {}
    const completedKeys = new Set()
    const inFlightKeys = new Set()
    let fallbackTimer = null

    setCards(config.build({ ...collected }))
    setProgress({ completed: 0, total: sources.length })
    setCacheMode(cachedPayload ? 'refreshing' : 'none')
    setDeliveryMode('progressive')

    const finalize = () => {
      if (completedKeys.size !== sources.length) return
      const allFresh = sources.every(([sourceKey]) => freshResults[sourceKey] !== null)
      if (allFresh) {
        writePulseCache(countryCode, freshResults)
        setCards(config.build({ ...freshResults }))
        setCacheMode('none')
      } else {
        setCacheMode(cachedPayload ? 'fallback' : 'none')
      }
    }

    const publish = (key, value) => {
      if (!active) return
      if (value === null && freshResults[key]) return
      freshResults[key] = value
      if (value !== null || !Object.prototype.hasOwnProperty.call(collected, key)) {
        collected[key] = value
      }
      completedKeys.add(key)
      setCards(config.build({ ...collected }))
      setProgress({ completed: completedKeys.size, total: sources.length })
      finalize()
    }

    const fetchIndividuals = (requested = sources) => {
      setDeliveryMode('progressive')
      requested.forEach(([key, path]) => {
        if (inFlightKeys.has(key) || freshResults[key]) return
        inFlightKeys.add(key)
        fetchJson(path, controller.signal)
          .then(value => publish(key, value))
          .catch(error => {
            if (!active || error.name === 'AbortError') return
            publish(key, null)
          })
          .finally(() => inFlightKeys.delete(key))
      })
    }

    fallbackTimer = window.setTimeout(() => {
      if (!cachedPayload && completedKeys.size === 0) fetchIndividuals()
    }, 450)

    fetchJson(`/api/workspace-pulse?country=${countryCode}`, controller.signal, 10000)
      .then(bundle => {
        if (!active) return
        window.clearTimeout(fallbackTimer)
        if (!bundle?.sources) {
          fetchIndividuals()
          return
        }

        setDeliveryMode(bundle.complete ? 'aggregated' : 'progressive')
        sources.forEach(([key]) => {
          if (!freshResults[key]) publish(key, bundle.sources[key] ?? null)
        })
        const failedSources = sources.filter(([key]) => bundle.sources[key] === null)
        if (failedSources.length) fetchIndividuals(failedSources)
      })
      .catch(error => {
        if (!active || error.name === 'AbortError') return
        window.clearTimeout(fallbackTimer)
        fetchIndividuals()
      })

    return () => {
      active = false
      window.clearTimeout(fallbackTimer)
      controller.abort()
    }
  }, [countryCode])

  if (Array.isArray(cards) && cards.length === 0) return null
  const statusText = cacheMode === 'refreshing'
    ? `Cached snapshot · refreshing ${progress.completed}/${progress.total}`
    : cacheMode === 'fallback'
      ? 'Cached snapshot · refresh incomplete'
      : progress.total > 0 && progress.completed < progress.total
        ? `Loading official sources · ${progress.completed}/${progress.total}`
        : deliveryMode === 'aggregated'
          ? 'Official sources · edge-aggregated'
          : 'Official sources · card-level fallback'

  return (
    <section className="workspace-pulse" aria-label={`${countryCode} macro at a glance`}>
      <header className="workspace-pulse__header">
        <div>
          <span>Macro at a glance</span>
          <strong>{title}</strong>
        </div>
        <small>{statusText}</small>
      </header>
      <div className={`workspace-pulse__grid${cards?.length === 4 ? ' is-four' : ''}${cards?.some(item => item.wide) ? ' has-wide' : ''}`}>
        {(cards || []).map(item => item.loading ? (
          <div className={`workspace-pulse__item is-loading${item.wide ? ' is-wide' : ''}`} key={item.label}>
            <div className="workspace-pulse__topline">
              <span>{item.label}</span>
              <b>LOADING</b>
            </div>
            <div className="workspace-pulse__main-label">{item.mainLabel}</div>
            <strong>—</strong>
            <div className="workspace-pulse__loading-line" />
            <div className="workspace-pulse__loading-line is-short" />
            <footer>
              <span>{item.source}</span>
              <b>CONNECTING</b>
            </footer>
          </div>
        ) : (
          <Link
            className={`workspace-pulse__item is-${item.tone}${item.unavailable ? ' is-unavailable' : ''}${item.wide ? ' is-wide' : ''}`}
            href={item.href}
            key={item.label}
          >
            <div className="workspace-pulse__topline">
              <span>{item.label}</span>
              <b>{dashboards[item.href]?.badge ? `${dashboards[item.href].badge} · ` : ''}Open →</b>
            </div>
            <div className="workspace-pulse__primary">
              <div className="workspace-pulse__main-label">{item.mainLabel}</div>
              <strong>{item.unavailable ? '—' : item.value}</strong>
              <time>{item.unavailable ? 'Source unavailable' : item.period || 'Latest available'}</time>
              {item.unavailable ? (
                <div className="workspace-pulse__trend is-unavailable">
                  <span>Data could not be loaded</span>
                </div>
              ) : (
                <div className="workspace-pulse__trend">
                  <Sparkline values={item.series} baseline={item.baseline} label={`${item.mainLabel} trend`} variant={item.chart === 'bars' ? 'bars' : 'line'} />
                  <span className={`is-${item.momentum.direction}`}>
                    {item.momentum.arrow} {item.momentum.label}
                  </span>
                </div>
              )}
              <div className="workspace-pulse__details">
                {item.details.map(row => (
                  <div key={row.label}>
                    <span>{row.label}</span>
                    <b className={`is-${row.tone}`}>{item.unavailable ? '—' : row.value}</b>
                  </div>
                ))}
              </div>
            </div>
            {item.wide && !item.unavailable ? <PulsePanel panel={item.panel} /> : null}
            {dashboards[item.href] ? (
              <div className="workspace-pulse__dashboard">
                <b>{dashboards[item.href].title}</b>
                <span>{dashboards[item.href].subtitle}</span>
              </div>
            ) : null}
            <footer>
              <span>{item.source}</span>
              <b className={item.unavailable ? 'is-failed' : item.mode.startsWith('MIXED') ? 'is-mixed' : ''}>
                {item.unavailable ? 'FAILED' : item.mode}
              </b>
            </footer>
          </Link>
        ))}
      </div>
    </section>
  )
}
