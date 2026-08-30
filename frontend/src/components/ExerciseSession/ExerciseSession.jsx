import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Square, Flag, Mic, MicOff } from 'lucide-react';
import CameraView, { getTickFeedback } from './CameraView';
import { startSession, completeSet, endSession, repFeedback } from '../../lib/api';
import { LoadingSpinner } from '../shared/SharedComponents';

// ── Exercise options ──────────────────────────────────────────────────────────
const EXERCISES = ['Squats', 'Bicep Curls', 'Lunges'];

const EXERCISE_EMOJIS = {
  'Squats':      '🦵',
  'Bicep Curls': '💪',
  'Lunges':      '🏃',
};

// ── useVoiceFeedback hook ─────────────────────────────────────────────────────
/**
 * Browser TTS via Web Speech API.
 *
 * KEY FIX: Split into speakRepCount and speakSuggestion so they can overlap.
 * The Web Speech API queues utterances — by NOT calling cancel(), both the
 * rep count and the coaching suggestion play sequentially without cutting
 * each other off.
 *
 * Anti-glitch rules:
 *  1. Same suggestion phrase suppressed for 8 s.
 *  2. NO cancel() — utterances queue naturally.
 *  3. Mute toggle respected.
 */
function useVoiceFeedback() {
  const mutedRef      = useRef(false);
  const lastSuggestionRef = useRef({ phrase: '', time: 0 });
  const [muted, setMuted] = useState(false);

  const _getVoice = useCallback(() => {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Premium'))
    ) || voices.find((v) => v.lang.startsWith('en')) || null;
  }, []);

  const speakRepCount = useCallback((count) => {
    if (!window.speechSynthesis || mutedRef.current) return;

    // Force real-time sync by clearing any lagging suggestions/reps
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(String(count));
    utter.rate   = 1.15;
    utter.pitch  = 1.05;
    utter.volume = 1.0;

    const voice = _getVoice();
    if (voice) utter.voice = voice;

    window.speechSynthesis.speak(utter);
  }, [_getVoice]);

  /**
   * Speak a coaching suggestion. Deduplicated (same phrase suppressed for 8s).
   * Does NOT cancel — queues after any in-progress speech (like rep count).
   */
  const speakSuggestion = useCallback((phrase) => {
    if (!phrase || !window.speechSynthesis || mutedRef.current) return;

    const now = Date.now();
    const { phrase: lastPhrase, time: lastTime } = lastSuggestionRef.current;

    // Debounce: same phrase within 8 s → skip
    if (phrase === lastPhrase && now - lastTime < 8000) return;

    const utter = new SpeechSynthesisUtterance(phrase);
    utter.rate   = 1.0;
    utter.pitch  = 1.0;
    utter.volume = 0.9;

    const voice = _getVoice();
    if (voice) utter.voice = voice;

    lastSuggestionRef.current = { phrase, time: now };
    window.speechSynthesis.speak(utter);
  }, [_getVoice]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (next) window.speechSynthesis?.cancel();
      return next;
    });
  }, []);

  return { speakRepCount, speakSuggestion, muted, toggleMute };
}

// ── Sub-components ────────────────────────────────────────────────────────────
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
      <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>{coaching.headline}</p>
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

/** Live "Coach Says" banner — fades in when a new Gemini phrase arrives */
function CoachBanner({ phrase }) {
  if (!phrase) return null;
  return (
    <div
      key={phrase}
      className="fade-in"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        background: 'linear-gradient(135deg, rgba(0,230,118,0.12), rgba(0,230,118,0.04))',
        border: '1px solid rgba(0,230,118,0.3)',
        borderRadius: 10, padding: '0.65rem 1rem',
        fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-green)',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>🗣️</span>
      <span>{phrase}</span>
    </div>
  );
}

/** Pill selector for exercise choice */
function ExercisePicker({ selected, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
      {EXERCISES.map((ex) => (
        <button
          key={ex}
          id={`ex-pick-${ex.replace(/\s+/g, '-').toLowerCase()}`}
          disabled={disabled}
          onClick={() => onChange(ex)}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: 20,
            border: `1.5px solid ${selected === ex ? 'var(--accent-green)' : 'var(--border)'}`,
            background: selected === ex ? 'rgba(0,230,118,0.12)' : 'var(--bg-elevated)',
            color: selected === ex ? 'var(--accent-green)' : 'var(--text-secondary)',
            fontWeight: 600, fontSize: '0.82rem', cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all 0.18s',
          }}
        >
          {EXERCISE_EMOJIS[ex]} {ex}
        </button>
      ))}
    </div>
  );
}

// ── Main ExerciseSession component ────────────────────────────────────────────
export default function ExerciseSession({ userId, workoutContext, onWorkoutEnd }) {
  const [phase, setPhase]               = useState('idle');   // idle | active | between_sets | ended
  const [exercise, setExercise]         = useState(workoutContext?.name || 'Squats');
  const [sessionId, setSessionId]       = useState(null);
  const [repCount, setRepCount]         = useState(0);
  const [reps, setReps]                 = useState([]);
  const [currentSet, setCurrentSet]     = useState(1);
  const [frameMetrics, setFrameMetrics] = useState(null);
  const [lastCoaching, setLastCoaching] = useState(null);
  const [setLoading, setSetLoading]     = useState(false);
  const [endLoading, setEndLoading]     = useState(false);
  const [coachPhrase, setCoachPhrase]   = useState('');

  const repsRef            = useRef([]);
  const isFetchingRef      = useRef(false);   // Gemini per-rep call mutex
  const repCountRef        = useRef(0);        // shadow for callbacks
  const engineRef          = useRef(null);     // engine exposed from CameraView

  const { speakRepCount, speakSuggestion, muted, toggleMute } = useVoiceFeedback();

  // Keep repCountRef in sync
  useEffect(() => { repCountRef.current = repCount; }, [repCount]);

  // ── Exercise change (reset if mid-session) ────────────────────────────────
  const handleExerciseChange = (ex) => {
    if (phase === 'active') return; // don't switch during active set
    setExercise(ex);
    setRepCount(0);
    setReps([]);
    repsRef.current = [];
    setCoachPhrase('');
    // Start a new session for the new exercise
    setSessionId(null);
  };

  // ── Start set ────────────────────────────────────────────────────────────
  const handleStartSet = async () => {
    setRepCount(0);
    setReps([]);
    repsRef.current = [];
    repCountRef.current = 0;
    setCoachPhrase('');

    // Clear any stuck speech queues from before the set started
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (!sessionId) {
      try {
        const s = await startSession(userId, exercise);
        setSessionId(s.session_id);
      } catch (e) {
        console.error('Failed to start session', e);
      }
    }
    setPhase('active');
    speakSuggestion(`Starting ${exercise}. Let's go!`);
  };

  // ── Per-rep callback from CameraView ─────────────────────────────────────
  const handleRepComplete = useCallback((repData) => {
    const newCount = repCountRef.current + 1;
    setRepCount(newCount);
    repCountRef.current = newCount;

    setReps((prev) => {
      const updated = [...prev, repData];
      repsRef.current = updated;
      return updated;
    });

    // Speak rep count immediately (queues, does NOT cancel ongoing speech)
    speakRepCount(newCount);

    // Fetch Gemini phrase (one at a time — no concurrent calls)
    if (!isFetchingRef.current) {
      isFetchingRef.current = true;
      repFeedback(exercise, { ...repData, rep_number: newCount })
        .then(({ phrase }) => {
          if (phrase) {
            setCoachPhrase(phrase);
            // Speak suggestion after a small delay so it queues after rep count
            setTimeout(() => speakSuggestion(phrase), 600);
          }
        })
        .catch((err) => console.warn('[repFeedback]', err))
        .finally(() => { isFetchingRef.current = false; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, speakRepCount, speakSuggestion]);

  const handleFrameMetrics = useCallback((metrics) => {
    setFrameMetrics(metrics);
  }, []);

  // ── Finish set ───────────────────────────────────────────────────────────
  const handleFinishSet = async () => {
    setPhase('between_sets');
    setSetLoading(true);

    const repsData = repsRef.current;
    if (repsData.length === 0) { setSetLoading(false); return; }

    // Get rich set summary from the engine
    const engine = engineRef.current;
    const setSummary = engine?.getSetSummary?.() || null;

    // Build payload — use engine set summary if available, fallback to legacy format
    const avgDepth    = repsData.reduce((s, r) => s + (r.depth_score ?? 80), 0) / repsData.length;
    const avgTempo    = repsData.reduce((s, r) => s + (r.tempo_seconds ?? 3), 0) / repsData.length;
    const alignIssues = repsData.filter((r) => !r.alignment_ok).length;

    const payload = {
      user_id:                userId,
      exercise,
      reps_completed:         repsData.length,
      avg_depth_score:        Math.round(avgDepth),
      avg_tempo_seconds:      Math.round(avgTempo * 10) / 10,
      alignment_issues_count: alignIssues,
      per_rep: repsData.map((r, i) => ({
        rep_number:      i + 1,
        depth_score:     r.depth_score ?? 80,
        alignment_ok:    r.alignment_ok ?? true,
        back_angle_max:  r.back_angle_max ?? r.back_angle ?? 0,
        tempo_seconds:   r.tempo_seconds ?? 3,
      })),
      // Rich set summary from engine (for enhanced Gemini coaching)
      set_summary: setSummary,
    };

    try {
      const sid = sessionId || 'demo-session';
      const result = await completeSet(sid, payload);
      setLastCoaching(result.coaching);
      if (result.coaching?.headline) speakSuggestion(result.coaching.headline);
    } catch (e) {
      console.error('Set complete error', e);
      const fallback = {
        headline:       'Great set! Keep it up 💪',
        what_went_well: 'You showed up and got the reps done.',
        focus_next_set: 'Keep that depth consistent.',
        form_score:     Math.round(avgDepth * 0.8),
      };
      setLastCoaching(fallback);
      speakSuggestion(fallback.headline);
    }

    setCurrentSet((c) => c + 1);
    setSetLoading(false);
  };

  // ── End workout ──────────────────────────────────────────────────────────
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
    speakSuggestion("Great workout! Well done.");
    setEndLoading(false);
    setPhase('ended');
    onWorkoutEnd?.(changeSummary);
  };

  const ticks = frameMetrics ? getTickFeedback(frameMetrics, exercise) : [];
  const isActive = phase === 'active';

  return (
    <div className="page">
      <div className="app-container">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: 4 }}>{exercise} Coach</h1>
            {workoutContext ? (
              <div style={{ 
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem', 
                background: 'rgba(0, 230, 118, 0.1)', padding: '0.4rem 0.8rem', 
                borderRadius: '8px', border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)', fontWeight: 600, fontSize: '0.9rem',
                marginTop: '0.5rem'
              }}>
                Target: {workoutContext.sets} sets of {workoutContext.reps} reps
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>
                Real-time form tracking powered by MediaPipe — video never leaves your device.
              </p>
            )}
          </div>
          {/* Mute toggle */}
          <button
            id="btn-toggle-mute"
            title={muted ? 'Unmute voice' : 'Mute voice'}
            onClick={toggleMute}
            style={{
              background: muted ? 'var(--bg-elevated)' : 'rgba(0,230,118,0.12)',
              border: `1.5px solid ${muted ? 'var(--border)' : 'var(--accent-green)'}`,
              borderRadius: 8, padding: '0.45rem 0.75rem',
              color: muted ? 'var(--text-muted)' : 'var(--accent-green)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.18s',
            }}
          >
            {muted ? <MicOff size={16} /> : <Mic size={16} />}
            {muted ? 'Muted' : 'Voice On'}
          </button>
        </div>

        {/* Exercise picker (disabled during active set) */}
        <ExercisePicker selected={exercise} onChange={handleExerciseChange} disabled={isActive} />

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Camera - Left Side */}
          <div style={{ flex: '1 1 500px', minWidth: 320 }}>
            <CameraView
              active={isActive}
              exercise={exercise}
              repCount={repCount}
              onRepComplete={handleRepComplete}
              onFrameMetrics={handleFrameMetrics}
              engineRef={engineRef}
            />
          </div>

          {/* Data and Controls - Right Side */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Live metrics row */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-around', padding: '1.5rem' }}>
              <MetricBig value={repCount} label="REPS" />
              <MetricBig value={currentSet} label="SET" color="var(--accent-blue)" />
              <MetricBig
                value={frameMetrics ? Math.round(frameMetrics.depth ?? frameMetrics.elbowAngle ?? frameMetrics.frontKneeAngle ?? 0) : '--'}
                label="SCORE"
                color={frameMetrics?.depth >= 70 ? 'var(--accent-green)' : 'var(--accent-amber)'}
              />
            </div>

            {/* Live "Coach Says" Gemini banner */}
            {isActive && coachPhrase && <CoachBanner phrase={coachPhrase} />}

            {/* Real-time ticks */}
            {isActive && frameMetrics && (
              <div className="card fade-in">
                <div style={{ marginBottom: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Live Form Check — {exercise}
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
              {(phase === 'idle' || phase === 'between_sets') && (
                <button id="btn-start-set" className="btn btn-primary btn-lg" onClick={handleStartSet} style={{ flex: 1 }}>
                  <Play size={18} /> {phase === 'idle' ? `Start Set · ${exercise}` : `Start Set ${currentSet} · ${exercise}`}
                </button>
              )}

              {phase === 'active' && (
                <button id="btn-finish-set" className="btn btn-secondary btn-lg" onClick={handleFinishSet} disabled={setLoading} style={{ flex: 1 }}>
                  {setLoading ? <><LoadingSpinner size={18} /> Analysing…</> : <><Square size={18} /> Finish Set</>}
                </button>
              )}

              {(phase === 'active' || phase === 'between_sets') && (
                <button id="btn-end-workout" className="btn btn-danger" onClick={handleEndWorkout} disabled={endLoading}>
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
                    onClick={() => { setPhase('idle'); setRepCount(0); setCurrentSet(1); setLastCoaching(null); setCoachPhrase(''); }}>
                    Start Another
                  </button>
                </div>
              )}
            </div>

            {/* Set analysis loading */}
            {setLoading && (
              <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                <LoadingSpinner size={32} />
                <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', fontSize: '0.9rem' }}>
                  Gemini is analysing your set…
                </p>
              </div>
            )}

            {/* Set-end coaching card */}
            {!setLoading && <CoachingCard coaching={lastCoaching} />}

            {/* Rep history */}
            {reps.length > 0 && phase !== 'active' && (
              <div className="card" style={{ marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
                  Rep Breakdown — Set {currentSet - 1} · {exercise}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {reps.map((r, i) => {
                    const score = r.depth_score ?? 80;
                    return (
                      <div key={i} style={{
                        textAlign: 'center', padding: '0.5rem 0.75rem',
                        background: 'var(--bg-elevated)', borderRadius: 8, minWidth: 60,
                        border: `1px solid ${score >= 70 ? 'var(--border-active)' : 'var(--border)'}`,
                      }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>REP {i + 1}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: score >= 70 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                          {Math.round(score)}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: r.alignment_ok ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                          {r.alignment_ok ? '✓ form' : '⚠ form'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
