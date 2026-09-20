const LTA_URL = 'https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival';

// Shared by /api/arrivals (browser refreshes) and the notification cron
// job, so both paths use the exact same request shape.
export async function getArrivals(stopCode) {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    throw new Error('LTA_ACCOUNT_KEY is not set on the server.');
  }

  const res = await fetch(`${LTA_URL}?BusStopCode=${encodeURIComponent(stopCode)}`, {
    headers: { AccountKey: key, accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LTA DataMall returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.Services || [];
}
