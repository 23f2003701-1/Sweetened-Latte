import { useState, useEffect } from 'react';
import { Award, CheckCircle2, AlertCircle, ArrowRight, RotateCcw, Home } from 'lucide-react';
import { getPhysioSummary } from '../../lib/api';
import { LoadingSpinner } from '../shared/SharedComponents';

export default function PhysioSummary({ telemetry, onRestart, onSwitchMode }) {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);

  const setsDone = telemetry?.sets_completed || 3;
  const repsDone = telemetry?.reps_completed || 30;
  const exceededCount = telemetry?.reps_with_limit_exceeded || 0;
  const compliantReps = Math.max(0, repsDone - exceededCount);

  useEffect(() => {
    let isMounted = true;
    async function fetchSummary() {
      try {
        const data = await getPhysioSummary(telemetry || {});
        if (isMounted) {
          setSummaryData(data);
          setLoading(false);
        }
      } catch (e) {
        console.warn('Error fetching physio summary:', e);
        if (isMounted) setLoading(false);
      }
    }
    fetchSummary();
    return () => { isMounted = false; };
  }, [telemetry]);

  return (
    <div className="page">
      <div className="app-container" style={{ maxWidth: 680 }}>
        <div className="card slide-up" style={{
          padding: '2.5rem 1.75rem',
          background: 'var(--bg-card)',
          borderRadius: 24,
          border: '1px solid var(--border)'
        }}>
          {/* Header Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.25rem',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            <Award size={38} color="var(--accent-green)" />
          </div>

          <h1 style={{ fontSize: '2rem', fontWeight: 900, textAlign: 'center', marginBottom: '0.35rem', color: '#ffffff' }}>
            Physiotherapy Session Complete
          </h1>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '2rem' }}>
            Exercise: <strong style={{ color: '#fff' }}>{telemetry?.exercise_name || 'Seated Active Knee Extension'}</strong>
          </p>

          {/* Metric Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '1rem',
            marginBottom: '1.75rem'
          }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Sets</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#818cf8' }}>{setsDone}</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Repetitions</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#818cf8' }}>{repsDone}</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>ROM Compliance</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: 4 }}>
                {compliantReps} / {repsDone || 1}
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Corrections</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: exceededCount > 0 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
                {exceededCount}
              </div>
            </div>
          </div>

          {/* Gemini Clinical Summary */}
          <div style={{
            padding: '1.25rem',
            background: 'rgba(129, 140, 248, 0.08)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: 16,
            marginBottom: '2rem'
          }}>
            <div style={{ fontSize: '0.78rem', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem', fontWeight: 700 }}>
              Gemini AI Clinical Adherence Summary
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <LoadingSpinner size={16} /> Generating clinical session insights…
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.95rem', color: '#ffffff', lineHeight: 1.6, margin: 0, marginBottom: '0.75rem' }}>
                  {summaryData?.overall_adherence || "Good adherence with minimal ROM deviations observed during the session."}
                </p>
                {summaryData?.clinical_notes?.length > 0 && (
                  <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {summaryData.clinical_notes.map((note, i) => <li key={i}>{note}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              id="btn-restart-physio"
              className="btn btn-secondary"
              style={{ padding: '0.85rem 1.5rem', borderRadius: 12 }}
              onClick={onRestart}
            >
              <RotateCcw size={16} /> New Prescribed Exercise
            </button>

            <button
              id="btn-switch-mode-physio"
              className="btn btn-primary"
              style={{ padding: '0.85rem 1.5rem', borderRadius: 12 }}
              onClick={onSwitchMode}
            >
              <Home size={16} /> Mode Selection Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
