'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { calendarDaysUntil } from '../lib/calendar-days.mjs'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
}

function daysUntil(value) {
  return calendarDaysUntil(value)
}

async function fetchOperationsJson(path, parentSignal, timeoutMs = 15000) {
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

function StatusBadge({ status }) {
  return <b className={`operations-status is-${status}`}>{status.toUpperCase()}</b>
}

function HealthSummary({ health }) {
  if (health?.unavailable) {
    return <div className="operations-loading">Feed check timed out. Indicator pages remain available and will retry on the next visit.</div>
  }
  if (!health) {
    return <div className="operations-loading">Checking official data feeds…</div>
  }
  const total = health.items.length
  const core = health.coreSummary || health.summary
  const coreTotal = health.items.filter(item => item.tier === 'core').length || total
  const archiveIssues = health.items.filter(item => item.tier === 'archive' && ['stale', 'failed'].includes(item.status)).length
  return (
    <>
      <div className="operations-health__counts">
        <div className="is-current"><strong>{core.current}</strong><span>Core current</span></div>
        <div className="is-reference"><strong>{core.reference || 0}</strong><span>Reference</span></div>
        <div className="is-stale"><strong>{core.stale}</strong><span>Stale</span></div>
        <div className="is-failed"><strong>{core.failed}</strong><span>Failed</span></div>
      </div>
      <p>
        {coreTotal} core feeds of {total} official feeds rechecked on access, with a daily scheduled backstop.
        {archiveIssues ? ` Archive feeds with issues: ${archiveIssues}.` : ''}
      </p>
    </>
  )
}

function ReleaseRows({ events, limit, emptyMessage = 'Loading official release schedules…' }) {
  const visible = typeof limit === 'number' ? events.slice(0, limit) : events
  if (!visible.length) {
    return <div className="operations-loading">{emptyMessage}</div>
  }
  return (
    <div className="operations-releases">
      {visible.map(item => {
        const countdown = daysUntil(item.date)
        return (
          <div className="operations-release" key={item.id}>
            <time dateTime={item.date}>
              <strong>{formatDate(item.date)}</strong>
              <span>{countdown === 0 ? 'TODAY' : countdown === 1 ? 'TOMORROW' : `${countdown}D`}</span>
            </time>
            <div>
              <Link href={item.href}>{item.label}</Link>
              <small>
                {item.country} · {item.period}
                {item.time ? ` · ${item.time} ${item.timeZone || ''}` : ''}
              </small>
            </div>
            <a href={item.sourceUrl} rel="noreferrer" target="_blank">{item.source} ↗</a>
          </div>
        )
      })}
    </div>
  )
}

export default function WorkspaceOperations({ countryCode, expanded = false }) {
  const countries = countryCode === 'ALL' ? ['US', 'JP'] : [countryCode]
  const [healthByCountry, setHealthByCountry] = useState({})
  const [calendar, setCalendar] = useState(null)
  const [calendarCountry, setCalendarCountry] = useState(countryCode === 'ALL' ? 'ALL' : countryCode)
  const [calendarWindow, setCalendarWindow] = useState('30')
  const [calendarCategory, setCalendarCategory] = useState('ALL')

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const requestCountries = countryCode === 'ALL' ? ['US', 'JP'] : [countryCode]

    fetchOperationsJson('/api/release-calendar', controller.signal)
      .then(payload => {
        if (active) setCalendar(payload && !payload.error ? payload : { events: [], unavailable: true })
      })
      .catch(error => {
        if (error.name !== 'AbortError') console.error('[Release calendar]', error)
      })

    requestCountries.forEach(country => {
      fetchOperationsJson(`/api/data-health?country=${country}`, controller.signal)
        .then(payload => {
          if (!active) return
          setHealthByCountry(current => ({
            ...current,
            [country]: payload && !payload.error ? payload : { unavailable: true },
          }))
        })
        .catch(error => {
          if (error.name !== 'AbortError') console.error(`[${country} data health]`, error)
        })
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [countryCode])

  const events = useMemo(() => {
    const all = calendar?.events || []
    return countryCode === 'ALL' ? all : all.filter(item => item.country === countryCode)
  }, [calendar, countryCode])
  const categories = useMemo(
    () => [...new Set(events.map(item => item.category).filter(Boolean))].sort(),
    [events],
  )
  const filteredEvents = useMemo(() => {
    const horizon = Number(calendarWindow)
    return events.filter(item => {
      const remaining = daysUntil(item.date)
      return (calendarCountry === 'ALL' || item.country === calendarCountry)
        && (calendarCategory === 'ALL' || item.category === calendarCategory)
        && remaining !== null
        && remaining >= 0
        && remaining <= horizon
    })
  }, [calendarCategory, calendarCountry, calendarWindow, events])

  if (expanded) {
    return (
      <div className="operations-dashboard">
        <section className="operations-dashboard__masthead">
          <span>DATA OPERATIONS</span>
          <h1>Data Status & Release Calendar</h1>
          <p>
            Live endpoint health, observation freshness and upcoming dates taken only from official published schedules.
          </p>
        </section>

        <section className="operations-dashboard__health">
          {countries.map(country => {
            const health = healthByCountry[country]
            return (
              <article key={country}>
                <header>
                  <div><span>{country}</span><h2>{country === 'JP' ? 'Japan data feeds' : 'United States data feeds'}</h2></div>
                  {health?.checkedAt ? <small>Checked {new Date(health.checkedAt).toLocaleTimeString()}</small> : null}
                </header>
                <HealthSummary health={health} />
                {health?.items ? (
                  <div className="operations-health__table">
                    {[...health.items].sort((a, b) => (a.tier === 'archive') - (b.tier === 'archive')).map(item => (
                      <Link href={item.href} key={item.key}>
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.tier === 'archive' ? 'Archive · ' : 'Core · '}{item.source} · {item.cadence}</small>
                          {item.message ? <small className="operations-health__reason">{item.message}</small> : null}
                        </div>
                        <span>{item.latestPeriod || 'No observation date'}</span>
                        <b className={item.mode === 'MIXED' ? 'is-mixed' : ''}>{item.mode}</b>
                        <StatusBadge status={item.status} />
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
        </section>

        <section className="operations-dashboard__calendar">
          <header>
            <div>
              <span>OFFICIAL CALENDAR</span>
              <h2>Next scheduled releases</h2>
            </div>
            <small>{calendar?.methodology || 'Connecting to official schedules…'}</small>
          </header>
          <div className="operations-filters" aria-label="Release calendar filters">
            <div>
              <span>Window</span>
              {[
                ['7', 'This week'],
                ['30', '30 days'],
                ['180', '6 months'],
              ].map(([value, label]) => (
                <button
                  aria-pressed={calendarWindow === value}
                  key={value}
                  onClick={() => setCalendarWindow(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <span>Country</span>
              {['ALL', 'JP', 'US'].map(value => (
                <button
                  aria-pressed={calendarCountry === value}
                  key={value}
                  onClick={() => setCalendarCountry(value)}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
            <label>
              <span>Category</span>
              <select value={calendarCategory} onChange={event => setCalendarCategory(event.target.value)}>
                <option value="ALL">All categories</option>
                {categories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
          </div>
          <div className="operations-filter-summary">
            <span>{filteredEvents.length} scheduled releases</span>
            <button
              onClick={() => {
                setCalendarWindow('30')
                setCalendarCountry(countryCode === 'ALL' ? 'ALL' : countryCode)
                setCalendarCategory('ALL')
              }}
              type="button"
            >
              Reset filters
            </button>
          </div>
          <ReleaseRows
            events={filteredEvents}
            emptyMessage={calendar?.unavailable ? 'Release schedule is temporarily unavailable.' : 'No scheduled releases match these filters.'}
          />
        </section>
      </div>
    )
  }

  return (
    <section className="workspace-operations" aria-label={`${countryCode} data operations`}>
      <header className="workspace-operations__header">
        <div>
          <span>Data operations</span>
          <strong>Freshness & next releases</strong>
        </div>
        <Link href="/status">Open full monitor →</Link>
      </header>
      <div className="workspace-operations__grid">
        <article className="operations-health">
          <div className="workspace-operations__topline">
            <span>FEED HEALTH</span>
            <b>AUTO · 15M</b>
          </div>
          {countries.map(country => (
            <div className="workspace-operations__country" key={country}>
              {countries.length > 1 ? <small>{country === 'US' ? 'United States' : 'Japan'}</small> : null}
              <HealthSummary health={healthByCountry[country]} />
            </div>
          ))}
        </article>
        <article>
          <div className="workspace-operations__topline">
            <span>NEXT RELEASES</span>
            <b>OFFICIAL · 6H</b>
          </div>
          <ReleaseRows
            events={events}
            limit={countries.length > 1 ? 4 : 3}
            emptyMessage={calendar?.unavailable ? 'Release schedule is temporarily unavailable.' : undefined}
          />
        </article>
      </div>
    </section>
  )
}
