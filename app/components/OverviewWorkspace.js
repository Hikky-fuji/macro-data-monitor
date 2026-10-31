'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import WorkspaceOperations from './WorkspaceOperations'
import WorkspacePulse from './WorkspacePulse'
import { isCorePage } from '../lib/core-indicators.mjs'
import { JAPAN_INDICATORS, US_INDICATORS } from '../lib/workspace-catalog'

const SOURCE_BY_PATH = {
  '/cpi': 'MIC · e-Stat',
  '/tokyo-cpi': 'MIC · e-Stat',
  '/ppi': 'BOJ',
  '/boj-policy': 'BOJ · MIC · MHLW',
  '/yen-transmission': 'BOJ · MIC',
  '/gdp': 'Cabinet Office · e-Stat',
  '/iip': 'METI · e-Stat',
  '/tsip': 'METI · e-Stat',
  '/machine-orders': 'Cabinet Office · e-Stat',
  '/consumption': 'MIC · e-Stat',
  '/tankan': 'BOJ',
  '/watcher': 'Cabinet Office · e-Stat',
  '/wages': 'MHLW · e-Stat',
  '/labour': 'MIC · e-Stat',
  '/job-ratio': 'MHLW · e-Stat',
  '/trade': 'MOF',
  '/inbound-tourism': 'JNTO · Japan Tourism Agency',
  '/us/employment': 'BLS · FRED',
  '/us/initial-claims': 'ETA · FRED',
  '/us/cpi': 'BLS · FRED',
  '/us/ppi': 'BLS · FRED',
  '/us/consumption': 'BEA · FRED',
  '/us/jolts': 'BLS · FRED',
  '/us/manufacturing': 'NY Fed · Philadelphia Fed · ISM',
  '/us/rates': 'Federal Reserve · Treasury · FRED',
  '/us-macro': 'Federal Reserve · BEA · FRED',
}

// US first: its releases land overnight in Japan time, when no terminal is at hand.
const COUNTRIES = [
  {
    code: 'US',
    id: 'united-states',
    name: 'United States',
    timing: 'Overnight in Japan time',
    scope: 'CPI · payrolls · PCE · manufacturing surveys · Fed policy and rates',
    indicators: US_INDICATORS,
  },
  {
    code: 'JP',
    id: 'japan',
    name: 'Japan',
    timing: 'Tokyo business hours',
    scope: 'Consumer prices · wages · BOJ policy monitor',
    indicators: JAPAN_INDICATORS,
  },
]

const en = value => (typeof value === 'object' ? value.en : value)

function sourceForPath(path) {
  return SOURCE_BY_PATH[path.split('#')[0]] ?? 'Official sources'
}

function splitItems(indicators) {
  const items = indicators.flatMap(group => group.items.map(item => ({ ...item, group: en(group.group) })))
  return {
    core: items.filter(item => isCorePage(item.href)),
    archive: items.filter(item => !isCorePage(item.href)),
  }
}

// Rendered only after mount so server and client markup match.
function useNow() {
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(new Date())
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function Clock({ label, timeZone, now }) {
  const time = now
    ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(now)
    : '--:--'
  const day = now ? new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(now) : ''
  return (
    <div className="overview__clock">
      <span>{label}</span>
      <strong>{time}</strong>
      <small>{day}</small>
    </div>
  )
}

function CountrySection({ country, core }) {
  return (
    <section className={`overview-country overview-country--${country.code.toLowerCase()}`} id={country.id}>
      <header className="overview-country__header">
        <span className="overview-country__code">{country.code}</span>
        <div>
          <h2>{country.name}</h2>
          <p>{country.scope}</p>
        </div>
        <small>{country.timing}<br />{core.length} core dashboards</small>
      </header>

      <WorkspacePulse
        countryCode={country.code}
        title={`${country.name} · current pulse`}
        dashboards={Object.fromEntries(core.map(item => [item.href, {
          title: en(item.title),
          subtitle: en(item.subtitle),
          badge: en(item.badge).split(' / ')[0],
        }]))}
      />
    </section>
  )
}

export default function OverviewWorkspace() {
  const now = useNow()
  const sections = COUNTRIES.map(country => ({ country, ...splitItems(country.indicators) }))
  const coreTotal = sections.reduce((total, section) => total + section.core.length, 0)
  const archiveTotal = sections.reduce((total, section) => total + section.archive.length, 0)

  return (
    <main className="macro-workspace overview">
      <section className="macro-workspace__masthead overview__masthead">
        <div>
          <div className="macro-workspace__eyebrow">OVERVIEW / CORE MONITOR</div>
          <h1>Macro Data Monitor</h1>
          <p>
            {coreTotal} core US and Japan dashboards built from official releases. The US comes first because
            its data land overnight in Japan time.
          </p>
        </div>
        <div className="overview__clocks" aria-label="Local times">
          <Clock label="Tokyo · JST" timeZone="Asia/Tokyo" now={now} />
          <Clock label="New York · ET" timeZone="America/New_York" now={now} />
        </div>
      </section>

      <nav className="overview__jump" aria-label="Overview sections">
        {sections.map(({ country, core }, index) => (
          <a href={`#${country.id}`} key={country.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            {country.name}
            <b>{core.length}</b>
          </a>
        ))}
        <a href="#operations"><span>03</span>Feeds & releases</a>
        <a href="#archive"><span>04</span>Archive<b>{archiveTotal}</b></a>
      </nav>

      {sections.map(({ country, core }) => (
        <CountrySection country={country} core={core} key={country.id} />
      ))}

      <div id="operations" className="overview__operations">
        <WorkspaceOperations countryCode="ALL" />
      </div>

      {archiveTotal ? (
        <details className="macro-archive" id="archive">
          <summary>
            <span>ARCHIVE</span>
            <strong>{archiveTotal} reference dashboards</strong>
            <small>Outside the core monitoring set · feeds may lag and do not gate data-quality checks</small>
          </summary>
          <div className="macro-archive__groups">
            {sections.map(({ country, archive }) => (
              <div className="macro-archive__group" key={country.id}>
                <h3>{country.name}</h3>
                <ul>
                  {archive.map(item => (
                    <li key={item.href}>
                      <Link href={item.href}>
                        <span>{en(item.title)}</span>
                        <small>{item.group} · {en(item.badge)} · {sourceForPath(item.href)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </main>
  )
}
