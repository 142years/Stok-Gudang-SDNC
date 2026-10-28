// Lapisan data: SATU-SATUNYA tempat yang boleh memanggil Supabase (tabel app_data).
// Dimuat setelah config.js dan sebelum sync.js.
//
// BACKEND_MODE:
//   'legacy' = perilaku lama persis (hapus lalu tulis lewat kunci anon). AMAN, default.
//   'new'    = tulis/hapus lewat Edge Function "staff-write" (belum dipakai; butuh backend B1
//              dan window.__staffPin dari auth.js). Jangan ubah sebelum backend siap.
const BACKEND_MODE = 'legacy';

const DataAPI = {
  // ----- baca (sama di kedua mode: anon hanya perlu SELECT) -----
  readPayload: (key) => sbClient.from('app_data').select('payload').eq('key', key).limit(1),
  readStamp: (key) => sbClient.from('app_data').select('u:payload->>updatedAt').eq('key', key).limit(1),
  readMeta: (key) => sbClient.from('app_data').select('meta:payload->meta').eq('key', key).limit(1),
  keyExists: (key) => sbClient.from('app_data').select('key').eq('key', key).limit(1),

  // ----- tulis / hapus -----
  // Hasil: { error: null } atau { error: { message, stage } }; stage: 'delete' | 'insert' | 'remote'
  async writeKey(key, payload) {
    if (BACKEND_MODE === 'new') return staffWrite('save', key, payload);
    const d = await sbClient.from('app_data').delete().eq('key', key);
    if (d.error) return { error: { message: d.error.message, stage: 'delete' } };
    const i = await sbClient.from('app_data').insert({ key: key, payload: payload });
    if (i.error) return { error: { message: i.error.message, stage: 'insert' } };
    return { error: null };
  },
  async deleteKey(key) {
    if (BACKEND_MODE === 'new') return staffWrite('delete', key);
    return sbClient.from('app_data').delete().eq('key', key);
  },
};

async function staffWrite(action, key, payload) {
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/staff-write', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ pin: window.__staffPin, action: action, key: key, payload: payload }),
    });
    const j = await r.json().catch(() => ({ ok: false, message: 'respons server tidak valid' }));
    return { error: j.ok ? null : { message: j.message || 'gagal', stage: 'remote' } };
  } catch (e) {
    return { error: { message: e.message || String(e), stage: 'remote' } };
  }
}
