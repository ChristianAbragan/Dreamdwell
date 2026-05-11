import React from 'react';

const toneMap = {
  default: {
    border: 'var(--glass-border)',
    color: 'var(--text-muted)',
    background: 'var(--surface)',
  },
  success: {
    border: 'rgba(80, 200, 120, 0.35)',
    color: '#6fe3a1',
    background: 'rgba(80, 200, 120, 0.08)',
  },
  warning: {
    border: 'rgba(255, 184, 77, 0.35)',
    color: '#ffc66d',
    background: 'rgba(255, 184, 77, 0.08)',
  },
  info: {
    border: 'rgba(91, 192, 222, 0.35)',
    color: '#7fdfff',
    background: 'rgba(91, 192, 222, 0.08)',
  },
};

export default function StatusPill({ label, value, tone = 'default' }) {
  const colors = toneMap[tone] || toneMap.default;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 10px',
        borderRadius: '10px',
        border: `1px solid ${colors.border}`,
        background: colors.background,
        fontSize: '0.72rem',
        color: colors.color,
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}</span>
      <strong style={{ color: 'var(--text)', fontSize: '0.72rem' }}>{value}</strong>
    </div>
  );
}
