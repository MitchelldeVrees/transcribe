import { DateTime } from 'luxon';

/**
 * Compute the current usage period for a user.
 * - timezone: IANA TZ (e.g. 'Europe/Amsterdam')
 * - renew_day: typically 1 (first of month). If you ever want the 10th, this supports it.
 */
export function currentPeriod(timezone: string, renew_day: number | null) {
  const tz = timezone || 'UTC';
  const rd = Math.max(1, Math.min(28, Number(renew_day || 1))); // clamp to 1..28 to avoid edge issues

  const now = DateTime.now().setZone(tz);

  // Determine the start boundary for this billing period
  let periodStart = now.startOf('month').set({ day: rd, hour: 0, minute: 0, second: 0, millisecond: 0 });

  // If today is *before* the renew day-in-month, then we're still in the previous period
  if (now < periodStart) {
    // Go back one month and set day=renew_day
    const prev = periodStart.minus({ months: 1 });
    periodStart = prev;
  }

  // Period id:
  // If renew_day=1, 'YYYY-MM' is nice. Otherwise include the day to disambiguate.
  const periodId = rd === 1
    ? periodStart.toFormat('yyyy-LL')
    : periodStart.toFormat('yyyy-LL-dd');

  // End is next month’s boundary @ renew_day
  const next = periodStart.plus({ months: 1 });

  const startIso = periodStart.toUTC().toISO();
  const endIso = next.toUTC().toISO();
  if (!startIso || !endIso) {
    throw new Error('Unable to compute period boundaries');
  }

  return {
    periodId,
    startIso,
    endIso,
    timezone: tz,
    renewDay: rd,
  };
}
