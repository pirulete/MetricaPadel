/**
 * Determines whether a push notification should be sent based on user preferences.
 *
 * @param pushPreferences - User's push_preferences array from DB (text[]).
 *   - null/undefined → true (default wildcard, user hasn't configured)
 *   - ['*'] → true (wildcard, receive all)
 *   - [] → false (explicitly opted out of all push types)
 *   - ['booking_confirmed', 'plan_activated'] → true only for those types
 * @param eventType - The event type string to check (e.g. 'plan_activated')
 * @returns true if push should be sent, false otherwise
 */
export function shouldSendPush(
  pushPreferences: string[] | null | undefined,
  eventType: string
): boolean {
  if (!pushPreferences) return true;
  if (pushPreferences.length === 0) return false;
  if (pushPreferences.includes('*')) return true;
  return pushPreferences.includes(eventType);
}