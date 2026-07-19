// /api/log-search.js
// El navegador llama a esto cada vez que una búsqueda de carta tiene éxito.
// Por qué pasa por el servidor y no llama a Supabase directo desde el
// navegador: así nadie puede abrir la consola (F12) y llamar mil veces a
// "sumar 1" a mano para hacer trampa en el ranking. La escritura solo la
// puede hacer esta función, con la clave secreta que vive en Vercel.
//
// Uso desde el frontend:
//   fetch('/api/log-search', { method:'POST', body: JSON.stringify({game, card_name}) })

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { game, card_name } = body || {};
  if (!game || !card_name) return res.status(400).json({ error: 'Faltan game y card_name.' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    // Si aún no configuraste las claves, no rompemos la búsqueda del usuario:
    // simplemente no se cuenta esta vez.
    return res.status(200).json({ skipped: true });
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_search`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_game: game, p_card_name: card_name })
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Registrar la búsqueda nunca debe romper la experiencia de búsqueda.
    return res.status(200).json({ ok: false, error: String(err.message || err) });
  }
}
