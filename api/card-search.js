// /api/card-search.js
// Función serverless de Vercel (Node.js). Se despliega sola: cualquier archivo
// dentro de /api se convierte en un endpoint, ej. /api/card-search
//
// Por qué existe: apitcg.com requiere una API key. Si la pusiéramos en el
// JavaScript del navegador, cualquiera podría abrir la consola y robarla.
// Aquí vive en el servidor, en una variable de entorno, invisible para el cliente.
//
// Uso desde el frontend:
//   fetch('/api/card-search?game=one-piece&name=luffy')

export default async function handler(req, res) {
  // CORS básico (útil si algún día llamas desde otro dominio)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { game, name, code } = req.query;
  if (!game || (!name && !code)) {
    return res.status(400).json({ error: 'Faltan parámetros: game y (name o code) son obligatorios.' });
  }

  // Traduce el nombre de juego de la app al slug que espera apitcg.com
  const GAME_SLUGS = {
    onepiece: 'one-piece',
    dbfw: 'dragon-ball-fusion',
  };
  const slug = GAME_SLUGS[game];
  if (!slug) {
    return res.status(400).json({ error: `Juego no soportado por este proxy: ${game}` });
  }

  const apiKey = process.env.APITCG_KEY; // se configura en Vercel, nunca en el código
  if (!apiKey) {
    return res.status(500).json({
      error: 'APITCG_KEY no configurada en el servidor. Añádela en Vercel → Settings → Environment Variables.'
    });
  }

  try {
    // Si el usuario buscó algo con forma de código (ej. FB01-001), filtramos
    // por el campo "code" de apitcg.com, que es más preciso que buscar por
    // nombre. Si no, buscamos por "name" como siempre.
    const param = code ? `code=${encodeURIComponent(code)}` : `name=${encodeURIComponent(name)}`;
    const url = `https://apitcg.com/api/${slug}/cards?${param}`;
    const upstream = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'Accept': 'application/json' }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `La fuente externa respondió ${upstream.status}` });
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
