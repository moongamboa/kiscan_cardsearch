// /api/ebay-search.js
// Proxy a la eBay Browse API (gratis hasta ~5.000 llamadas/día).
// eBay usa OAuth de "cliente" (no hace falta que el usuario tenga cuenta):
// primero pedimos un token con tu Client ID/Secret, luego buscamos.
// El token se cachea en memoria de la función para no pedirlo en cada búsqueda.
//
// Uso desde el frontend:
//   fetch('/api/ebay-search?q=SS4%20Vegito%20BT31')

let cachedToken = null;
let tokenExpiresAt = 0;

async function getEbayToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET no configuradas en el servidor.');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const resp = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basic}`
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });
  if (!resp.ok) throw new Error(`eBay OAuth falló: ${resp.status}`);
  const json = await resp.json();
  cachedToken = json.access_token;
  tokenExpiresAt = now + json.expires_in * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Falta el parámetro q (texto a buscar).' });

  try {
    const token = await getEbayToken();
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=10&category_ids=2536`; // 2536 = Trading Card Games
    const upstream = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_ES' // cambia a EBAY_US, EBAY_GB, etc. según te interese
      }
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `eBay respondió ${upstream.status}` });
    }
    const data = await upstream.json();

    // Devolvemos solo lo que la app necesita, ya limpio
    const items = (data.itemSummaries || []).map(it => ({
      title: it.title,
      price: it.price ? Number(it.price.value) : null,
      currency: it.price ? it.price.currency : null,
      condition: it.condition,
      url: it.itemWebUrl,
      image: it.image ? it.image.imageUrl : null,
      seller: it.seller ? it.seller.username : null,
    }));

    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
