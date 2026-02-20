import Link from 'next/link'

interface Props {
  searchParams: Promise<{ status?: string; email?: string }>
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const { status, email } = await searchParams
  const isOk      = status === 'ok'
  const isAlready = status === 'already'
  const showEmail = email ? decodeURIComponent(email) : null

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4"
          style={{ background: '#0a1a12', color: '#f1f5f0' }}>
      {/* bg glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 500, height: 300, borderRadius: '50%',
          background: 'radial-gradient(ellipse,rgba(45,212,122,0.06) 0%,transparent 70%)',
        }} />
      </div>

      <div style={{
        background: '#0f2418', border: '1px solid #1a3020', borderRadius: 16,
        padding: '40px 40px', maxWidth: 440, width: '100%', textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>
            🧭 <span style={{ color: '#f1f5f0' }}>Archon</span>
            <span style={{ color: '#ef4444' }}>HQ</span>
          </span>
        </div>

        {isOk || isAlready ? (
          <>
            <div style={{
              fontSize: 40, marginBottom: 16,
            }}>
              {isOk ? '✅' : 'ℹ️'}
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              {isOk ? "You're unsubscribed" : 'Already unsubscribed'}
            </h1>
            {showEmail && (
              <p style={{ fontSize: 14, color: '#a3b8a8', marginBottom: 16 }}>
                {showEmail}
              </p>
            )}
            <p style={{ fontSize: 14, color: '#a3b8a8', lineHeight: 1.6, marginBottom: 24 }}>
              {isOk
                ? "You've been removed from the ArchonHQ mailing list. You won't receive any more emails from us."
                : "This address is already not on our mailing list."}
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
              Unsubscribe
            </h1>
            <p style={{ fontSize: 14, color: '#a3b8a8', lineHeight: 1.6, marginBottom: 24 }}>
              To unsubscribe, click the link in one of our emails.
              If you need help, reply to any newsletter email.
            </p>
          </>
        )}

        <Link
          href="/"
          style={{
            display: 'inline-block', borderRadius: 8, padding: '10px 24px',
            fontSize: 14, fontWeight: 700, textDecoration: 'none', color: '#fff',
            background: 'linear-gradient(135deg,#ff3b6f,#e91e5a)',
          }}
        >
          Back to ArchonHQ →
        </Link>
      </div>
    </main>
  )
}
