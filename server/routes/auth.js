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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] }
      }
    });

    if (error) throw error;

    if (data.user?.identities?.length === 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    if (data.user) {
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        display_name: displayName || email.split('@')[0],
        created_at: new Date().toISOString()
      }, { onConflict: 'id' });
    }

    res.json({
      user: data.user,
      session: data.session,
      message: 'Check your email for confirmation link'
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
