import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Mission Control — AI Agent Coordination Dashboard';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a1a12',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          padding: '80px',
        }}
      >
        {/* Logo / badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '12px',
              background: 'rgba(45,212,122,0.15)',
              border: '1px solid rgba(45,212,122,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}
          >
            🧭
          </div>
          <span
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: '#a3b8a8',
              letterSpacing: '-0.02em',
            }}
          >
            archonhq.ai
          </span>
        </div>

        {/* Main headline */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#f1f5f0',
            textAlign: 'center',
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            marginBottom: '24px',
          }}
        >
          Mission Control
        </div>

        {/* Sub-headline */}
        <div
          style={{
            fontSize: 26,
            color: '#a3b8a8',
            textAlign: 'center',
            lineHeight: 1.4,
            maxWidth: 800,
            marginBottom: '40px',
          }}
        >
          AI agent coordination dashboard with smart LLM routing.
          Cut your AI spend by up to 50%.
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: 'flex',
            gap: '48px',
            borderTop: '1px solid rgba(45,212,122,0.15)',
            paddingTop: '32px',
          }}
        >
          {[
            { label: 'LLM cost saving', value: '~50%' },
            { label: 'Providers', value: '7' },
            { label: 'Routing signals', value: '5' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
            >
              <span style={{ fontSize: 40, fontWeight: 800, color: '#2dd47a' }}>{stat.value}</span>
              <span style={{ fontSize: 14, color: '#6a7f6f', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
