import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import VoiceCore from '../voice-core/index.jsx';
import Profile from '../profile/index.jsx';
import Settings from '../settings/index.jsx';
import Vault from '../vault/index.jsx';
import Photos from '../photos/index.jsx';
import { auth } from '../../config/firebase';
import FloatingAssistantChat from '../../components/FloatingAssistantChat';
import { NavLink } from './Nav.jsx';

export default function MainDashboard({ user }) {
  const { theme, isDarkMode, setIsDarkMode } = useTheme();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', padding: '12px', gap: '12px' }}>
      <header
        className="glass-panel"
        style={{
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: theme.accent,
              boxShadow: `0 0 10px ${theme.accent}`,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.9rem', letterSpacing: '0.5px' }}>
            DreamDwell
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--glass-border)',
              borderRadius: '20px',
              padding: '4px 14px',
              cursor: 'pointer',
              color: 'var(--text)',
              fontSize: '0.7rem',
              transition: 'all 0.3s',
            }}
          >
            {isDarkMode ? 'Light' : 'Dark'}
          </button>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {user.displayName?.split(' ')[0]}
          </span>
        </div>
      </header>

      <main
        className="glass-panel"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          position: 'relative',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: location.pathname === '/' ? '24px' : '30px',
          background:
            'linear-gradient(135deg, rgba(205,207,219,0.18) 0%, rgba(164,169,178,0.12) 50%, rgba(135,141,150,0.10) 100%)',
        }}
      >
        <Routes>
          <Route path="/" element={<VoiceCore user={user} />} />
          <Route path="/photos" element={<Photos user={user} />} />
          <Route path="/profile" element={<Profile user={user} />} />
          <Route path="/settings" element={<Settings user={user} />} />
          <Route path="/vault" element={<Vault user={user} />} />
        </Routes>
      </main>

      <nav
        className="glass-panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 20px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NavLink to="/" label="Analyze" active={location.pathname === '/'} />
          <NavLink to="/photos" label="Inspiration" active={location.pathname === '/photos'} />
          <NavLink to="/vault" label="Archive" active={location.pathname === '/vault'} />
          <NavLink to="/profile" label="Profile" active={location.pathname === '/profile'} />
          <NavLink to="/settings" label="Settings" active={location.pathname === '/settings'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
            <span>Archi</span>
          </div>
          <button
            onClick={() => auth.signOut()}
            style={{
              background: 'none',
              border: '1px solid var(--danger)',
              color: 'var(--danger)',
              padding: '6px 12px',
              cursor: 'pointer',
              borderRadius: '8px',
              fontSize: '0.7rem',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
              transition: 'all 0.3s',
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {location.pathname !== '/' && <FloatingAssistantChat user={user} page={location.pathname} />}
    </div>
  );
}

