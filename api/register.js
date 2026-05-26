const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SECRET;
const RSK = process.env.RESEND_KEY;
const ADMIN_EMAIL = 'tamehtroy@gmail.com';

async function sbFetch(path, method = 'GET', body = null) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SK,
      'Authorization': `Bearer ${SK}`,
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : null
  });
  try { return await r.json(); } catch { return null; }
}

async function sendEmail(to, subject, html) {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RSK}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'SubToWin <onboarding@resend.dev>', to: [to], subject, html })
    });
  } catch (e) { console.log('Email error:', e); }
}

function emailT(title, body, btn, url) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#f0f6fc;padding:2rem;border-radius:12px;">
    <div style="text-align:center;margin-bottom:2rem;"><span style="font-size:2.5rem;font-weight:900;letter-spacing:4px;">Sub<span style="color:#1e6fff;">To</span>Win</span><br><span style="color:#7d8590;font-size:.8rem;letter-spacing:2px;">CRIME VAULT AFRICA</span></div>
    <h2 style="color:#f0f6fc;margin-bottom:1rem;">${title}</h2>
    <div style="color:#7d8590;line-height:1.8;margin-bottom:1.5rem;">${body}</div>
    ${btn ? `<div style="text-align:center;"><a href="${url || 'https://subtowin.vercel.app'}" style="background:#1e6fff;color:#fff;padding:.9rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">${btn}</a></div>` : ''}
    <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid #21262d;color:#7d8590;font-size:.8rem;text-align:center;">© 2026 SubToWin · Crime Vault Africa</div>
  </div>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, email, username, password, payMethod, payName, payNum, ytId, giveawayId } = req.body;

    if (!name || !email || !username || !password || !payMethod || !payName || !payNum) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if email already exists
    const existing = await sbFetch(`users?email=eq.${encodeURIComponent(email)}&select=id`);
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Create auth user
    const authRes = await fetch(`${SB}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}` },
      body: JSON.stringify({ email, password, data: { username, full_name: name } })
    });
    const authData = await authRes.json();
    if (authData.error) return res.status(400).json({ error: authData.error.message || authData.error });

    const uid = authData.user?.id;

    // Save user profile
    const userRes = await sbFetch('users', 'POST', {
      id: uid, full_name: name, email, username,
      payment_method: payMethod, payment_name: payName, payment_number: payNum,
      youtube_id: ytId || 'verified', is_banned: false
    });

    if (!userRes || userRes.error) {
      return res.status(500).json({ error: 'Failed to save user profile. Please try again.' });
    }

    // Create entry if active giveaway
    let entryNumber = null;
    if (giveawayId && uid) {
      const entryRes = await sbFetch('entries', 'POST', { user_id: uid, giveaway_id: giveawayId });
      if (entryRes && entryRes[0]?.entry_number) entryNumber = entryRes[0].entry_number;
    }

    // Login to get token
    const loginRes = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SK },
      body: JSON.stringify({ email, password })
    });
    const loginData = await loginRes.json();

    // Send emails
    if (entryNumber) {
      await sendEmail(email, `🎫 You're in! Entry #${String(entryNumber).padStart(5, '0')} — SubToWin`,
        emailT('You Are Registered! 🎉',
          `Welcome <strong>${name}</strong>!<br><br>Your entry number:<br><div style="font-size:3rem;font-family:monospace;color:#1e6fff;text-align:center;letter-spacing:4px;">#${String(entryNumber).padStart(5, '0')}</div><br>The winner will be announced on SubToWin when the countdown ends.<br><br>Payment on file: ${payMethod} — ${payNum}`,
          'Visit SubToWin', 'https://subtowin.vercel.app'));
    }

    await sendEmail(ADMIN_EMAIL, '👤 New Participant — SubToWin',
      emailT('New Participant!', `<strong>${name}</strong> (@${username}) just registered.<br>Email: ${email}<br>Payment: ${payMethod} — ${payNum}${entryNumber ? `<br>Entry: #${String(entryNumber).padStart(5, '0')}` : ''}`));

    return res.status(200).json({
      success: true,
      entryNumber,
      token: loginData.access_token,
      user: loginData.user
    });

  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}
