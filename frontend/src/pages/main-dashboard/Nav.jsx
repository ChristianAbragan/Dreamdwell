import React from 'react';
import { Link } from 'react-router-dom';

export function NavLink({ to, label, active }) {
  return (
    <Link
      to={to}
      style={{
        textDecoration: 'none',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: '0.82rem',
        fontWeight: active ? 600 : 400,
        padding: '6px 12px',
        borderRadius: '8px',
        background: active ? 'var(--surface)' : 'transparent',
        transition: 'all 0.3s',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {label}
    </Link>
  );
}

