import { useState, useRef, useCallback } from 'react';
import { Play, Square, Flag, Camera } from 'lucide-react';
import CameraView, { getTickFeedback } from './CameraView';
import { startSession, completeSet, endSession } from '../../lib/api';
import { LoadingSpinner } from '../shared/SharedComponents';

function MetricBig({ value, label, color = 'var(--accent-green)' }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="metric-big" style={{ color }}>{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function CoachingCard({ coaching }) {
  if (!coaching) return null;
  const score = coaching.form_score ?? 0;
  const scoreColor = score >= 85 ? 'var(--accent-green)' : score >= 65 ? 'var(--accent-amber)' : 'var(--accent-red)';

  return (
    <div className="card accent slide-up" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3>Coach Feedback</h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: scoreColor }}>{score}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/100</span>
        </div>
      </div>
      <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
        {coaching.headline}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1rem' }}>✅</span>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong>Well done:</strong> {coaching.what_went_well}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1rem' }}>🎯</span>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong>Focus next set:</strong> {coaching.focus_next_set}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ExerciseSession({ userId, onWorkoutEnd }) {
  const [phase, setPhase] = useState('idle'); // idle | active | between_sets | ended
  const [sessionId, setSessionId] = useState(null);
  const [repCount, setRepCount] = useState(0);
  const [reps, setReps] = useState([]);
  const [currentSet, setCurrentSet] = useState(1);
  const [frameMetrics, setFrameMetrics] = useState(null);
  const [lastCoaching, setLastCoaching] = useState(null);
  const [setLoading, setSetLoading] = useState(false);
  const [endLoading, setEndLoading] = useState(false);

  const repsRef = useRef([]);

  const handleStartSet = async () => {
    setRepCount(0);
    setReps([]);
    repsRef.current = [];

    if (!sessionId) {
      try {
        const s = await startSession(userId, 'Squat');
        setSessionId(s.session_id);
      } catch (e) {
        console.error('Failed to start session', e);
      }
    }
    setPhase('active');
  };

  const handleRepComplete = useCallback((repData) => {
    setRepCount((c) => c + 1);
    setReps((prev) => {
      const updated = [...prev, repData];
      repsRef.current = updated;
      return updated;
    });
  }, []);

  const handleFrameMetrics = useCallback((metrics) => {
    setFrameMetrics(metrics);
  }, []);

  const handleFinishSet = async () => {
    setPhase('between_sets');
    setSetLoading(true);

    const repsData = repsRef.current;
    if (repsData.length === 0) {
      setSetLoading(false);
      return;
    }

    const avgDepth = repsData.reduce((s, r) => s + r.depth_score, 0) / repsData.length;
    const avgTempo = repsData.reduce((s, r) => s + r.tempo_seconds, 0) / repsData.length;
    const alignIssues = repsData.filter((r) => !r.alignment_ok).length;

    const payload = {
      user_id: userId,
      exercise: 'Squat',
      reps_completed: repsData.length,
      avg_depth_score: Math.round(avgDepth),
      avg_tempo_seconds: Math.round(avgTempo * 10) / 10,
      alignment_issues_count: alignIssues,
      per_rep: repsData.map((r, i) => ({
        rep_number: i + 1,
        depth_score: r.depth_score,
        alignment_ok: r.alignment_ok,
        back_angle_max: r.back_angle_max,
        tempo_seconds: r.tempo_seconds,
      })),
    };

    try {
      const sid = sessionId || 'demo-session';
      const result = await completeSet(sid, payload);
      setLastCoaching(result.coaching);
    } catch (e) {
      console.error('Set complete error', e);
      setLastCoaching({
        headline: 'Great set! Keep it up 💪',
        what_went_well: 'You showed up and got the reps done.',
        focus_next_set: 'Keep that depth consistent.',
        form_score: Math.round(avgDepth * 0.8),
      });
    }

    setCurrentSet((c) => c + 1);
    setSetLoading(false);
  };

  const handleEndWorkout = async () => {
    setEndLoading(true);
    let changeSummary = null;
    try {
      const sid = sessionId || 'demo-session';
      const result = await endSession(sid, userId, '', '');
      changeSummary = result.change_summary;
    } catch (e) {
      console.error('End session error', e);
      changeSummary = "Great workout! We'll keep tracking your progress.";
    }
    setEndLoading(false);
    setPhase('ended');
    onWorkoutEnd?.(changeSummary);
  };

  const ticks = frameMetrics ? getTickFeedback(frameMetrics) : [];

  return (
    <div className="page">
      <div className="app-container">
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: 4 }}>Squat Coach</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Real-time form tracking powered by MediaPipe — video never leaves your device.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
          {/* Camera */}
          <CameraView
            active={phase === 'active'}
            repCount={repCount}
            onRepComplete={handleRepComplete}
            onFrameMetrics={handleFrameMetrics}
          />

          {/* Live metrics row */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-around', padding: '1.5rem' }}>
            <MetricBig value={repCount} label="REPS" />
            <MetricBig value={currentSet} label="SET" color="var(--accent-blue)" />
            <MetricBig
              value={frameMetrics ? Math.round(frameMetrics.depth) : '--'}
              label="DEPTH"
              color={frameMetrics?.depth >= 70 ? 'var(--accent-green)' : 'var(--accent-amber)'}
            />
          </div>

          {/* Real-time ticks */}
          {phase === 'active' && frameMetrics && (
            <div className="card fade-in">
              <div style={{ marginBottom: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Live Form Check
              </div>
              {ticks.map((tick, i) => (
                <div key={i} className={`tick ${tick.class}`}>
                  <span>{tick.ok ? '✓' : '⚠'}</span>
                  <span style={{ fontWeight: 600 }}>{tick.label}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.82rem' }}>
                    {tick.msg}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {phase === 'idle' || phase === 'between_sets' ? (
              <button id="btn-start-set" className="btn btn-primary btn-lg"
                onClick={handleStartSet} style={{ flex: 1 }}>
                <Camera size={18} /> {phase === 'idle' ? 'Start Set' : `Start Set ${currentSet}`}
              </button>
            ) : phase === 'active' ? (
              <button id="btn-finish-set" className="btn btn-secondary btn-lg"
                onClick={handleFinishSet} disabled={setLoading} style={{ flex: 1 }}>
                {setLoading ? <><LoadingSpinner size={18} /> Analysing…</> : <><Square size={18} /> Finish Set</>}
              </button>
            ) : null}

            {(phase === 'active' || phase === 'between_sets') && (
              <button id="btn-end-workout" className="btn btn-danger"
                onClick={handleEndWorkout} disabled={endLoading}>
                {endLoading ? <LoadingSpinner size={18} color="white" /> : <><Flag size={16} /> End Workout</>}
              </button>
            )}

            {phase === 'ended' && (
              <div className="card" style={{ width: '100%', textAlign: 'center' }}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎉</p>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>Workout Complete!</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Check the Dashboard to see how your plan has adapted.
                </p>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: '1rem' }}
                  onClick={() => { setPhase('idle'); setRepCount(0); setCurrentSet(1); setLastCoaching(null); }}>
                  Start Another
                </button>
              </div>
            )}
          </div>

          {/* Coaching feedback */}
          {setLoading && (
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <LoadingSpinner size={32} />
              <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', fontSize: '0.9rem' }}>
                Gemini is analysing your set…
              </p>
            </div>
          )}
          {!setLoading && <CoachingCard coaching={lastCoaching} />}

          {/* Rep history */}
          {reps.length > 0 && phase !== 'active' && (
            <div className="card" style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                Rep Breakdown — Set {currentSet - 1}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {reps.map((r, i) => (
                  <div key={i} style={{
                    textAlign: 'center',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-elevated)',
                    borderRadius: 8,
                    minWidth: 60,
                    border: `1px solid ${r.depth_score >= 70 ? 'var(--border-active)' : 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>REP {i + 1}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700,
                      color: r.depth_score >= 70 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                      {Math.round(r.depth_score)}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: r.alignment_ok ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                      {r.alignment_ok ? '✓ align' : '⚠ align'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
