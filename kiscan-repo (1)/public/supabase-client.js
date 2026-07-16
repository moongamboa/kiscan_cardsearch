// supabase-client.js
// Todo lo que habla con Supabase vive aquí, separado del resto de la app.
// Carga el SDK de Supabase desde un CDN (no hace falta build step / npm install
// para este prototipo — más adelante conviene migrar a un bundler).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⚠️ Estas dos claves son "públicas" a propósito: la anon key de Supabase
// está diseñada para vivir en el navegador. La seguridad real la da RLS
// (Row Level Security) en la base de datos, no ocultar esta clave.
// Rellénalas después de crear tu proyecto en supabase.com.
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY-PUBLICA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------- AUTH ---------------- */
export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}
export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  return supabase.auth.signOut();
}
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => callback(session));
}
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/* ---------------- COLECCIÓN ---------------- */
export async function addToCollection({ game, card_name, card_code, price_paid, currency, image_url }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesión para guardar cartas en tu colección.');
  return supabase.from('collection_items').insert({
    user_id: user.id, game, card_name, card_code, price_paid, currency, image_url
  });
}
export async function getMyCollection() {
  return supabase.from('collection_items').select('*').order('added_at', { ascending: false });
}
export async function removeFromCollection(id) {
  return supabase.from('collection_items').delete().eq('id', id);
}

/* ---------------- ALERTAS DE PRECIO ---------------- */
export async function createPriceAlert({ game, card_name, target_price, currency }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesión para crear alertas.');
  return supabase.from('price_alerts').insert({ user_id: user.id, game, card_name, target_price, currency });
}
export async function getMyAlerts() {
  return supabase.from('price_alerts').select('*').order('created_at', { ascending: false });
}

/* ---------------- EVENTOS (persistentes y públicos) ---------------- */
export async function listEvents({ country, type, format } = {}) {
  let q = supabase.from('events').select('*, event_attendees(count)').order('event_date', { ascending: true });
  if (country) q = q.eq('country', country);
  if (type) q = q.eq('event_type', type);
  if (format) q = q.eq('format', format);
  return q;
}
export async function createEvent({ name, city, country, event_date, event_type, format }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesión para publicar un evento.');
  return supabase.from('events').insert({ creator_id: user.id, name, city, country, event_date, event_type, format });
}
export async function joinEvent(eventId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesión para unirte a un evento.');
  return supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id });
}
export async function leaveEvent(eventId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  return supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', user.id);
}
