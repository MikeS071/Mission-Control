import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { waitlist } from '@/db/schema'

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

  // Use NEXTAUTH_URL as base to avoid redirecting to internal proxy URL
  const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://archonhq.ai').replace(/\/$/, '')

  try {
    const deleted = await db
      .delete(waitlist)
      .where(eq(waitlist.email, email))
      .returning({ email: waitlist.email })

    const status = deleted.length === 0 ? 'already' : 'ok'
    return NextResponse.redirect(
      `${baseUrl}/unsubscribe?status=${status}&email=${encodeURIComponent(email)}`
    )
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export const GET  = handleUnsubscribe
export const POST = handleUnsubscribe
