export type TelegramIngressMode = 'mc' | 'openclaw';

/**
 * Controls who is the Telegram ingress:
 * - 'mc': Telegram webhook points at Mission Control (MC) and MC gates/forwards to OpenClaw.
 * - 'openclaw': Telegram is handled by the default OpenClaw Telegram channel (polling/webhook).
 *
 * IMPORTANT: Telegram supports either webhook or getUpdates polling at a time.
 * If mode='openclaw', ensure the bot webhook is deleted or pointed at OpenClaw.
 */
export function getTelegramIngressMode(): TelegramIngressMode {
  const raw = (process.env.MC_TELEGRAM_INGRESS_MODE ?? 'mc').toLowerCase();
  return raw === 'openclaw' ? 'openclaw' : 'mc';
}

export function isMcTelegramBridgeEnabled(): boolean {
  return getTelegramIngressMode() === 'mc';
}
