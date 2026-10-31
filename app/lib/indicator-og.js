import { ImageResponse } from 'next/og'
import { SITE_HOST } from './site.mjs'

export const OG_SIZE = { width: 1200, height: 630 }

export function createIndicatorOg({ eyebrow, title, subtitle, accent = '#f08a24' }) {
  return new ImageResponse(
    (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        padding: 56,
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#1c2023',
        color: '#f5f7f8',
        fontFamily: 'Arial, sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 70,
            height: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accent,
            color: '#181818',
            fontSize: 27,
            fontWeight: 800,
          }}>MD</div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>Macro Data Monitor</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: accent, fontSize: 20, letterSpacing: 4 }}>{eyebrow}</div>
          <div style={{ display: 'flex', maxWidth: 1030, marginTop: 18, fontSize: 66, fontWeight: 800, lineHeight: 1.04 }}>{title}</div>
          <div style={{ display: 'flex', maxWidth: 980, marginTop: 18, color: '#c7cdd1', fontSize: 24, lineHeight: 1.35 }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aeb7bc', fontSize: 20 }}>
          <div style={{ display: 'flex' }}>Official data · transparent methodology</div>
          <div style={{ display: 'flex', color: '#60d4af' }}>{SITE_HOST}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
