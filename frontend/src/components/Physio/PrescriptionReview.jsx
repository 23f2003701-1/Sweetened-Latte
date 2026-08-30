import { useState } from 'react';
import { ShieldAlert, Play, CheckCircle2, AlertTriangle, ArrowLeft, Info } from 'lucide-react';

export default function PrescriptionReview({ prescription, onStartObserver, onBack }) {
  const [selectedExIndex, setSelectedExIndex] = useState(0);

  const context = prescription?.patient_context || {};
  const exercises = prescription?.exercises || [];
  const activeEx = exercises[selectedExIndex] || exercises[0] || {};

  const hasRomLimit = activeEx.max_safe_angle !== null && activeEx.max_safe_angle !== undefined;

  return (
    <div className="page">
      <div className="app-container" style={{ maxWidth: 720 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            <ArrowLeft size={16} /> Re-upload Report
          </button>
          <span className="badge badge-purple">Prescription Parsed</span>
        </div>

        <div className="card slide-up" style={{ padding: '2rem 1.5rem', background: 'var(--bg-card)', borderRadius: 20, border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '1rem', color: '#ffffff' }}>
            Your Physiotherapy Plan
          </h2>

          {/* Patient Context */}
          <div style={{
            background: 'var(--bg-elevated)',
            padding: '1.25rem',
            borderRadius: 14,
            border: '1px solid var(--border)',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Diagnosis / Clinical Status
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
              {context.diagnosis || 'Post-operative Rehabilitation'}
            </div>
            {context.surgical_status && (
              <div style={{ fontSize: '0.88rem', color: '#a5b4fc', marginTop: 4 }}>
                Status: {context.surgical_status}
              </div>
            )}
          </div>

          {/* Exercise Selector Tabs if multiple */}
          {exercises.length > 1 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                Prescribed Exercises
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {exercises.map((ex, i) => (
                  <button
                    key={i}
                    className={`btn btn-sm ${selectedExIndex === i ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSelectedExIndex(i)}
                    style={{
                      background: selectedExIndex === i ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--bg-elevated)',
                      color: selectedExIndex === i ? '#fff' : 'var(--text-primary)'
                    }}
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Exercise Spec Card */}
          <div style={{
            background: 'rgba(129, 140, 248, 0.08)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: 16,
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '1rem', color: '#ffffff' }}>
              {activeEx.name || 'Seated Active Knee Extension'}
            </h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '1rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ background: 'var(--bg-elevated)', padding: '0.85rem', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Sets</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#818cf8' }}>{activeEx.target_sets || 3}</div>
              </div>
              <div style={{ background: 'var(--bg-elevated)', padding: '0.85rem', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Reps</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#818cf8' }}>{activeEx.target_reps || 10}</div>
              </div>
              <div style={{ background: 'var(--bg-elevated)', padding: '0.85rem', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Maximum ROM</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: hasRomLimit ? '#ffe135' : 'var(--accent-red)' }}>
                  {hasRomLimit ? `${activeEx.max_safe_angle}°` : 'Unspecified'}
                </div>
              </div>
            </div>

            {/* Instructions */}
            {activeEx.instructions?.length > 0 && (
              <div style={{ marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Instructions
                </div>
                <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  {activeEx.instructions.map((ins, i) => <li key={i}>{ins}</li>)}
                </ul>
              </div>
            )}

            {/* Restrictions */}
            {activeEx.restrictions?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--accent-red)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Clinical Restrictions
                </div>
                <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.88rem', color: '#fca5a5', lineHeight: 1.6 }}>
                  {activeEx.restrictions.map((res, i) => <li key={i}>{res}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Missing Guardrail Warning if max_safe_angle is null */}
          {!hasRomLimit && (
            <div style={{
              display: 'flex', gap: '0.85rem', alignItems: 'flex-start',
              padding: '1rem 1.25rem', background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--accent-red)', borderRadius: 12, marginBottom: '1.5rem'
            }}>
              <AlertTriangle size={22} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: '0.88rem', color: '#fca5a5', lineHeight: 1.5, margin: 0 }}>
                <strong>Your report does not specify a safe ROM limit for this exercise.</strong> Please confirm the limit with your physiotherapist before using movement monitoring.
              </p>
            </div>
          )}

          {/* Primary Action Button */}
          <button
            id="btn-start-observer"
            className="btn"
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.05rem',
              fontWeight: 800,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justify: 'center',
              gap: 8,
              boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)'
            }}
            onClick={() => onStartObserver(activeEx)}
          >
            <Play size={20} fill="#fff" /> Start Observer Mode
          </button>
        </div>
      </div>
    </div>
  );
}
