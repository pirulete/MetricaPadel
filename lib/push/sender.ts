/**
 * Push Notification Sender — server-only (web-push).
 * Handles VAPID keys, single send (with 404/410 → expired), and bulk fire-and-forget.
 */

import webPush from 'web-push'
import { getActiveForBroadcast, markEndpointExpired } from '@/lib/db/queries/push'

// Lazily initialized after VAPID check
let _vapidConfigured = false

// La pública es, por definición, pública: se acepta VAPID_PUBLIC_KEY o su
// espejo NEXT_PUBLIC_VAPID_PUBLIC_KEY (por si solo se configuró la segunda).
function resolvePublicKey(): string | undefined {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
}

function ensureVapid() {
  if (_vapidConfigured) return

  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  const publicKey = resolvePublicKey()
  const privateKey = process.env.VAPID_PRIVATE_KEY

  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars.')
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  _vapidConfigured = true
}

export function getVapidPublicKey(): string {
  const key = resolvePublicKey()
  if (!key) throw new Error('VAPID_PUBLIC_KEY not configured')
  return key
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string
  campaignId?: string
}

/** Subscription object with crypto keys. */
export interface PushSubWithKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export interface SendResult {
  success: boolean
  endpoint: string
  error?: string
}

/**
 * Send a push notification to a single subscription.
 * On 404/410 → marks endpoint as expired (fire-and-forget cleanup).
 */
export async function sendPushNotification(
  subscription: PushSubWithKeys,
  payload: PushPayload,
): Promise<SendResult> {
  try {
    ensureVapid()

    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icons/icon-192.png',
        badge: payload.badge || '/icons/icon-192.png',
        url: payload.url || '/dashboard',
        campaignId: payload.campaignId || null,
        data: payload,
      }),
      { TTL: 60 * 60 * 24 }, // 24h TTL
    )

    return { success: true, endpoint: subscription.endpoint }
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    const error = err instanceof Error ? err.message : 'Unknown error'

    // 404 Gone / 410 Gone → endpoint no longer valid → mark expired
    if (status === 404 || status === 410) {
      // Fire-and-forget cleanup — don't await
      markEndpointExpired(subscription.endpoint).catch(() => {})
    }

    console.warn(`[Push] Send failed: HTTP ${status} endpoint=${subscription.endpoint.slice(-12)} err=${error}`)
    return { success: false, endpoint: subscription.endpoint, error: `HTTP ${status}: ${error}` }
  }
}

/**
 * Send push notification to all active subscriptions for given user IDs or subscription objects.
 * Accepts either:
 *   - string[] of userIds: fetches active subscriptions from DB, filters by userIds, then sends.
 *   - PushSubWithKeys[] of subscription objects: sends directly to each.
 * Fire-and-forget: caller should NOT await this.
 */
export async function sendBulkPush(
  targets: string[] | PushSubWithKeys[],
  payload: PushPayload,
): Promise<void> {
  // Don't await — fire-and-forget
  sendBulkPushInternal(targets, payload).catch((err) => {
    console.error('[Push] Bulk send failed:', err)
  })
}

/**
 * Tracked variant: awaits delivery and returns results.
 * Use when caller needs to know sent/failed counts (e.g. admin 1:1 push).
 */
export async function sendBulkPushTracked(
  targets: string[] | PushSubWithKeys[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  return sendBulkPushInternalTracked(targets, payload).catch((err) => {
    console.error('[Push] Bulk tracked failed:', err)
    return { sent: 0, failed: typeof targets[0] === 'string' ? 0 : targets.length }
  })
}

async function sendBulkPushInternal(
  targets: string[] | PushSubWithKeys[],
  payload: PushPayload,
): Promise<void> {
  if (targets.length === 0) return

  try {
    ensureVapid()
  } catch {
    // VAPID not configured — silently skip (dev environment)
    return
  }

  let subs: PushSubWithKeys[]

  if (typeof targets[0] === 'string') {
    // targets is string[] of userIds — fetch from DB
    const allSubs = await getActiveForBroadcast()
    const userIdSet = new Set(targets as string[])
    subs = allSubs.filter((s) => userIdSet.has(s.userId))
  } else {
    // targets is PushSubWithKeys[] — use directly
    subs = targets as PushSubWithKeys[]
  }

  if (subs.length === 0) return

  const results = await Promise.allSettled(
    subs.map((sub) =>
      sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      )
    )
  )

  const succeeded = results.filter(
    (r) => r.status === 'fulfilled' && r.value.success
  ).length
  const failed = results.length - succeeded

  if (failed > 0) {
    console.warn(`[Push] Bulk: ${succeeded} sent, ${failed} failed`)
  }
}

/**
 * Tracked internal: resolves with sent/failed counts for callers that need them.
 */
async function sendBulkPushInternalTracked(
  targets: string[] | PushSubWithKeys[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (targets.length === 0) return { sent: 0, failed: 0 }

  // Re-throw VAPID errors — caller must handle them (don't swallow silently)
  ensureVapid()

  let subs: PushSubWithKeys[]

  if (typeof targets[0] === 'string') {
    const allSubs = await getActiveForBroadcast()
    const userIdSet = new Set(targets as string[])
    subs = allSubs.filter((s) => userIdSet.has(s.userId))
  } else {
    subs = targets as PushSubWithKeys[]
  }

  if (subs.length === 0) return { sent: 0, failed: 0 }

  const results = await Promise.allSettled(
    subs.map((sub) =>
      sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      )
    )
  )

  const sent = results.filter(
    (r) => r.status === 'fulfilled' && r.value.success
  ).length
  const failed = results.length - sent

  if (failed > 0) {
    console.warn(`[Push] Tracked: ${sent} sent, ${failed} failed`)
  }

  return { sent, failed }
}