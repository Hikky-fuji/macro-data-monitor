'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isCorePage } from '../lib/core-indicators.mjs'
import { indicatorGuideForPath } from '../lib/indicator-guides.mjs'
import { significanceDefinition, significanceForPath } from '../lib/significance'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Japan',
    match: path => !path.startsWith('/us') && !['/cpi', '/tokyo-cpi', '/ppi'].includes(path),
  },
  { href: '/us', label: 'United States', match: path => path === '/us' || path === '/us-macro' || path === '/us/rates' },
  { href: '/cpi', label: 'Japan CPI', match: path => path === '/cpi' || path === '/tokyo-cpi' || path === '/ppi' },
  { href: '/us/cpi', label: 'US Prices', match: path => path === '/us/cpi' || path === '/us/ppi' },
  { href: '/us/employment', label: 'US Employment', match: path => ['/us/employment', '/us/initial-claims', '/us/jolts'].includes(path) },
  { href: '/status', label: 'Data Status', match: path => path === '/status' },
]

const SEARCH_ITEMS = [
  { href: '/status', country: 'OPS', label: 'Data Status & Release Calendar', description: 'Feed freshness, failures and official release dates', keywords: 'health stale failed schedule operations' },
  { href: '/', country: 'JP', label: 'Japan Macro Workspace', description: 'All Japan indicators and current pulse', keywords: 'overview home' },
  { href: '/cpi', country: 'JP', label: 'CPI', description: 'National consumer prices', keywords: 'inflation core core-core' },
  { href: '/tokyo-cpi', country: 'JP', label: 'Tokyo CPI', description: 'Tokyo consumer prices', keywords: 'inflation leading' },
  { href: '/ppi', country: 'JP', label: 'Corporate & Services Prices', description: 'CGPI and SPPI', keywords: 'ppi producer boj inflation' },
  { href: '/boj-policy', country: 'JP', label: 'BOJ Policy Monitor', description: 'Underlying inflation, output gap, labor and wages', keywords: 'monetary policy transmission trimmed mean weighted median demand gap' },
  { href: '/yen-transmission', country: 'JP', label: 'Yen & External Cost Transmission', description: 'USD/JPY, effective yen and import-price pass-through', keywords: 'fx currency exchange rate neer reer imported inflation boj' },
  { href: '/gdp', country: 'JP', label: 'GDP', description: 'Real growth and demand contributions', keywords: 'economic growth' },
  { href: '/iip', country: 'JP', label: 'Industrial Production', description: 'Production, shipments and inventory', keywords: 'iip meti hard data' },
  { href: '/tsip', country: 'JP', label: 'Tertiary Industry Activity', description: 'Services activity', keywords: 'tsip services production' },
  { href: '/machine-orders', country: 'JP', label: 'Machine Orders', description: 'Core private machinery demand', keywords: 'capex investment' },
  { href: '/consumption', country: 'JP', label: 'Private Consumption', description: 'Household spending', keywords: 'family survey retail' },
  { href: '/housing', country: 'JP', label: 'Housing Starts', description: 'Construction levels and tenure breadth', keywords: 'real estate homes mlit building starts rental' },
  { href: '/tankan', country: 'JP', label: 'BOJ Tankan', description: 'Business conditions survey', keywords: 'sentiment survey diffusion index' },
  { href: '/watcher', country: 'JP', label: 'Economy Watchers', description: 'Current conditions and outlook DI', keywords: 'sentiment survey' },
  { href: '/wages', country: 'JP', label: 'Wages', description: 'Real, nominal and scheduled pay', keywords: 'earnings labor' },
  { href: '/labour', country: 'JP', label: 'Labor Market', description: 'Employment and unemployment', keywords: 'jobs unemployment' },
  { href: '/job-ratio', country: 'JP', label: 'Job-to-Applicant Ratio', description: 'Labor demand relative to applicants', keywords: 'jobs openings mhlw' },
  { href: '/trade', country: 'JP', label: 'Trade', description: 'Exports, imports and trade balance', keywords: 'external sector flow map' },
  { href: '/inbound-tourism', country: 'JP', label: 'Inbound Tourism', description: 'Visitor arrivals, spending and accommodation', keywords: 'jnto tourism services exports foreign visitors travel' },
  { href: '/us', country: 'US', label: 'US Macro Workspace', description: 'All US indicators and current pulse', keywords: 'overview home united states' },
  { href: '/us/cpi', country: 'US', label: 'US CPI', description: 'Headline, core and supercore inflation', keywords: 'prices inflation bls' },
  { href: '/us/ppi', country: 'US', label: 'US PPI', description: 'Producer prices and pipeline inflation', keywords: 'prices inflation producer core final demand bls' },
  { href: '/us/employment', country: 'US', label: 'US Employment', description: 'Payrolls, unemployment and wages', keywords: 'nfp jobs earnings' },
  { href: '/us/initial-claims', country: 'US', label: 'Initial Claims', description: 'Weekly unemployment insurance claims', keywords: 'continuing labor weekly' },
  { href: '/us/consumption', country: 'US', label: 'PCE, Income & Dining Demand', description: 'PCE inflation, spending, income, saving and real restaurant sales', keywords: 'core pce deflator consumption dining restaurant census bea' },
  { href: '/us/retail-sales', country: 'US', label: 'Retail Sales', description: 'Advance sales, real demand and category breadth', keywords: 'consumer spending census autos gasoline control group' },
  { href: '/us/housing', country: 'US', label: 'Housing Cycle', description: 'Construction, sales, mortgage rates and house prices', keywords: 'real estate starts permits home sales inventory fhfa' },
  { href: '/us/jolts', country: 'US', label: 'JOLTS', description: 'Openings, hires, quits and separations', keywords: 'labor flows vacancies bls' },
  { href: '/us/manufacturing', country: 'US', label: 'Manufacturing Surveys', description: 'Empire, Philly Fed and ISM sequence', keywords: 'ny new york sentiment soft data' },
  { href: '/us/rates', country: 'US', label: 'US Rates & Financial Conditions', description: 'Treasury curve, real yields, breakevens and NFCI', keywords: 'bonds yields fixed income fed policy financial markets duration inflation expectations' },
  { href: '/us-macro', country: 'US', label: 'US Growth & Fed Policy', description: 'GDP, fed funds, FOMC and policy rules', keywords: 'fomc rates monetary policy taylor clarida bullard' },
]

const isArchived = item => item.country !== 'OPS' && !['/', '/us'].includes(item.href) && !isCorePage(item.href)
const ORDERED_SEARCH_ITEMS = [...SEARCH_ITEMS].sort((a, b) => isArchived(a) - isArchived(b))

function IndicatorSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const onKeyDown = event => {
      const target = event.target
      const isTyping = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (shortcut || (!isTyping && event.key === '/')) {
        event.preventDefault()
        setOpen(true)
      } else if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return ORDERED_SEARCH_ITEMS
    return ORDERED_SEARCH_ITEMS.filter(item => (
      `${item.country} ${item.label} ${item.description} ${item.keywords}`
        .toLowerCase()
        .includes(normalized)
    ))
  }, [query])

  return (
    <>
      <button className="terminal-search-button" type="button" onClick={() => setOpen(true)}>
        <span>Search</span>
        <kbd>/</kbd>
      </button>
      {open && typeof document !== 'undefined' ? createPortal((
        <div className="terminal-search" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <section aria-label="Search indicators" aria-modal="true" className="terminal-search__dialog" role="dialog">
            <div className="terminal-search__input-row">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search all Japan and US indicators"
                onChange={event => setQuery(event.target.value)}
                placeholder="Search CPI, JOLTS, wages, GDP…"
                ref={inputRef}
                type="search"
                value={query}
              />
              <button type="button" onClick={() => setOpen(false)}>ESC</button>
            </div>
            <div className="terminal-search__meta">
              <span>{results.length} dashboards</span>
              <span>Japan + United States</span>
            </div>
            <div className="terminal-search__results">
              {results.map(item => (
                <Link href={item.href} key={item.href} onClick={() => setOpen(false)}>
                  <b>{item.country}</b>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{isArchived(item) ? 'Archive · ' : ''}{item.description}</small>
                  </span>
                  <i aria-hidden="true">→</i>
                </Link>
              ))}
              {results.length === 0 ? (
                <p>No matching dashboard. Try an indicator name or data theme.</p>
              ) : null}
            </div>
          </section>
        </div>
      ), document.body) : null}
    </>
  )
}

function ShareControl({ onComplete }) {
  const [copied, setCopied] = useState(false)

  const sharePage = async () => {
    const shareData = {
      title: document.title,
      text: 'Macro Data Monitor',
      url: window.location.href,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(shareData.url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
      onComplete?.()
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setCopied(false)
      }
    }
  }

  return (
    <button className="terminal-share-button" type="button" onClick={sharePage}>
      <span>{copied ? 'Copied' : 'Share'}</span>
      <b aria-hidden="true">{copied ? '✓' : '↗'}</b>
    </button>
  )
}

export function SiteHeader() {
  const pathname = usePathname() || '/'
  const [menuOpen, setMenuOpen] = useState(false)
  const significanceLevel = significanceForPath(pathname)
  const significance = significanceLevel ? significanceDefinition(significanceLevel) : null
  const indicatorGuide = indicatorGuideForPath(pathname)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <header className="terminal-header">
      <div className="terminal-header__main">
        <Link className="terminal-brand" href="/">
          <span className="terminal-brand__mark">MD</span>
          <span className="terminal-brand__name">
            Macro Data <span className="terminal-brand__suffix">Monitor</span>
          </span>
        </Link>
        <button
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          className="terminal-menu-button"
          type="button"
          onClick={() => setMenuOpen(current => !current)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav
          className={`terminal-nav${menuOpen ? ' is-open' : ''}`}
          id="primary-navigation"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map(item => {
            const isActive = item.match(pathname)
            return (
              <Link
                aria-current={isActive ? 'page' : undefined}
                className={`terminal-nav__link${isActive ? ' is-active' : ''}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            )
          })}
          <IndicatorSearch />
          <ShareControl onComplete={() => setMenuOpen(false)} />
        </nav>
      </div>
      <div className="terminal-statusbar">
        <div className="terminal-statusbar__inner">
          <span className="terminal-statusbar__sources">Official data sources</span>
          <span>Japan · e-Stat / BOJ</span>
          <span>United States · FRED / BLS / BEA</span>
          <span>Workspace · Macro Monitor</span>
        </div>
      </div>
      {significance ? (
        <div className={`terminal-significance terminal-significance--${significanceLevel}`}>
          <div>
            <span>MACRO SIGNIFICANCE</span>
            <strong aria-label={`${significance.stars} ${significance.label}`}>{significance.stars} {significance.label}</strong>
            <small>{significance.description}</small>
            <Link href="/about#macro-significance">Methodology →</Link>
          </div>
        </div>
      ) : null}
      {indicatorGuide ? (
        <details className="terminal-indicator-guide">
          <summary>
            <span>ANALYSIS GUIDE</span>
            <strong>{indicatorGuide.why}</strong>
            <b>Open framework</b>
          </summary>
          <div className="terminal-indicator-guide__body">
            <article>
              <span>HOW TO READ</span>
              <p>{indicatorGuide.signal}</p>
            </article>
            <article>
              <span>MARKET LENS</span>
              <p>{indicatorGuide.market}</p>
            </article>
            <article>
              <span>DATA CAVEAT</span>
              <p>{indicatorGuide.caveat}</p>
            </article>
            <nav aria-label="Related indicators">
              <span>RELATED</span>
              <div>
                {indicatorGuide.related.map(item => (
                  <Link href={item.href} key={item.href}>{item.label} →</Link>
                ))}
              </div>
            </nav>
          </div>
        </details>
      ) : null}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="terminal-footer">
      <div className="terminal-footer__topline">
        <span>Macro Data Monitor · Official-source data</span>
        <nav aria-label="Site information">
          <Link href="/about">About & Methodology</Link>
          <Link href="/changelog">Changelog</Link>
          <Link href="/status">Data Status</Link>
          <a href="https://github.com/Hikky-fuji/macro-data-monitor" rel="noreferrer" target="_blank">GitHub ↗</a>
        </nav>
      </div>
      <p>
        This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.
        Macro Data Monitor is an independent research tool and does not provide investment advice.
      </p>
    </footer>
  )
}
