import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

export function Toast({ message, visible, onClose }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onClose, 8000);
      return () => clearTimeout(t);
    }
  }, [visible, onClose]);

  return (
    <div className={`toast${visible ? ' visible' : ''}`} role="alert">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <Zap size={20} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: '0.8rem', color: 'var(--accent-green)', fontWeight: 700, marginBottom: 2 }}>
            Plan Updated ✨
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {message}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >×</button>
      </div>
    </div>
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: i === 0 ? 24 : 16, width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function LoadingSpinner({ size = 24, color = 'var(--accent-green)' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export function ErrorMessage({ message, onRetry }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
      <p style={{ color: 'var(--accent-red)', marginBottom: '1rem' }}>⚠ {message}</p>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
      <div>
        <h2 style={{ marginBottom: 2 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
