import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabaseServer';

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ notifications: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = (body.name || '').trim();
    const days = Array.isArray(body.days)
      ? Array.from(new Set(body.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)))
      : [];
    const timeOfDay = (body.timeOfDay || '').trim();
    const stopCode = (body.stopCode || '').trim();
    const serviceNo = (body.serviceNo || '').trim();
    const walkMinutes = Number(body.walkMinutes);
    const bufferMinutes = Number.isFinite(Number(body.bufferMinutes)) ? Number(body.bufferMinutes) : 3;
    const monitorMinutes = Number.isFinite(Number(body.monitorMinutes)) ? Number(body.monitorMinutes) : 45;

    if (!name) return NextResponse.json({ error: 'Give the notification a name.' }, { status: 400 });
    if (days.length === 0) return NextResponse.json({ error: 'Pick at least one day.' }, { status: 400 });
    if (!/^\d{2}:\d{2}$/.test(timeOfDay)) {
      return NextResponse.json({ error: 'Time must be in HH:MM format.' }, { status: 400 });
    }
    if (!/^\d{3,5}$/.test(stopCode)) {
      return NextResponse.json({ error: 'Choose a valid bus stop.' }, { status: 400 });
    }
    if (!serviceNo) return NextResponse.json({ error: 'Choose a bus service.' }, { status: 400 });
    if (!Number.isFinite(walkMinutes) || walkMinutes < 0) {
      return NextResponse.json({ error: 'Walking time must be a number of minutes.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        name,
        days,
        time_of_day: `${timeOfDay}:00`,
        stop_code: stopCode,
        service_no: serviceNo,
        walk_minutes: walkMinutes,
        buffer_minutes: bufferMinutes,
        monitor_minutes: monitorMinutes,
        enabled: true,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ notification: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
