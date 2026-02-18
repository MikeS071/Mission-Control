import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenantSettings } from '@/db/schema';
import { getTenantId } from '@/lib/tenant';

type SettingsPayload = {
  anthropicKey?: string;
  openaiKey?: string;
  xaiKey?: string;
  models?: {
    mainAgent?: string;
    subagents?: string;
    deepResearch?: string;
    costEfficient?: string;
  };
  notifications?: {
    telegramBotToken?: string;
    telegramChatId?: string;
  };
  gateway?: {
    url?: string;
    token?: string;
    connected?: boolean;
  };
  wizardCompleted?: boolean;
};

export async function GET(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [row] = await db
    .select({ settings: tenantSettings.settings, updatedAt: tenantSettings.updatedAt })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  return NextResponse.json({ settings: (row?.settings ?? {}) as SettingsPayload, updatedAt: row?.updatedAt ?? null });
}

export async function POST(req: NextRequest) {
  const tenantId = getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as { settings?: SettingsPayload; merge?: boolean; testNotification?: boolean };

  if (body.testNotification) {
    const token = body.settings?.notifications?.telegramBotToken?.trim();
    const chatId = body.settings?.notifications?.telegramChatId?.trim();
    if (!token || !chatId) {
      return NextResponse.json({ error: 'Telegram bot token and chat ID are required' }, { status: 400 });
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '✅ OpenClaw setup test message: notifications are working!' }),
    });

    const data = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!response.ok || !data?.ok) {
      return NextResponse.json({ ok: false, error: data?.description ?? 'Failed to send Telegram test message' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  }

  const incoming = (body.settings ?? {}) as SettingsPayload;
  const merge = body.merge ?? true;

  const [existing] = await db
    .select({ id: tenantSettings.id, settings: tenantSettings.settings })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const nextSettings = merge ? { ...(existing?.settings as object | undefined), ...incoming } : incoming;

  if (existing) {
    const [updated] = await db
      .update(tenantSettings)
      .set({ settings: nextSettings, updatedAt: new Date() })
      .where(and(eq(tenantSettings.id, existing.id), eq(tenantSettings.tenantId, tenantId)))
      .returning({ settings: tenantSettings.settings, updatedAt: tenantSettings.updatedAt });

    return NextResponse.json({ settings: (updated?.settings ?? {}) as SettingsPayload, updatedAt: updated?.updatedAt ?? null });
  }

  const [created] = await db
    .insert(tenantSettings)
    .values({ tenantId, settings: nextSettings, updatedAt: new Date() })
    .returning({ settings: tenantSettings.settings, updatedAt: tenantSettings.updatedAt });

  return NextResponse.json({ settings: (created?.settings ?? {}) as SettingsPayload, updatedAt: created?.updatedAt ?? null });
}
