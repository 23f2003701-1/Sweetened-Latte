import { Dumbbell, Activity, ShieldAlert, ArrowRight, Zap, HeartPulse } from 'lucide-react';

export default function ModeSelectionScreen({ onSelectMode }) {
  return (
    <div className="page" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 20%, #1e1b4b 0%, #0a0a0f 70%)',
      padding: '2rem 1rem'
    }}>
      <div className="app-container" style={{ maxWidth: 840, width: '100%' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }} className="slide-up">
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0.4rem 1rem',
            background: 'rgba(255, 255, 255, 0.06)',
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '1rem',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)'
          }}>
            <Zap size={14} color="#ffe135" /> Gemini Multimodal + MediaPipe Vision Loop
          </div>

          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>
            How do you want to use ZiddiFit?
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: 560, margin: '0 auto' }}>
            Choose your mode below. You can switch between active fitness workouts and clinical rehabilitation monitoring anytime.
          </p>
        </div>

        {/* Two Primary Mode Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.75rem',
          marginBottom: '2rem'
        }}>
          {/* Option 1: Workout Mode */}
          <div
            id="mode-card-workout"
            className="card slide-up"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justify: 'space-between',
              padding: '2.25rem 1.75rem',
              background: 'linear-gradient(145deg, rgba(20, 24, 33, 0.9) 0%, rgba(10, 10, 15, 0.95) 100%)',
              border: '1px solid var(--border)',
              borderRadius: 24,
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{
              position: 'absolute',
              top: -40, right: -40,
              width: 140, height: 140,
              borderRadius: '50%',
              background: 'var(--accent-green)',
              opacity: 0.08,
              filter: 'blur(30px)',
              pointerEvents: 'none'
            }} />

            <div>
              <div style={{
                width: 60, height: 60, borderRadius: 16,
                background: 'var(--accent-green-glow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '1.5rem',
                border: '1px solid var(--border-active)'
              }}>
                <Dumbbell size={32} color="var(--accent-green)" />
              </div>

              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.75rem' }}>
                Option 1 — Workout Mode
              </h2>

              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                Personalized workouts, nutrition guidance, hydration tracking, and AI fitness coaching.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ AI Adaptive Plan Engine
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ Real-time Squat Form Coaching
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ Food Photo Scanner & Alternative Suggestions
                </div>
              </div>
            </div>

            <button
              id="btn-continue-workout"
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                gap: 8
              }}
              onClick={() => onSelectMode('workout')}
            >
              Continue with Workout <ArrowRight size={18} />
            </button>
          </div>

          {/* Option 2: Physiotherapy Mode */}
          <div
            id="mode-card-physio"
            className="card slide-up"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justify: 'space-between',
              padding: '2.25rem 1.75rem',
              background: 'linear-gradient(145deg, rgba(30, 27, 75, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: '1px solid rgba(129, 140, 248, 0.3)',
              borderRadius: 24,
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{
              position: 'absolute',
              top: -40, right: -40,
              width: 140, height: 140,
              borderRadius: '50%',
              background: '#818cf8',
              opacity: 0.12,
              filter: 'blur(30px)',
              pointerEvents: 'none'
            }} />

            <div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '1.5rem'
              }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 16,
                  background: 'rgba(129, 140, 248, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid rgba(129, 140, 248, 0.4)'
                }}>
                  <HeartPulse size={32} color="#818cf8" />
                </div>
                <span className="badge badge-purple" style={{ background: 'rgba(129, 140, 248, 0.2)', color: '#a5b4fc', border: '1px solid rgba(129, 140, 248, 0.4)' }}>
                  PhysioGuard AI
                </span>
              </div>

              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.75rem', color: '#ffffff' }}>
                Option 2 — Physiotherapy Mode
              </h2>

              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                Follow your therapist's prescribed exercises with AI-assisted movement monitoring.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ PDF / Photo Report Parsing with Gemini
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ Real-time Safe ROM Guardrail Check
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✓ Zero-Latency Voice Safety Corrections
                </div>
              </div>
            </div>

            <button
              id="btn-continue-physio"
              className="btn"
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1rem',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)'
              }}
              onClick={() => onSelectMode('physio')}
            >
              Continue with Physiotherapy <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Footnote */}
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ShieldAlert size={14} color="#818cf8" /> AI-assisted monitoring tool — not a substitute for clinical medical evaluation.
        </p>
      </div>
    </div>
  );
}
