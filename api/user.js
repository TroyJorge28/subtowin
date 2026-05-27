const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SECRET;

async function sbFetch(path, method = 'GET', body = null) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}`, 'Prefer': 'return=representation' },
    body: body ? JSON.stringify(body) : null
  });
  try { return await r.json(); } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, password, newPassword, userId } = req.body;

  // LOGIN
  if (action === 'login') {
    try {
      const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SK },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json();
      if (d.error) return res.status(400).json({ error: 'Invalid email or password.' });
      const usr = await sbFetch(`users?email=eq.${encodeURIComponent(email)}&select=is_banned,username,full_name`);
      if (usr?.[0]?.is_banned) return res.status(403).json({ error: 'This account has been banned.' });
      return res.status(200).json({ success: true, token: d.access_token, user: d.user, profile: usr?.[0] });
    } catch (e) { return res.status(500).json({ error: 'Login error.' }); }
  }

  // CHANGE PASSWORD
  if (action === 'changepw') {
    try {
      // Verify current password
      const lr = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SK },
        body: JSON.stringify({ email, password })
      });
      const ld = await lr.json();
      if (ld.error) return res.status(400).json({ error: 'Current password is incorrect.' });
      // Update password
      const ur = await fetch(`${SB}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${ld.access_token}` },
        body: JSON.stringify({ password: newPassword })
      });
      const ud = await ur.json();
      if (ud.error) return res.status(400).json({ error: 'Error updating password.' });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Server error.' }); }
  }

  // DELETE ACCOUNT
  if (action === 'delete') {
    try {
      // Verify password first
      const lr = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SK },
        body: JSON.stringify({ email, password })
      });
      const ld = await lr.json();
      if (ld.error) return res.status(400).json({ error: 'Incorrect password.' });
      // Delete data
      await fetch(`${SB}/rest/v1/entries?user_id=eq.${userId}`, { method: 'DELETE', headers: { 'apikey': SK, 'Authorization': `Bearer ${SK}` } });
      await fetch(`${SB}/rest/v1/users?id=eq.${userId}`, { method: 'DELETE', headers: { 'apikey': SK, 'Authorization': `Bearer ${SK}` } });
      await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { 'apikey': SK, 'Authorization': `Bearer ${SK}` } });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Server error.' }); }
  }

  // RESET PASSWORD EMAIL
  if (action === 'reset') {
    try {
      await fetch(`${SB}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SK },
        body: JSON.stringify({ email })
      });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Server error.' }); }
  }

  // GET USER PROFILE
  if (action === 'profile') {
    try {
      const p = await sbFetch(`users?email=eq.${encodeURIComponent(email)}&select=*`);
      return res.status(200).json({ success: true, profile: p?.[0] });
    } catch (e) { return res.status(500).json({ error: 'Server error.' }); }
  }

  // BAN USER
  if (action === 'ban') {
    try {
      await fetch(`${SB}/rest/v1/users?email=eq.${encodeURIComponent(req.body.targetEmail)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}` },
        body: JSON.stringify({ is_banned: req.body.banned })
      });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: 'Server error.' }); }
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
