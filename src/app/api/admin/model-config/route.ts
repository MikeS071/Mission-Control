import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenantSettings } from '@/db/schema';
import { db } from '@/lib/db';
import { requireAdmin } from '@/app/api/admin/_auth';

const TenantConfigSchema = z.object({
  tenantId: z.number().int().positive(),
  modelConfig: z.record(z.string(), z.unknown()),
});

const TenantIdSchema = z.object({
  tenantId: z.number().int().positive(),
});

type SettingsRecord = Record<string, unknown>;

function toSettingsRecord(settings: unknown): SettingsRecord {
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    return settings as SettingsRecord;
  }
  return {};
}

export async function GET(_req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  const rows = await db
    .select({
      tenantId: tenantSettings.tenantId,
      settings: tenantSettings.settings,
    })
    .from(tenantSettings);

  return NextResponse.json({
    configs: rows.map((row) => ({
      tenantId: row.tenantId,
      modelConfig: toSettingsRecord(row.settings).models ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const parsed = TenantConfigSchema.parse(await req.json());

    const [existing] = await db
      .select({
        tenantId: tenantSettings.tenantId,
        settings: tenantSettings.settings,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, parsed.tenantId))
      .limit(1);

    if (existing) {
      const currentSettings = toSettingsRecord(existing.settings);
      const [updated] = await db
        .update(tenantSettings)
        .set({
          settings: { ...currentSettings, models: parsed.modelConfig },
          updatedAt: new Date(),
        })
        .where(eq(tenantSettings.tenantId, parsed.tenantId))
        .returning({
          tenantId: tenantSettings.tenantId,
          settings: tenantSettings.settings,
        });

      return NextResponse.json({
        tenantId: updated?.tenantId ?? parsed.tenantId,
        modelConfig: toSettingsRecord(updated?.settings).models ?? parsed.modelConfig,
      });
    }

    const [created] = await db
      .insert(tenantSettings)
      .values({
        tenantId: parsed.tenantId,
        settings: { models: parsed.modelConfig },
        updatedAt: new Date(),
      })
      .returning({
        tenantId: tenantSettings.tenantId,
        settings: tenantSettings.settings,
      });

    return NextResponse.json({
      tenantId: created?.tenantId ?? parsed.tenantId,
      modelConfig: toSettingsRecord(created?.settings).models ?? parsed.modelConfig,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const parsed = TenantConfigSchema.parse(await req.json());

    const [existing] = await db
      .select({
        tenantId: tenantSettings.tenantId,
        settings: tenantSettings.settings,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, parsed.tenantId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Model config not found' }, { status: 404 });
    }

    const currentSettings = toSettingsRecord(existing.settings);
    const [updated] = await db
      .update(tenantSettings)
      .set({
        settings: { ...currentSettings, models: parsed.modelConfig },
        updatedAt: new Date(),
      })
      .where(eq(tenantSettings.tenantId, parsed.tenantId))
      .returning({
        tenantId: tenantSettings.tenantId,
        settings: tenantSettings.settings,
      });

    return NextResponse.json({
      tenantId: updated?.tenantId ?? parsed.tenantId,
      modelConfig: toSettingsRecord(updated?.settings).models ?? parsed.modelConfig,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if ('response' in guard) return guard.response;

  try {
    const parsed = TenantIdSchema.parse(await req.json());

    const [existing] = await db
      .select({
        tenantId: tenantSettings.tenantId,
        settings: tenantSettings.settings,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, parsed.tenantId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Model config not found' }, { status: 404 });
    }

    const currentSettings = toSettingsRecord(existing.settings);
    const nextSettings = { ...currentSettings };
    delete nextSettings.models;

    await db
      .update(tenantSettings)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(tenantSettings.tenantId, parsed.tenantId))
      .returning({ tenantId: tenantSettings.tenantId });

    return NextResponse.json({
      success: true,
      tenantId: parsed.tenantId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
