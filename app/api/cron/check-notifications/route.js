import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabaseServer';
import { getArrivals } from '../../../../lib/lta';
import { sendPushToAll } from '../../../../lib/push';

export const dynamic = 'force-dynamic';

// Call this endpoint every minute (Vercel Cron on Pro, or an external
// pinger like cron-job.org on Hobby — see SETUP_NOTIFICATIONS.md).

function sgtParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return {
    dayOfWeek: weekdayIndex,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesUntil(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.round((t - Date.now()) / 60000);
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    const urlSecret = new URL(request.url).searchParams.get('secret');
    if (authHeader !== `Bearer ${secret}` && urlSecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabaseServerClient();
  const { dayOfWeek, dateStr, minutesOfDay } = sgtParts(new Date());

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('enabled', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fired = [];
  const skipped = [];
  const arrivalsCache = {};

  for (const n of notifications || []) {
    try {
      if (!Array.isArray(n.days) || !n.days.includes(dayOfWeek)) continue;
      if (n.last_fired_on === dateStr) continue;

      const startMin = timeToMinutes(n.time_of_day);
      const windowEnd = startMin + (n.monitor_minutes ?? 45);
      if (minutesOfDay < startMin || minutesOfDay > windowEnd) continue;

      if (!arrivalsCache[n.stop_code]) {
        arrivalsCache[n.stop_code] = await getArrivals(n.stop_code);
      }
      const services = arrivalsCache[n.stop_code];
      const svc = services.find((s) => s.ServiceNo === n.service_no);
      const etaMinutes = minutesUntil(svc?.NextBus?.EstimatedArrival);

      if (etaMinutes === null) {
        skipped.push({ id: n.id, reason: 'no live arrival for this service yet' });
        continue;
      }

      const leaveInMinutes = etaMinutes - n.walk_minutes - n.buffer_minutes;
      if (leaveInMinutes > 0) {
        skipped.push({ id: n.id, reason: `${leaveInMinutes} min of buffer left` });
        continue;
      }

      await sendPushToAll(supabase, {
        title: n.name,
        body: `Leave now to catch the ${n.service_no} in ${etaMinutes} min${etaMinutes === 1 ? '' : 's'}.`,
        tag: `notif-${n.id}-${dateStr}`,
        url: '/',
      });

      await supabase.from('notifications').update({ last_fired_on: dateStr }).eq('id', n.id);
      fired.push(n.id);
    } catch (err) {
      skipped.push({ id: n.id, reason: err.message });
    }
  }

  return NextResponse.json({ checked: (notifications || []).length, fired, skipped });
}
