import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLIENT_ID     = 'SHhPRzFpc0tBS1BaeUp1VjBUMC06MTpjaQ';
const CLIENT_SECRET = 'W5UJQMumYGfBsg9CT4pywfbWQYMm_WnaBKmcFG-gl3nW8p0N0e';
const REDIRECT_URI  = 'https://ocprd-sgp1-01.tailb9b7d3.ts.net:3000/api/x-callback';
const TOKEN_PATH    = path.join(os.homedir(), '.config/x-tokens.json');

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'no code' }, { status: 400 });

  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code_verifier: 'challenge_verifier_navi_2026', // matches the code_challenge in the auth URL
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new NextResponse(`Token exchange failed: ${err}`, { status: 500 });
  }

  const tokens = await res.json();
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...tokens, saved_at: new Date().toISOString() }, null, 2), { mode: 0o600 });

  return new NextResponse(
    '<h2 style="font-family:sans-serif;color:green;padding:2rem">✅ X authorized! You can close this tab.</h2>',
    { headers: { 'content-type': 'text/html' } }
  );
}
