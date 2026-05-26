const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SECRET;
const RSK = process.env.RESEND_KEY;
const ADMIN_EMAIL = 'tamehtroy@gmail.com';

async function sbFetch(path, method = 'GET', body = null) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}`, 'Prefer': 'return=representation' },
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
  } catch (e) {}
}

function emailT(title, body, btn, url) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#f0f6fc;padding:2rem;border-radius:12px;"><div style="text-align:center;margin-bottom:2rem;"><span style="font-size:2.5rem;font-weight:900;letter-spacing:4px;">Sub<span style="color:#1e6fff;">To</span>Win</span></div><h2 style="color:#f0f6fc;margin-bottom:1rem;">${title}</h2><div style="color:#7d8590;line-height:1.8;margin-bottom:1.5rem;">${body}</div>${btn ? `<div style="text-align:center;"><a href="${url}" style="background:#1e6fff;color:#fff;padding:.9rem 2rem;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">${btn}</a></div>` : ''}</div>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // CREATE GIVEAWAY
  if (req.method === 'POST' && req.body.action === 'create') {
    try {
      const { drawDate, entryDeadline, winnerCount, prizes, videosNew, videosExisting } = req.body;
      const r = await fetch(`${SB}/rest/v1/giveaways`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ prize_amounts: prizes, winner_count: winnerCount, draw_date: drawDate, entry_deadline: entryDeadline || null, is_active: true, videos_new: videosNew, videos_existing: videosExisting, cancelled: false })
      });
      if (!r.ok) { const e = await r.json(); return res.status(400).json({ error: e.message || 'Another giveaway may be active.' }); }
      // Notify all users
      const users = await sbFetch('users?select=email,full_name');
      for (const u of users || []) {
        if (u.email) await sendEmail(u.email, '🎁 New Giveaway Started — SubToWin',
          emailT('New Giveaway Started!', `A new Crime Vault Africa giveaway is now live!<br><br>Draw Date: <strong>${new Date(drawDate).toLocaleString()}</strong><br><br>Log in now to enter!`, 'Enter Now', 'https://subtowin.vercel.app'));
      }
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // EDIT GIVEAWAY
  if (req.method === 'POST' && req.body.action === 'edit') {
    try {
      const { id, drawDate, entryDeadline, winnerCount, prizes, videosNew, videosExisting } = req.body;
      const r = await fetch(`${SB}/rest/v1/giveaways?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}` },
        body: JSON.stringify({ prize_amounts: prizes, winner_count: winnerCount, draw_date: drawDate, entry_deadline: entryDeadline || null, videos_new: videosNew, videos_existing: videosExisting })
      });
      if (!r.ok) return res.status(400).json({ error: 'Error updating giveaway.' });
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // CANCEL GIVEAWAY
  if (req.method === 'POST' && req.body.action === 'cancel') {
    try {
      const { id } = req.body;
      const entries = await sbFetch(`entries?giveaway_id=eq.${id}&select=users(email,full_name)`);
      await fetch(`${SB}/rest/v1/entries?giveaway_id=eq.${id}`, { method: 'DELETE', headers: { 'apikey': SK, 'Authorization': `Bearer ${SK}` } });
      await fetch(`${SB}/rest/v1/giveaways?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}` }, body: JSON.stringify({ is_active: false, cancelled: true }) });
      for (const e of entries || []) {
        if (e.users?.email) await sendEmail(e.users.email, '⚠️ Giveaway Cancelled — SubToWin',
          emailT('Giveaway Cancelled', 'The current Crime Vault Africa giveaway round has been cancelled.<br><br>Your entry number has been voided. A new round will be announced soon!', 'Visit SubToWin', 'https://subtowin.vercel.app'));
      }
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // RUN DRAW
  if (req.method === 'POST' && req.body.action === 'draw') {
    try {
      const { giveawayId, reason } = req.body;
      const giveaway = await sbFetch(`giveaways?id=eq.${giveawayId}&select=*`);
      const g = giveaway[0];
      if (!g) return res.status(404).json({ error: 'Giveaway not found' });
      const entries = await sbFetch(`entries?giveaway_id=eq.${giveawayId}&select=id,entry_number,users(id,username,full_name,email,payment_method,payment_name,payment_number)`);
      if (!entries || !entries.length) return res.status(400).json({ error: 'No entries found' });
      const count = Math.min(g.winner_count, entries.length);
      const shuffled = [...entries].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, count);
      const prizes = g.prize_amounts || [];
      for (let i = 0; i < winners.length; i++) {
        const w = winners[i]; const prize = prizes[i] || prizes[0] || 5000;
        await sbFetch('winners', 'POST', { entry_id: w.id, giveaway_id: giveawayId, prize_amount: prize, position: i + 1, is_paid: false });
        if (w.users?.email) await sendEmail(w.users.email, '🎉 YOU WON — SubToWin!',
          emailT('🎉 Congratulations! You Won!', `Your entry <strong>#${String(w.entry_number).padStart(5, '0')}</strong> was selected as <strong>${['1st', '2nd', '3rd'][i] || i + 1 + 'th'} place</strong>!<br><br>Prize: <strong>${Number(prize).toLocaleString()} FCFA</strong> → ${w.users.payment_method} (${w.users.payment_number})<br><br>Once you receive it please upload a screenshot as proof!`, 'Upload Proof', 'https://subtowin.vercel.app'));
      }
      const nonW = entries.filter(e => !winners.find(w => w.id === e.id));
      const winNums = winners.map(w => `#${String(w.entry_number).padStart(5, '0')}`).join(', ');
      for (const nw of nonW) {
        if (nw.users?.email) await sendEmail(nw.users.email, 'Draw Results — SubToWin',
          emailT('Draw Complete!', `Winning number(s): <strong>${winNums}</strong><br><br>Unfortunately your number was not selected this time. Stay tuned for the next round!`, 'Visit SubToWin', 'https://subtowin.vercel.app'));
      }
      const wd = winners.map((w, i) => `${i + 1}. @${w.users?.username} — #${String(w.entry_number).padStart(5, '0')} — ${w.users?.payment_method}: ${w.users?.payment_number} — ${Number(prizes[i] || prizes[0] || 5000).toLocaleString()} FCFA`).join('<br>');
      await sendEmail(ADMIN_EMAIL, '🎲 Draw Complete — SubToWin', emailT('Draw Completed!', `Winners:<br><br>${wd}<br><br>Total entries: ${entries.length}<br>Reason: ${reason || 'Automatic'}`));
      await fetch(`${SB}/rest/v1/giveaways?id=eq.${giveawayId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}` }, body: JSON.stringify({ is_active: false, completed_at: new Date().toISOString() }) });
      await sbFetch('draw_logs', 'POST', { giveaway_id: giveawayId, total_entries: entries.length, winners_count: winners.length, drawn_at: new Date().toISOString(), reason: reason || 'Automatic' });
      return res.status(200).json({ success: true, winners: winners.map((w, i) => ({ username: w.users?.username, entryNumber: w.entry_number, prize: prizes[i] || prizes[0] || 5000 })) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // MARK PRIZE PAID
  if (req.method === 'POST' && req.body.action === 'markpaid') {
    try {
      const { winnerId, email, prize, method } = req.body;
      await fetch(`${SB}/rest/v1/winners?id=eq.${winnerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': SK, 'Authorization': `Bearer ${SK}` }, body: JSON.stringify({ is_paid: true }) });
      if (email) await sendEmail(email, '💰 Your Prize Has Been Sent — SubToWin', emailT('Your Prize Has Been Sent! 💰', `Your prize of <strong>${prize} FCFA</strong> has been sent to your <strong>${method}</strong>.<br><br>Please check your account and upload a screenshot as proof!`, 'Upload Proof', 'https://subtowin.vercel.app'));
      return res.status(200).json({ success: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
