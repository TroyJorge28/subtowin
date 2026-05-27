const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SECRET;
const PK = process.env.SUPABASE_KEY;

async function sbFetch(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}`, 'Prefer': 'return=representation' }
  });
  try { return await r.json(); } catch { return []; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, email, userId, giveawayId } = req.query;

  try {
    if (type === 'giveaway') {
      const d = await sbFetch('giveaways?is_active=eq.true&order=created_at.desc&limit=1');
      return res.status(200).json({ success: true, data: d?.[0] || null });
    }
    if (type === 'participants') {
      const d = await sbFetch('entries?select=entry_number,users(username)&order=entry_number.asc');
      return res.status(200).json({ success: true, data: d || [] });
    }
    if (type === 'winners') {
      const d = await sbFetch('winners?select=*,entries(entry_number,users(username,full_name))&order=created_at.desc');
      const logs = await sbFetch('draw_logs?order=drawn_at.desc&limit=10');
      return res.status(200).json({ success: true, data: d || [], logs: logs || [] });
    }
    if (type === 'history') {
      const d = await sbFetch('giveaways?order=created_at.desc');
      return res.status(200).json({ success: true, data: d || [] });
    }
    if (type === 'count') {
      const d = await sbFetch('entries?select=id');
      return res.status(200).json({ success: true, count: Array.isArray(d) ? d.length : 0 });
    }
    if (type === 'hof') {
      const d = await sbFetch('winners?select=*,entries(entry_number,users(username))&order=created_at.desc&limit=3');
      return res.status(200).json({ success: true, data: d || [] });
    }
    if (type === 'myentry' && email && giveawayId) {
      const u = await sbFetch(`users?email=eq.${encodeURIComponent(email)}&select=id,username,full_name,payment_method,payment_name,payment_number`);
      if (!u?.[0]) return res.status(200).json({ success: true, entry: null, profile: null });
      const e = await sbFetch(`entries?user_id=eq.${u[0].id}&giveaway_id=eq.${giveawayId}&select=entry_number`);
      return res.status(200).json({ success: true, entry: e?.[0] || null, profile: u[0] });
    }
    if (type === 'admin') {
      const entries = await sbFetch('entries?select=id,entry_number,users(username,full_name,email,payment_method,payment_name,payment_number)&order=entry_number.asc');
      const gives = await sbFetch('giveaways?order=created_at.desc');
      const wins = await sbFetch('winners?select=id');
      const pending = await sbFetch('winners?is_paid=eq.false&select=*,entries(entry_number,users(username,full_name,payment_method,payment_name,payment_number,email))');
      return res.status(200).json({ success: true, entries: entries || [], giveaways: gives || [], winners: wins || [], pending: pending || [] });
    }
    return res.status(400).json({ error: 'Unknown type' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
