import { NextResponse } from 'next/server';
import { getArrivals } from '../../../lib/lta';

// GET /api/arrivals?stopCode=83139
// Proxies LTA DataMall's v3 BusArrival endpoint so the AccountKey never
// reaches the browser, and so the browser never hits LTA's API directly
// (avoiding any CORS issues on their end).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const stopCode = searchParams.get('stopCode');

  if (!stopCode || !/^\d{3,5}$/.test(stopCode)) {
    return NextResponse.json(
      { error: 'A valid stopCode query parameter is required.' },
      { status: 400 }
    );
  }

  try {
    const services = await getArrivals(stopCode);
    return NextResponse.json({ services });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
