'use client'

import Link from 'next/link'
import { useState } from 'react'
import WorkspaceOperations from './WorkspaceOperations'
import WorkspacePulse from './WorkspacePulse'
import { isCorePage } from '../lib/core-indicators.mjs'
import { significanceDefinition } from '../lib/significance'

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
  '/us/consumption': 'BEA · Census · BLS · FRED',
  '/us/jolts': 'BLS · FRED',
  '/us/manufacturing': 'NY Fed · Philadelphia Fed · ISM',
  '/us/rates': 'Federal Reserve · Treasury · FRED',
  '/us-macro': 'FRED · BEA · Census',
}

function valueForLanguage(value, lang) {
  return typeof value === 'object' ? value[lang] : value
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function toneForGroup(groupName) {
  const name = groupName.toLowerCase()
  if (name.includes('price') || name.includes('inflation')) return 'tone-orange'
  if (name.includes('labor') || name.includes('employment') || name.includes('wage')) return 'tone-green'
  if (name.includes('sentiment') || name.includes('consumption')) return 'tone-teal'
  return 'tone-blue'
}

function sourceForPath(path, fallback) {
  return SOURCE_BY_PATH[path.split('#')[0]] ?? fallback
}

export default function MacroWorkspace({
  country,
  countryCode,
  title,
  description,
  indicators,
  bilingual = false,
  sourceNetwork,
}) {
  const [lang, setLang] = useState('en')
  const t = (value) => valueForLanguage(value, lang)
  const splitGroups = keep => indicators
    .map(group => ({ ...group, items: group.items.filter(item => isCorePage(item.href) === keep) }))
    .filter(group => group.items.length)
  const visibleIndicators = splitGroups(true)
  const archiveGroups = splitGroups(false)
  const coreCount = visibleIndicators.reduce((total, group) => total + group.items.length, 0)
  const archiveCount = archiveGroups.reduce((total, group) => total + group.items.length, 0)

  return (
    <main className="macro-workspace">
      <section className="macro-workspace__masthead">
        <div>
          <div className="macro-workspace__eyebrow">
            {countryCode} / MACRO WORKSPACE
          </div>
          <h1>{title}</h1>
          <p>{t(description)}</p>
        </div>

        <div className="macro-workspace__actions">
          <Link className="macro-workspace__country-link" href={countryCode === 'JP' ? '/us' : '/'}>
            {countryCode === 'JP' ? 'US Workspace' : 'Japan Workspace'}
          </Link>
          {bilingual ? (
            <button
              className="macro-workspace__language"
              type="button"
              onClick={() => setLang(current => current === 'en' ? 'ja' : 'en')}
            >
              {lang === 'en' ? '日本語' : 'English'}
            </button>
          ) : null}
        </div>
      </section>

      <section className="macro-workspace__summary" aria-label={`${country} workspace summary`}>
        <div>
          <span>Core</span>
          <strong>{coreCount} dashboards</strong>
        </div>
        <div>
          <span>Archive</span>
          <strong>{archiveCount} dashboards</strong>
        </div>
        <div>
          <span>Data network</span>
          <strong>{sourceNetwork}</strong>
        </div>
        <div>
          <span>Refresh</span>
          <strong className="macro-workspace__refresh">
            {countryCode === 'JP' ? 'Auto · 6-hour cache' : 'Auto · hourly cache'}
          </strong>
        </div>
      </section>

      <WorkspacePulse countryCode={countryCode} />
      <WorkspaceOperations countryCode={countryCode} />

      <div className="macro-workspace__body">
        <aside className="macro-workspace__rail" aria-label="Indicator categories">
          <div className="macro-workspace__rail-label">NAVIGATOR</div>
          {visibleIndicators.map((group, index) => {
            const groupName = t(group.group)
            const id = `section-${slugify(valueForLanguage(group.group, 'en'))}`
            return (
              <a key={id} href={`#${id}`} className={toneForGroup(valueForLanguage(group.group, 'en'))}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {groupName}
              </a>
            )
          })}
          {archiveCount ? (
            <a href="#archive" className="macro-workspace__rail-archive">
              <span>··</span>
              Archive ({archiveCount})
            </a>
          ) : null}
        </aside>

        <div className="macro-workspace__content">
          {visibleIndicators.map(group => {
            const englishGroupName = valueForLanguage(group.group, 'en')
            const groupName = t(group.group)
            const id = `section-${slugify(englishGroupName)}`
            const tone = toneForGroup(englishGroupName)

            return (
              <section className={`macro-section ${tone}`} id={id} key={id}>
                <header className="macro-section__header">
                  <div>
                    <i />
                    <h2>{groupName}</h2>
                  </div>
                  <span>{group.items.length} {group.items.length === 1 ? 'dashboard' : 'dashboards'}</span>
                </header>

                <div className="macro-section__grid">
                  {group.items.map((item, itemIndex) => {
                    const significance = significanceDefinition(item.significance)
                    return (
                      <Link
                        className="macro-tile"
                        href={item.href}
                        key={`${item.href}-${itemIndex}`}
                      >
                        <div className="macro-tile__topline">
                          <span>{t(item.badge)}</span>
                          <b aria-hidden="true">→</b>
                        </div>
                        <h3>{t(item.title)}</h3>
                        <p className="macro-tile__subtitle">{t(item.subtitle)}</p>
                        <p className="macro-tile__description">{t(item.desc)}</p>
                        <div
                          className={`macro-significance macro-significance--${item.significance}`}
                          title={significance.description}
                        >
                          <span aria-hidden="true">{significance.stars}</span>
                          <b>{significance.label}</b>
                          <span className="sr-only">{significance.stars} {significance.label}: {significance.description}</span>
                        </div>
                        <footer>
                          <span>{sourceForPath(item.href, sourceNetwork)}</span>
                          <span className="macro-tile__destination">Open dashboard</span>
                        </footer>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}

          {archiveCount ? (
            <details className="macro-archive" id="archive">
              <summary>
                <span>ARCHIVE</span>
                <strong>{archiveCount} reference dashboards</strong>
                <small>Outside the core monitoring set · feeds may lag and do not gate data-quality checks</small>
              </summary>
              <div className="macro-archive__groups">
                {archiveGroups.map(group => (
                  <div className="macro-archive__group" key={valueForLanguage(group.group, 'en')}>
                    <h3>{t(group.group)}</h3>
                    <ul>
                      {group.items.map(item => (
                        <li key={item.href}>
                          <Link href={item.href}>
                            <span>{t(item.title)}</span>
                            <small>{t(item.badge)} · {sourceForPath(item.href, sourceNetwork)}</small>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </main>
  )
}
