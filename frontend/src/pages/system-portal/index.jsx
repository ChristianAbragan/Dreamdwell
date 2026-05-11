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
    <main data-theme="dark" style={{ minHeight: '100vh', maxHeight: '100vh', overflowY: 'auto', background: 'var(--bg-1)', color: 'var(--text)', fontFamily: "'Space Grotesk', sans-serif", padding: 20 }}>
      <div style={{ minHeight: 'calc(100vh - 40px)', width: 'min(100%, 1500px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 18px', border: '1px solid var(--glass-border)', borderRadius: 18, background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 16px var(--accent)' }} />
            <strong style={{ fontSize: '1rem', letterSpacing: 0 }}>DreamDwell</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            <span>Room AI</span>
            <span style={{ width: 1, height: 16, background: 'var(--glass-border)' }} />
            <span>Design planning</span>
          </div>
        </header>

        <section style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(360px, 430px)', gap: 22, alignItems: 'stretch' }}>
          <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 18, minWidth: 0 }}>
            <section style={{ border: '1px solid var(--glass-border)', borderRadius: 22, background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))', padding: '34px clamp(24px, 5vw, 46px)', overflow: 'hidden' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 11px', border: '1px solid var(--glass-border)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12, marginBottom: 22 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                AI room analysis with practical next steps
              </div>

              <h1 style={{ margin: 0, maxWidth: 760, fontSize: 'clamp(2.4rem, 5.4vw, 4.65rem)', lineHeight: 1, letterSpacing: 0, fontWeight: 760 }}>
                Turn a room photo into a clear design plan.
              </h1>
              <p style={{ margin: '20px 0 0', maxWidth: 650, color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.72 }}>
                Upload or capture your space. DreamDwell identifies the room, explains what can improve, places suggestions visually, and keeps your design history organized.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, maxWidth: 720, marginTop: 30 }}>
                <Metric value="01" label="Scan your space" />
                <Metric value="02" label="Review AI suggestions" />
                <Metric value="03" label="Save and refine" />
              </div>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 0.9fr) minmax(280px, 1.1fr)', gap: 18, minHeight: 0 }}>
              <div style={{ border: '1px solid var(--glass-border)', borderRadius: 18, background: 'var(--surface)', padding: 20 }}>
                <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.9px', textTransform: 'uppercase' }}>
                  What you can do
                </p>
                <div style={{ display: 'grid', gap: 10 }}>
                  <FeatureCard title="Analyze" text="Detect room type, visible furniture, lighting, and layout constraints." />
                  <FeatureCard title="Plan" text="Get practical changes with placement notes and estimated sourcing paths." />
                  <FeatureCard title="Archive" text="Keep scans, redesigned scenes, and chat notes tied to your account." />
                </div>
              </div>

              <PreviewPanel />
            </section>
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
      </div>
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
    padding: '13px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--glass-border)',
    borderRadius: 10,
    color: 'var(--text)',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: "'Space Grotesk', sans-serif",
    boxSizing: 'border-box',
  };

  return (
    <section style={{ alignSelf: 'stretch', border: '1px solid var(--glass-border)', borderRadius: 22, background: 'var(--surface)', padding: 24, boxShadow: '0 24px 70px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'inline-grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 5, border: '1px solid var(--glass-border)', borderRadius: 12, background: 'rgba(255,255,255,0.05)', marginBottom: 22 }}>
        {[
          ['login', 'Sign in'],
          ['signup', 'Sign up'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setMode(key); setError(''); }}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '9px 12px',
              background: mode === key ? 'var(--accent)' : 'transparent',
              color: mode === key ? 'var(--bg-1)' : 'var(--text-muted)',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <h2 style={{ margin: '0 0 7px', fontSize: '1.45rem', lineHeight: 1.15 }}>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
      <p style={{ margin: '0 0 22px', color: 'var(--text-muted)', fontSize: '0.86rem', lineHeight: 1.55 }}>
        {mode === 'login' ? 'Continue to your saved scans, room plans, and Archi chat history.' : 'Set up an account to save room scans and revisit design decisions.'}
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

        <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px 14px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--bg-1)', fontWeight: 750, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.65 : 1, fontFamily: "'Space Grotesk', sans-serif" }}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or</span>
        <span style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
      </div>

      <button onClick={onGoogleLogin} style={{ width: '100%', padding: 12, border: '1px solid var(--glass-border)', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" style={{ width: 18 }} />
        Continue with Google
      </button>

      <div style={{ display: 'grid', gap: 8, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--glass-border)' }}>
        {['Secure account access', 'Saved scan archive', 'Personalized design context'].map((item) => (
          <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.76rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
            {item}
          </div>
        ))}
      </div>

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

function Metric({ value, label }) {
  return (
    <div style={{ padding: '13px 14px', border: '1px solid var(--glass-border)', borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
      <span style={{ display: 'block', color: 'var(--accent)', fontSize: '0.76rem', fontWeight: 800, marginBottom: 5 }}>{value}</span>
      <span style={{ display: 'block', color: 'var(--text)', fontSize: '0.82rem', fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function PreviewPanel() {
  const steps = [
    ['Upload', 'Room photo added'],
    ['Analyze', 'Layout and lighting read'],
    ['Improve', 'Suggestions placed'],
  ];

  return (
    <div style={{ border: '1px solid var(--glass-border)', borderRadius: 18, background: 'rgba(255,255,255,0.04)', padding: 20, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <p style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.9px', textTransform: 'uppercase' }}>Workspace preview</p>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>From scan to decision</h3>
        </div>
        <span style={{ padding: '6px 9px', border: '1px solid var(--glass-border)', borderRadius: 999, color: 'var(--text-muted)', fontSize: '0.68rem' }}>Live flow</span>
      </div>

      <div style={{ height: 150, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--glass-border)', background: 'linear-gradient(135deg, rgba(201,212,236,0.22), rgba(40,46,55,0.4))', position: 'relative', marginBottom: 16 }}>
        <div style={{ position: 'absolute', left: '8%', top: '18%', width: '54%', height: '54%', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 8, background: 'rgba(0,0,0,0.18)' }} />
        <div style={{ position: 'absolute', right: '12%', top: '24%', width: '18%', height: '46%', borderRadius: 999, background: 'rgba(255,255,255,0.24)' }} />
        <div style={{ position: 'absolute', left: '18%', bottom: '16%', width: '48%', height: 18, borderRadius: 999, background: 'rgba(255,255,255,0.32)' }} />
        <div style={{ position: 'absolute', left: '20%', top: '27%', padding: '5px 8px', borderRadius: 999, background: 'var(--accent)', color: 'var(--bg-1)', fontSize: '0.64rem', fontWeight: 800 }}>Lighting</div>
        <div style={{ position: 'absolute', right: '18%', bottom: '18%', padding: '5px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.38)', color: 'rgba(255,255,255,0.9)', fontSize: '0.64rem', fontWeight: 800 }}>Storage</div>
      </div>

      <div style={{ display: 'grid', gap: 9 }}>
        {steps.map(([title, text], index) => (
          <div key={title} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10, alignItems: 'start' }}>
            <span style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 8, background: index === 1 ? 'var(--accent)' : 'rgba(255,255,255,0.06)', color: index === 1 ? 'var(--bg-1)' : 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800 }}>{index + 1}</span>
            <span>
              <strong style={{ display: 'block', fontSize: '0.8rem' }}>{title}</strong>
              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.35 }}>{text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ title, text }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12, alignItems: 'start', padding: '12px 0', borderBottom: '1px solid var(--glass-border)' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.06)', color: 'var(--accent)', fontSize: '0.76rem', fontWeight: 800 }}>
        {title.slice(0, 1)}
      </span>
      <span>
        <strong style={{ display: 'block', fontSize: '0.88rem', marginBottom: 4 }}>{title}</strong>
        <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.45 }}>{text}</span>
      </span>
    </div>
  );
}
