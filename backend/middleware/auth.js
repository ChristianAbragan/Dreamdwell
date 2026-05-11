import admin from 'firebase-admin';

const allowDevAuthFallback =
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_FALLBACK === 'true';

const useDevUser = (req, next) => {
  req.user = { uid: 'dev-user', email: 'dev@dreamdwell.local', isDev: true };
  return next();
};

export async function attachUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token || token === 'null' || token === 'undefined' || token === 'Bearer') {
    if (allowDevAuthFallback) {
      console.log('[Auth] Missing token, using explicit dev-user fallback');
      return useDevUser(req, next);
    }

    return next();
  }

  try {
    let firebaseAuth;
    try {
      firebaseAuth = admin.auth();
    } catch (e) {
      firebaseAuth = null;
    }

    if (!firebaseAuth || admin.apps.length === 0) {
      if (allowDevAuthFallback) {
        console.log('[Auth] Firebase Admin not initialized, using explicit dev-user fallback');
        return useDevUser(req, next);
      }

      return res.status(503).json({
        error: 'Authentication service unavailable.',
      });
    }

    const decoded = await firebaseAuth.verifyIdToken(token);
    console.log(`[Auth] Verified user: ${decoded.email || decoded.uid}`);
    req.user = {
      uid: decoded.uid,
      email: decoded.email || '',
      accessToken: token,
      isDev: false
    };
    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    return res.status(401).json({ 
      error: 'Unauthorized: Invalid or expired token.',
      message: error.message 
    });
  }
}

/**
 * Require authenticated user middleware
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  if (req.user.uid === 'anonymous' || (req.user.isDev && !allowDevAuthFallback)) {
     return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  next();
}
