import React, { useEffect, useState } from 'react';
import { auth } from '../../config/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';

export default function SystemPortal() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEmailLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Check your credentials or sign up.');
      } else if (err.code === 'auth/wrong-password') setError('Incorrect password.');
      else if (err.code === 'auth/invalid-email') setError('Please enter a valid email.');
      else if (err.code === 'auth/too-many-requests') setError('Too many attempts. Try again later.');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    if (!displayName.trim()) {
      setError('Please enter your name.');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: displayName.trim() });
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in.');
      } else if (err.code === 'auth/invalid-email') setError('Please enter a valid email.');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-1)', color: 'var(--text)', fontFamily: "'Space Grotesk', sans-serif" }}>
      <section style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(360px, 440px)', gap: 40, alignItems: 'center', maxWidth: 1180, margin: '0 auto', padding: '48px 28px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 11px', border: '1px solid var(--glass-border)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12, marginBottom: 24 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
            AI room analysis, redesign, and nearby sourcing
          </div>

          <h1 style={{ margin: 0, maxWidth: 720, fontSize: 'clamp(2.6rem, 6vw, 4.8rem)', lineHeight: 0.98, letterSpacing: 0, fontWeight: 750 }}>
            Reimagine your room from one photo.
          </h1>
          <p style={{ margin: '22px 0 0', maxWidth: 620, color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: 1.7 }}>
            DreamDwell reads your room, explains what it sees, suggests what to add or change, marks where each item should go, and helps you find nearby stores.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', gap: 12, maxWidth: 680, marginTop: 34 }}>
            <FeatureCard title="Scan" text="Camera or image upload with room-aware analysis." />
            <FeatureCard title="Place" text="Visual markers show where suggestions belong." />
            <FeatureCard title="Recreate" text="Save generated redesigns and chat changes." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(110px, 1fr))', gap: 10, maxWidth: 680, marginTop: 18 }}>
            {['Room summary', 'AI chat edits', 'Nearby stores', 'Archive history'].map((item) => (
              <div key={item} style={{ padding: '10px 12px', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <AuthPanel
          mode={mode}
          setMode={setMode}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          displayName={displayName}
          setDisplayName={setDisplayName}
          error={error}
          setError={setError}
          loading={loading}
          onEmailLogin={handleEmailLogin}
          onSignUp={handleSignUp}
          onGoogleLogin={handleGoogleLogin}
        />
      </section>
    </main>
  );
}

function AuthPanel({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  displayName,
  setDisplayName,
  error,
  setError,
  loading,
  onEmailLogin,
  onSignUp,
  onGoogleLogin,
}) {
  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    background: 'var(--bg-1)',
    border: '1px solid var(--glass-border)',
    borderRadius: 10,
    color: 'var(--text)',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: "'Space Grotesk', sans-serif",
    boxSizing: 'border-box',
  };

  return (
    <section style={{ border: '1px solid var(--glass-border)', borderRadius: 18, background: 'var(--surface)', padding: 28, boxShadow: '0 24px 70px rgba(0,0,0,0.12)' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem' }}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p style={{ margin: '0 0 22px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
        {mode === 'login' ? 'Sign in to continue designing.' : 'Start scanning and saving room ideas.'}
      </p>

      {error && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,85,85,0.08)', border: '1px solid rgba(255,85,85,0.22)', color: '#c24141', fontSize: '0.78rem', marginBottom: 14 }}>
          {error}
        </div>
      )}

      <form onSubmit={mode === 'login' ? onEmailLogin : onSignUp}>
        {mode === 'signup' && (
          <Field label="Name">
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" style={inputStyle} required />
          </Field>
        )}
        <Field label="Email">
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@email.com" style={inputStyle} required />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 characters" style={inputStyle} required minLength={6} />
        </Field>

        <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px 14px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--bg-1)', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1 }}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
        <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
      </div>

      <button onClick={onGoogleLogin} style={{ width: '100%', padding: 12, border: '1px solid var(--glass-border)', borderRadius: 10, background: 'var(--bg-1)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width: 18 }} />
        Continue with Google
      </button>

      <p style={{ margin: '18px 0 0', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }} style={{ border: 'none', background: 'transparent', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 13 }}>
      <span style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function FeatureCard({ title, text }) {
  return (
    <div style={{ padding: 16, border: '1px solid var(--glass-border)', borderRadius: 14, background: 'var(--surface)' }}>
      <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: 5 }}>{title}</strong>
      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}
