import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Calendar, Dumbbell, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { getUserPlan, regeneratePlan } from '../../lib/api';
import { savePlan } from '../../lib/userSession';
import { SkeletonCard, ErrorMessage, SectionHeader, LoadingSpinner } from '../shared/SharedComponents';

function ExerciseCard({ exercise }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.85rem 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'var(--accent-green-glow)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Dumbbell size={18} color="var(--accent-green)" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{exercise.name}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {exercise.sets} sets × {exercise.reps} reps &nbsp;·&nbsp; {exercise.rest_seconds}s rest
        </div>
        {exercise.why_this_exercise && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
            {exercise.why_this_exercise}
          </div>
        )}
      </div>
    </div>
  );
}

function DayCard({ day }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{day.day}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--accent-green)', fontWeight: 500, marginTop: 2 }}>
            {day.focus}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-green">{day.exercises?.length || 0} exercises</span>
          {open ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
        </div>
      </div>
      {open && day.exercises && (
        <div style={{ marginTop: '0.5rem' }}>
          {day.exercises.map((ex, i) => (
            <ExerciseCard key={i} exercise={ex} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ userId, changeSummary, onClearChange }) {
  const [regenFeedback, setRegenFeedback] = useState('');
  const qc = useQueryClient();

  const { data: planData, isLoading, error, refetch } = useQuery({
    queryKey: ['plan', userId],
    queryFn: () => getUserPlan(userId),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const regenMutation = useMutation({
    mutationFn: () => regeneratePlan(userId, regenFeedback),
    onSuccess: (data) => {
      savePlan(data.plan);
      qc.invalidateQueries(['plan', userId]);
    },
  });

  const plan = planData?.plan_json;

  return (
    <div className="page">
      <div className="app-container">
        {/* Change summary toast replacement (inline banner) */}
        {changeSummary && (
          <div className="card accent fade-in" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <Zap size={20} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontWeight: 700, color: 'var(--accent-green)', marginBottom: 4 }}>Plan Updated ✨</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{changeSummary}</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClearChange} style={{ marginLeft: 'auto' }}>✕</button>
          </div>
        )}

        <SectionHeader
          title="Your Fitness Plan"
          subtitle={plan?.plan_summary}
          action={
            <button id="btn-regenerate" className="btn btn-secondary btn-sm"
              onClick={() => regenMutation.mutate()} disabled={regenMutation.isPending}>
              {regenMutation.isPending
                ? <><LoadingSpinner size={14} /> Regenerating…</>
                : <><RefreshCw size={14} /> Regenerate Plan</>}
            </button>
          }
        />

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1, 2, 3].map((i) => <SkeletonCard key={i} lines={4} />)}
          </div>
        )}

        {error && !isLoading && (
          <ErrorMessage message="Couldn't load your plan." onRetry={refetch} />
        )}

        {plan && (
          <>
            {/* Weekly schedule */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
              {plan.weekly_schedule?.map((day, i) => (
                <DayCard key={i} day={day} />
              ))}
            </div>

            {/* Nutrition tips */}
            {plan.nutrition_tips?.length > 0 && (
              <>
                <SectionHeader title="Nutrition Tips" subtitle="Simple, practical guidance — no calorie counting" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                  {plan.nutrition_tips.map((tip, i) => (
                    <div key={i} className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--accent-green)', fontSize: '1.2rem', lineHeight: 1 }}>🥗</span>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.6 }}>{tip}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Regenerate with feedback */}
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>Not quite right?</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
                Tell us what to change and we'll regenerate your plan.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <input id="regen-feedback" className="form-input" placeholder="e.g. Make it harder, I hate running, add more yoga…"
                  value={regenFeedback} onChange={(e) => setRegenFeedback(e.target.value)}
                  style={{ flex: 1 }} />
                <button id="btn-regen-feedback" className="btn btn-primary" onClick={() => regenMutation.mutate()}
                  disabled={regenMutation.isPending}>
                  {regenMutation.isPending ? <LoadingSpinner size={16} color="#0a0a0f" /> : <RefreshCw size={16} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
