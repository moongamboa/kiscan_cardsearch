# KiScan 🃏⚡

Buscador de precios y comunidad para cartas TCG (Magic, Pokémon, One Piece y
Dragon Ball). Compara precios entre tiendas, guarda tu colección, crea
alertas de precio y encuentra torneos por país.

**Demo en vivo:** _(pega aquí tu URL de Vercel cuando la tengas)_

---

## Qué es real y qué es demo

| Función | Estado |
|---|---|
| Precios de **Magic** (Scryfall) | ✅ Datos reales en vivo, sin clave |
| Precios de **Pokémon** (pokemontcg.io) | ✅ Datos reales en vivo, sin clave |
| Precios de **One Piece / Dragon Ball** | ✅ Cableado a `apitcg.com` (datos) + eBay (precios reales). Se activa solo al añadir las claves y desplegar; sin claves, muestra demo |
| Login, colección, alertas, eventos | ✅ Reales si configuras Supabase (si no, la web sigue funcionando en modo demo local) |

---

## Stack

- **Frontend:** HTML/CSS/JS vanilla, sin build step (fácil de leer para aprender).
- **Hosting:** [Vercel](https://vercel.com) (plan gratuito).
- **Base de datos + Auth:** [Supabase](https://supabase.com) (plan gratuito: 500 MB, 50k usuarios/mes).
- **Backend ligero:** funciones serverless en `/api` (Vercel Functions) — ocultan las API keys y esquivan problemas de CORS.

---

## 1. Clona y crea el repo en GitHub

```bash
git init
git add .
git commit -m "KiScan: primera versión"
gh repo create kiscan --public --source=. --push
# o hazlo a mano en github.com/new y luego:
# git remote add origin https://github.com/TU-USUARIO/kiscan.git
# git push -u origin main
```

## 2. Crea el proyecto en Supabase (gratis)

1. Ve a [supabase.com](https://supabase.com) → **New project**.
2. Cuando esté listo, abre **SQL Editor** → pega el contenido de
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Esto crea las tablas (perfiles, colección, alertas, eventos) y las
   políticas de seguridad (RLS) que impiden que un usuario vea los datos de otro.
3. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public key`
4. Pégalas en [`public/supabase-client.js`](public/supabase-client.js), en
   las constantes `SUPABASE_URL` y `SUPABASE_ANON_KEY`.

> Estas dos claves son públicas a propósito (viven en el navegador). La
> seguridad de verdad la da RLS en el paso 2 — por eso el esquema SQL es lo
> más importante de todo el proyecto: revísalo antes de confiar en él.

## 3. Despliega en Vercel (gratis)

1. Ve a [vercel.com/new](https://vercel.com/new) → importa tu repo de GitHub.
2. Vercel detecta `/api` automáticamente como funciones serverless — no hay
   que configurar nada especial.
3. En **Settings → Environment Variables**, añade (opcional, solo si quieres
   precios reales de One Piece/Dragon Ball):
   - `APITCG_KEY` — gratis en [apitcg.com](https://apitcg.com)
   - `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` — gratis en
     [developer.ebay.com](https://developer.ebay.com) (crea una app, ~5.000
     llamadas/día gratis)
4. **Deploy**. Cada `git push` a partir de ahora despliega solo.

## 4. Ranking real de "más buscadas" (automático, sin pasos extra)

En cuanto Supabase esté conectado (paso 2 de arriba), cada búsqueda con éxito
suma 1 en la tabla `search_stats` a través de `/api/log-search`. La sección
"Ranking en vivo" del home lee ese contador real; si aún no hay búsquedas
registradas, muestra un listado de ejemplo para que la sección nunca se vea
vacía. No hay que configurar nada aparte de lo del paso 2.

## 5. Activa las alertas de precio automáticas (opcional)

Busca una carta de Magic o Pokémon → pulsa **"🔔 Avisarme si baja"** → escribe
tu precio objetivo. Cada día, a las 8:00 UTC, Vercel dispara sola una función
que compara el precio real contra el tuyo y te avisa por email si bajó.

Pasos para activarlo:

1. **Resend** (envío de emails, gratis, 100/día): crea cuenta en
   [resend.com](https://resend.com) → **API Keys** → **Create API Key** →
   cópiala.
2. **Supabase — service_role key**: en tu proyecto de Supabase ve a
   **Settings → API Keys** y copia la clave **`service_role`** (la secreta,
   distinta de la `anon` que usa el navegador). Esta clave puede leer/escribir
   sin restricciones, así que **solo** va en Vercel, nunca en `public/`.
3. En Vercel → tu proyecto → **Settings → Environment Variables**, añade:
   - `SUPABASE_URL` → tu Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` → la clave que acabas de copiar
   - `RESEND_API_KEY` → la de Resend
   - `CRON_SECRET` → invéntate una cadena larga random
4. **Redeploy** el proyecto (Deployments → ⋯ → Redeploy) para que
   `vercel.json` registre el cron.
5. Para probarlo sin esperar a mañana: **Vercel → tu proyecto → Cron Jobs →
   Run now** (una llamada manual a la URL sin la cabecera de Vercel dará 401,
   que es la protección funcionando correctamente).

## 6. Pruébalo

- Busca "Sol Ring" con el juego Magic activo → precio real de Cardmarket/TCGplayer.
- Crea una cuenta (botón "Iniciar sesión" → "Regístrate").
- Busca una carta y pulsa **"Guardar en mi colección"**.
- Publica un evento — debería aparecer para cualquiera que visite la web,
  aunque no haya iniciado sesión (comprueba las políticas RLS si no ves esto).

---

## Estructura del proyecto

```
kiscan/
├── public/
│   ├── index.html          # Toda la interfaz (buscador, eventos, colección)
│   └── supabase-client.js  # Único archivo que habla con Supabase
├── api/
│   ├── card-search.js      # Proxy a apitcg.com (oculta la API key)
│   └── ebay-search.js      # Proxy a eBay Browse API (maneja OAuth)
├── supabase/
│   └── schema.sql          # Tablas + seguridad (RLS) — ejecutar una vez
├── .env.example
├── vercel.json
└── package.json
```

## Fuentes de datos: qué SÍ y qué NO se conecta, y por qué

| Fuente | ¿Se usa? | Motivo |
|---|---|---|
| Scryfall (Magic) | ✅ | API pública oficial, gratis |
| Pokémon TCG API | ✅ | API pública oficial, gratis |
| apitcg.com (One Piece / Dragon Ball **Fusion World**) | ✅ (con tu clave) | API con tier gratis. **Ojo**: cubre el Dragon Ball Super *Fusion World* actual (códigos `FB0X`), no el Dragon Ball Super Card Game descontinuado (códigos `BT0X`) que usan los datos de ejemplo |
| eBay Browse API (marketplace España) | ✅ (con tus claves) | API oficial, gratis hasta ~5.000 llamadas/día |
| **Vinted** | ❌ | No tiene API pública para leer anuncios de terceros (solo una API "Pro" para que negocios gestionen su propio inventario, en lista de espera). La única forma de sacar datos es scraping de endpoints internos, que va contra sus términos de servicio y se rompe sin avisar |
| **Wallapop** | ❌ | No tiene ninguna API pública. Mismo problema que Vinted |

Se puede buscar tanto por **nombre** ("Son Goku Ultra Instinct") como por
**código de carta** ("FB01-001", "OP03-070") — la app detecta el formato
sola y usa el parámetro correcto en `apitcg.com`.

## Cómo funcionan las piezas (para aprender)

- **¿Por qué las funciones están en `/api` y no llamo a apitcg.com directo
  desde el navegador?** Porque apitcg.com exige una clave secreta; si la
  pones en JavaScript del cliente, cualquiera la ve con F12. La función
  serverless vive en el servidor de Vercel, lee la clave de una variable de
  entorno invisible para el usuario, y solo devuelve los datos.
- **¿Por qué Supabase sí puede llamarse directo desde el navegador?** Porque
  su `anon key` está diseñada para eso — la seguridad la hacen las políticas
  RLS de `schema.sql`, no el secreto de la clave.
- **¿Qué pasa si no configuro Supabase?** La web sigue funcionando: eventos y
  colección caen a un modo demo en memoria (se explica en el propio código
  con la variable `SUPABASE_READY`).

## Límites del plan gratuito a tener en cuenta

- **Supabase:** el proyecto se pausa tras 7 días sin tráfico (se reactiva
  con un clic, no se pierde nada). 500 MB de base de datos — de sobra para
  miles de usuarios de prueba.
- **Pokémon TCG API:** 1.000 peticiones/día sin clave. Si necesitas más,
  regístrate para una clave gratuita con límite mayor.
- **eBay:** ~5.000 llamadas/día en el tier gratuito.

## Roadmap (siguiente nivel)

- [x] Alertas de precio activas: cron diario en `/api/check-price-alerts`
      (Vercel Cron, gratis, 1 vez/día) que compara precios reales contra tu
      objetivo y envía email con Resend. Ver sección "Alertas de precio" abajo.
- [ ] Reconocimiento de carta por foto: OCR del código impreso con
      Tesseract.js (gratis, corre en el navegador) en vez del sorteo actual.
- [x] Conectar One Piece/Dragon Ball a datos reales vía `/api/card-search`
      y `/api/ebay-search`. **Hecho** — se activa al añadir `APITCG_KEY`,
      `EBAY_CLIENT_ID` y `EBAY_CLIENT_SECRET` en Vercel.

---

_KiScan es un proyecto de aprendizaje/portfolio. No está afiliado a Bandai,
Wizards of the Coast, The Pokémon Company, Cardmarket, TCGplayer ni eBay._
