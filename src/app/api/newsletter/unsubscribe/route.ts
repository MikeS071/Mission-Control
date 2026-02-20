import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function decodeToken(token: string): string | null {
  try {
    return Buffer.from(token, 'base64url').toString('utf-8')
  } catch {
    return null
  }
}

async function handleUnsubscribe(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const email = decodeToken(token)
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  try {
    const result = await pool.query(
      'DELETE FROM waitlist WHERE email = $1 RETURNING email',
      [email]
    )
    const status = result.rowCount === 0 ? 'already' : 'ok'
    return NextResponse.redirect(
      new URL(`/unsubscribe?status=${status}&email=${encodeURIComponent(email)}`, req.url)
    )
  } catch (err) {
    console.error('[unsubscribe]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export const GET  = handleUnsubscribe
export const POST = handleUnsubscribe
