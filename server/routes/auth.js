import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Try admin API first (bypasses rate limits, auto-confirms email)
    const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName || email.split('@')[0] }
    });

    if (adminError) throw adminError;

    const userId = adminData.user.id;

    // Create profile in users table
    await supabase.from('users').upsert({
      id: userId,
      email: adminData.user.email,
      display_name: displayName || email.split('@')[0],
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });

    // Sign them in immediately to get a session
    const { data: { session }, error: sessionError } = await supabase.auth.admin.createSession({
      user_id: userId
    });

    if (sessionError) throw sessionError;

    res.json({
      user: adminData.user,
      session,
      message: 'Account created successfully'
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    res.json({
      user: data.user,
      session: data.session
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signOut();
    if (error) throw error;
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  res.json({ user, profile });
});

router.put('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const updates = req.body;
  const allowed = ['display_name', 'avatar_url', 'preferences'];
  const sanitized = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }

  const { data, err } = await supabase
    .from('users')
    .update(sanitized)
    .eq('id', user.id)
    .select()
    .single();

  if (err) return res.status(500).json({ error: err.message });
  res.json(data);
});

export default router;
