import { NextResponse } from 'next/server';

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

  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'LTA_ACCOUNT_KEY is not set on the server.' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${encodeURIComponent(
        stopCode
      )}`,
      {
        headers: { AccountKey: key, accept: 'application/json' },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `LTA DataMall returned HTTP ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ services: data.Services || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
