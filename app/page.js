'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const REFRESH_MS = 30000;
const LOAD_LABEL = { SEA: 'Seats available', SDA: 'Standing available', LSD: 'Limited standing' };
const TYPE_LABEL = { SD: 'Single deck', DD: 'Double deck', BD: 'Bendy' };

function minutesUntil(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.round((t - Date.now()) / 60000);
}

function formatArrival(iso) {
  const mins = minutesUntil(iso);
  if (mins === null) return { text: '—', due: false };
  if (mins <= 0) return { text: 'Arr', due: true };
  if (mins === 1) return { text: '1 min', due: false };
  return { text: `${mins} min`, due: false };
}

function findServiceRowsFor(stopCache, code, serviceNoFilter) {
  const cached = stopCache[code];
  if (!cached) return { loading: true };
  if (cached.error) return { error: cached.error };
  const all = cached.services || [];
  if (!serviceNoFilter) {
    return {
      rows: [...all].sort((a, b) =>
        (a.ServiceNo || '').localeCompare(b.ServiceNo || '', undefined, { numeric: true })
      ),
    };
  }
  const match = all.filter((s) => s.ServiceNo === serviceNoFilter);
  if (match.length === 0) return { notFound: true };
  return { rows: match };
}

function ServiceRow({ svc }) {
  const next1 = formatArrival(svc.NextBus?.EstimatedArrival);
  const next2 = formatArrival(svc.NextBus2?.EstimatedArrival);
  const next3 = formatArrival(svc.NextBus3?.EstimatedArrival);
  const load = svc.NextBus?.Load;
  const type = svc.NextBus?.Type;
  const wab = svc.NextBus?.Feature === 'WAB';
  const metaBits = [svc.Operator, type && TYPE_LABEL[type], wab && 'Wheelchair accessible'].filter(Boolean);

  return (
    <tr>
      <td>
        <span className="svc-no">{svc.ServiceNo || '—'}</span>
        <span className="svc-meta">{metaBits.join(' · ')}</span>
      </td>
      <td>
        <span className={`load-dot ${load && LOAD_LABEL[load] ? load : 'unknown'}`} />
        {load && LOAD_LABEL[load] ? LOAD_LABEL[load] : 'Unknown load'}
      </td>
      <td className="num">
        <span className={`arr-primary${next1.due ? ' due' : ''}`}>{next1.text}</span>
        <span className="arr-secondary">
          {[next2.text, next3.text].filter((t) => t && t !== '—').join('  ·  ')}
        </span>
      </td>
    </tr>
  );
}

function StopGroup({ code, group, stopCache, onRemove }) {
  const labeled = group.find((w) => w.label);
  const seen = new Set();
  const rows = [];

  group.forEach((w) => {
    const result = findServiceRowsFor(stopCache, code, w.service_no);
    if (result.loading) {
      rows.push(
        <tr className="row-error" key={w.id}>
          <td colSpan={3}>Loading {w.service_no ? `service ${w.service_no}` : 'arrivals'}…</td>
        </tr>
      );
      return;
    }
    if (result.error) {
      rows.push(
        <tr className="row-error" key={w.id}>
          <td colSpan={3}>Couldn&apos;t load this stop — {result.error}</td>
        </tr>
      );
      return;
    }
    if (result.notFound) {
      rows.push(
        <tr className="row-error" key={w.id}>
          <td colSpan={3}>Service {w.service_no} is not currently running through this stop.</td>
        </tr>
      );
      return;
    }
    (result.rows || []).forEach((svc) => {
      const key = `${code}/${svc.ServiceNo}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(<ServiceRow key={key} svc={svc} />);
    });
  });

  if (rows.length === 0) {
    rows.push(
      <tr className="row-error" key="empty">
        <td colSpan={3}>No arrivals returned for this stop right now.</td>
      </tr>
    );
  }

  return (
    <div className="stop-group">
      <div className="stop-head">
        <div>
          <div className="stop-eyebrow">Bus stop</div>
          <div className="stop-title">
            {labeled?.label || `Stop ${code}`} <span className="code">{code}</span>
          </div>
        </div>
        <div className="stop-actions">
          <button type="button" className="secondary" onClick={() => onRemove(code)}>
            Remove stop
          </button>
        </div>
      </div>
      <table className="services">
        <thead>
          <tr>
            <th>Service</th>
            <th>Load</th>
            <th className="num">Next arrivals</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export default function Page() {
  const [watches, setWatches] = useState([]);
  const [watchesLoaded, setWatchesLoaded] = useState(false);
  const [stopCache, setStopCache] = useState({});
  const [stopCode, setStopCode] = useState('');
  const [serviceNo, setServiceNo] = useState('');
  const [label, setLabel] = useState('');
  const [formError, setFormError] = useState('');
  const [now, setNow] = useState(new Date());
  const [nextRefreshAt, setNextRefreshAt] = useState(null);
  const stopCacheRef = useRef(stopCache);
  stopCacheRef.current = stopCache;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/watches');
        const data = await res.json();
        if (res.ok) setWatches(data.watches || []);
      } catch (e) {
        // network error on first load — empty state will show
      } finally {
        setWatchesLoaded(true);
      }
    })();
  }, []);

  const uniqueStopCodes = useCallback(() => {
    const seen = new Set();
    const out = [];
    watches.forEach((w) => {
      if (!seen.has(w.stop_code)) {
        seen.add(w.stop_code);
        out.push(w.stop_code);
      }
    });
    return out;
  }, [watches]);

  const fetchArrivals = useCallback(async (code) => {
    try {
      const res = await fetch(`/api/arrivals?stopCode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) return { services: null, error: data.error || 'Request failed' };
      return { services: data.services || [], error: null };
    } catch (err) {
      return { services: null, error: err.message };
    }
  }, []);

  const runRefresh = useCallback(async () => {
    const codes = uniqueStopCodes();
    if (codes.length === 0) return;
    const results = await Promise.all(codes.map(async (code) => [code, await fetchArrivals(code)]));
    setStopCache((prev) => {
      const next = { ...prev };
      results.forEach(([code, result]) => {
        next[code] = result;
      });
      return next;
    });
    setNextRefreshAt(Date.now() + REFRESH_MS);
  }, [uniqueStopCodes, fetchArrivals]);

  const stopCodesKey = uniqueStopCodes().join(',');

  useEffect(() => {
    if (!stopCodesKey) {
      setNextRefreshAt(null);
      return undefined;
    }
    runRefresh();
    const id = setInterval(runRefresh, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCodesKey]);

  async function handleAddWatch(e) {
    e.preventDefault();
    setFormError('');
    const code = stopCode.trim();
    if (!/^\d{3,5}$/.test(code)) {
      setFormError('Bus stop codes are 3–5 digit numbers, e.g. 83139.');
      return;
    }
    try {
      const res = await fetch('/api/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopCode: code, serviceNo, label }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || 'Could not save that stop.');
        return;
      }
      setWatches((prev) => [...prev, data.watch]);
      setStopCode('');
      setServiceNo('');
      setLabel('');
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function removeStopGroup(code) {
    const toRemove = watches.filter((w) => w.stop_code === code);
    setWatches((prev) => prev.filter((w) => w.stop_code !== code));
    await Promise.all(toRemove.map((w) => fetch(`/api/watches/${w.id}`, { method: 'DELETE' })));
  }

  const order = [];
  const byStop = {};
  watches.forEach((w) => {
    if (!byStop[w.stop_code]) {
      byStop[w.stop_code] = [];
      order.push(w.stop_code);
    }
    byStop[w.stop_code].push(w);
  });

  const secsLeft = nextRefreshAt ? Math.max(0, Math.round((nextRefreshAt - now.getTime()) / 1000)) : null;

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="wordmark">
          <small>Singapore · live transit</small>
          The Departure Board
        </div>
        <div className="masthead-meta">
          <div className="clock">
            {now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
          </div>
          <div>{now.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </header>

      <div className="section-label">Add a stop to watch</div>
      <div className="panel">
        <form className="add-form" onSubmit={handleAddWatch}>
          <div className="field">
            <label htmlFor="stopCode">Bus stop code</label>
            <input
              id="stopCode"
              type="text"
              value={stopCode}
              onChange={(e) => setStopCode(e.target.value)}
              placeholder="83139"
              inputMode="numeric"
              maxLength={5}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="serviceNo">Service no (optional)</label>
            <input
              id="serviceNo"
              type="text"
              value={serviceNo}
              onChange={(e) => setServiceNo(e.target.value)}
              placeholder="15"
              maxLength={6}
            />
          </div>
          <div className="field grow">
            <label htmlFor="stopLabel">Label (optional)</label>
            <input
              id="stopLabel"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Opp Blk 511"
            />
          </div>
          <button type="submit">Add stop</button>
        </form>
        {formError && <p className="form-note" style={{ color: 'var(--red)' }}>{formError}</p>}
        <p className="form-note">
          Leave service no blank to watch every service at that stop. Add the same stop again with a
          different service to track several at once.
        </p>
      </div>

      <div className="refresh-strip">
        <div className="status">
          <span className="dot" />
          {watches.length === 0
            ? 'Add a stop to start watching arrivals.'
            : secsLeft === null
            ? 'Loading…'
            : `Updated just now · next refresh in ${secsLeft}s`}
        </div>
        <button type="button" className="secondary" onClick={runRefresh}>
          Refresh now
        </button>
      </div>

      {watchesLoaded && watches.length === 0 && (
        <div className="empty">
          <h3>Nothing on the board yet</h3>
          <p>Add a bus stop code above — with a service number if you&apos;re after one particular bus — to see live arrivals here.</p>
        </div>
      )}

      {order.map((code) => (
        <StopGroup key={code} code={code} group={byStop[code]} stopCache={stopCache} onRemove={removeStopGroup} />
      ))}

      <footer>
        Data via LTA DataMall&apos;s v3 Bus Arrival service. Arrival times are estimates supplied by the
        operators and can change. Your watch list is stored in Supabase; the LTA account key stays on the
        server and is never sent to your browser.
      </footer>
    </div>
  );
}
