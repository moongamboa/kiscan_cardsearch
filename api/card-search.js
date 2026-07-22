// /api/card-search.js
// Función serverless de Vercel (Node.js). Se despliega sola: cualquier archivo
// dentro de /api se convierte en un endpoint, ej. /api/card-search
//
// Por qué existe: apitcg.com requiere una API key. Si la pusiéramos en el
// JavaScript del navegador, cualquiera podría abrir la consola y robarla.
// Aquí vive en el servidor, en una variable de entorno, invisible para el cliente.
//
// IMPORTANTE — endpoint real confirmado en docs.apitcg.com (18 jul 2026):
//   Base: https://api.apitcg.com  (con "api." delante, ¡ojo!)
//   Endpoint único: /api/products?tcg={slug}&type=card&name=...  (o &code=...)
//   Cabecera: x-api-key
//
// Uso desde el frontend:
//   fetch('/api/card-search?game=onepiece&name=luffy')
//   fetch('/api/card-search?game=dbfw&code=FB01-001')

export default async function handler(req, res) {
  // CORS básico (útil si algún día llamas desde otro dominio)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { game, name, code } = req.query;
  if (!game || (!name && !code)) {
    return res.status(400).json({ error: 'Faltan parámetros: game y (name o code) son obligatorios.' });
  }

  // Traduce el nombre de juego de la app al "tcg" slug que espera apitcg.com
  // (lista oficial: docs.apitcg.com, tabla "Available TCGs")
  const GAME_SLUGS = {
    onepiece: 'one-piece',
    dbfw: 'dragon-ball-super-fusion-world',
  };
  const slug = GAME_SLUGS[game];
  if (!slug) {
    return res.status(400).json({ error: `Juego no soportado por este proxy: ${game}` });
  }

  const apiKey = (process.env.APITCG_KEY || '').trim(); // se configura en Vercel, nunca en el código
  if (!apiKey) {
    return res.status(500).json({
      error: 'APITCG_KEY no configurada en el servidor. Añádela en Vercel → Settings → Environment Variables.'
    });
  }

  try {
    const params = new URLSearchParams({ tcg: slug, type: 'card', limit: '5' });
    if (code) params.set('code', code); else params.set('name', name);

    const url = `https://api.apitcg.com/api/products?${params.toString()}`;
    const upstream = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    });

    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({
        error: `La fuente externa respondió ${upstream.status}`,
        detail: bodyText.slice(0, 300) // ayuda a depurar sin desbordar la respuesta
      });
    }

    const data = await upstream.json();
    // Cache de 5 minutos en el edge de Vercel: si 10 personas buscan "Luffy"
    // en ese rato, solo la primera gasta una llamada real a apitcg.com.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'No se pudo contactar con la fuente externa.', detail: String(err) });
  }
}
