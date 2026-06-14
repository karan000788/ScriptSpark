import { supabase } from '../services/supabase.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    req.user = null;
    return next();
  }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  req.user = error ? null : user;
  next();
}
