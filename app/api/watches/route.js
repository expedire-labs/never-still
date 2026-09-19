import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabaseServer';

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('watches')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ watches: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const stopCode = (body.stopCode || '').trim();
    const serviceNo = (body.serviceNo || '').trim() || null;
    const label = (body.label || '').trim() || null;

    if (!/^\d{3,5}$/.test(stopCode)) {
      return NextResponse.json(
        { error: 'Bus stop codes are 3-5 digit numbers, e.g. 83139.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('watches')
      .insert({ stop_code: stopCode, service_no: serviceNo, label })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ watch: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
