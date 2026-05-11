import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth } from '../config/firebase';

/**
 * AuthContext - Manages user authentication state and Firebase tokens
 * Provides: user, loading, error, and Firebase ID token for API calls
 */
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Get Firebase ID token for backend API calls (forces refresh if expired)
          const token = await firebaseUser.getIdToken(true);
          const userData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            accessToken: token,
          };
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth state change error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Force refresh the Firebase ID token.
   * Call this before making critical API calls if the token may be stale.
   */
  const refreshToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    try {
      const token = await auth.currentUser.getIdToken(true);
      setUser((prev) => (prev ? { ...prev, accessToken: token } : null));
      return token;
    } catch (err) {
      console.error('Token refresh failed:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to use AuthContext
 * Usage: const { user, loading } = useAuth();
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;
