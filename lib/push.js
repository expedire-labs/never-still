import webpush from 'web-push';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:you@example.com';

  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.'
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

// Sends one push payload to every stored subscription. This app has no
// per-user auth, so every subscribed device gets every notification —
// fine for a personal/household app watched by one or two phones.
export async function sendPushToAll(supabase, payload) {
  ensureConfigured();

  const { data: subs, error } = await supabase.from('push_subscriptions').select('*');
  if (error) throw error;

  return Promise.allSettled(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        // 404/410 means the subscription is dead (uninstalled, permission
        // revoked, etc.) — clean it up so we stop trying.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
        throw err;
      }
    })
  );
}
