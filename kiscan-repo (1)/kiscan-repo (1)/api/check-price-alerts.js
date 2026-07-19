// /api/check-price-alerts.js
//
// Esta función NO la llama el navegador. La dispara Vercel Cron una vez al
// día (configurado en vercel.json) sin que nadie tenga que hacer nada.
//
// Qué hace, paso a paso:
//   1. Se autentica frente a Vercel Cron (para que nadie más pueda llamarla).
//   2. Pide a Supabase todas las alertas activas (price_alerts.active = true).
//   3. Para cada una, mira el precio actual real en Scryfall (Magic) o
//      Pokémon TCG API (Pokémon).
//   4. Si el precio actual ya es igual o menor al que pediste, te envía un
//      email con Resend y desactiva la alerta (para no repetirte el aviso).
//
// Variables de entorno que necesita (Vercel → Settings → Environment Variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  → para leer/escribir sin restricciones de RLS
//   RESEND_API_KEY                            → para enviar el email
//   ALERT_EMAIL_FROM (opcional)               → remitente, por defecto onboarding@resend.dev
//   CRON_SECRET                               → Vercel la envía sola si la defines (ver README)

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // 1) Verificación de que quien llama es realmente el cron de Vercel.
  //    Si defines CRON_SECRET en Vercel, la plataforma añade sola esta cabecera.
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor.' });
  }

  // 2) Traer alertas activas + email del usuario dueño de cada una.
  //    Usamos la REST API de Supabase directamente (sin librería) con la
  //    service_role key, que se salta RLS porque es una tarea de servidor,
  //    no una petición de un usuario concreto.
  const alertsResp = await fetch(
    `${SUPABASE_URL}/rest/v1/price_alerts?active=eq.true&select=*`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!alertsResp.ok) {
    return res.status(502).json({ error: 'No se pudieron leer las alertas de Supabase.' });
  }
  const alerts = await alertsResp.json();

  const results = [];
  for (const alert of alerts) {
    try {
      const current = await getCurrentPrice(alert.game, alert.card_name);
      if (current == null) { results.push({ alert: alert.id, skipped: 'sin precio disponible' }); continue; }

      if (current <= Number(alert.target_price)) {
        // Precio bajó lo suficiente: avisar y desactivar para no repetir.
        const email = await getUserEmail(SUPABASE_URL, SERVICE_KEY, alert.user_id);
        if (email && RESEND_KEY) {
          await sendAlertEmail(RESEND_KEY, email, alert, current);
        }
        await fetch(`${SUPABASE_URL}/rest/v1/price_alerts?id=eq.${alert.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal'
          },
          body: JSON.stringify({ active: false })
        });
        results.push({ alert: alert.id, notified: true, current });
      } else {
        results.push({ alert: alert.id, notified: false, current });
      }
    } catch (err) {
      results.push({ alert: alert.id, error: String(err.message || err) });
    }
  }

  return res.status(200).json({ checked: alerts.length, results });
}

/* ---- Precio actual real, reutilizando las mismas fuentes gratuitas ---- */
async function getCurrentPrice(game, cardName) {
  if (game === 'magic') {
    const r = await fetch('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(cardName));
    if (!r.ok) return null;
    const c = await r.json();
    const p = c.prices || {};
    return p.eur ? Number(p.eur) : (p.usd ? Number(p.usd) : null);
  }
  if (game === 'pokemon') {
    const r = await fetch('https://api.pokemontcg.io/v2/cards?q=name:"' + encodeURIComponent(cardName) + '"&pageSize=1');
    if (!r.ok) return null;
    const j = await r.json();
    const c = j.data && j.data[0];
    if (!c) return null;
    const cm = c.cardmarket && c.cardmarket.prices;
    return cm ? Number(cm.trendPrice || cm.averageSellPrice || 0) || null : null;
  }
  // one piece / dbs: de momento sin fuente de precio automatizada en el cron
  // (se podría añadir usando /api/ebay-search internamente si hace falta).
  return null;
}

async function getUserEmail(url, key, userId) {
  // auth.users no es accesible por REST normal; usamos el endpoint admin.
  const r = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u.email || null;
}

async function sendAlertEmail(resendKey, toEmail, alert, currentPrice) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM || 'KiScan <onboarding@resend.dev>',
      to: [toEmail],
      subject: `⚡ ${alert.card_name} bajó a ${currentPrice.toFixed(2)} €`,
      html: `<p>Tu alerta se cumplió.</p>
             <p><b>${alert.card_name}</b> está ahora a <b>${currentPrice.toFixed(2)} €</b>
             (querías ${Number(alert.target_price).toFixed(2)} € o menos).</p>
             <p>Entra en KiScan y busca la carta para ver dónde comprarla.</p>`
    })
  });
}
