import { useState, useEffect, useCallback } from 'react';
import { Droplets, Bell, BellOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logWater, getTodaysHydration } from '../../lib/api';
import { LoadingSpinner } from '../shared/SharedComponents';

function ProgressRing({ percent, size = 120, stroke = 10 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 100 ? 'var(--accent-green)' : percent >= 60 ? 'var(--accent-amber)' : 'var(--accent-blue)';

  return (
    <svg width={size} height={size} className="progress-ring" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="var(--bg-elevated)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s' }} />
    </svg>
  );
}

export default function HydrationWidget({ userId }) {
  const qc = useQueryClient();
  const [reminderActive, setReminderActive] = useState(false);
  const [reminderInterval, setReminderInterval] = useState(60); // minutes
  const [nextReminder, setNextReminder] = useState(null);
  const [reminderTimer, setReminderTimer] = useState(null);
  const [showReminder, setShowReminder] = useState(false);

  const { data: hydration, isLoading } = useQuery({
    queryKey: ['hydration', userId],
    queryFn: () => getTodaysHydration(userId),
    refetchInterval: 30000,
  });

  const logMutation = useMutation({
    mutationFn: () => logWater(userId, 250),
    onSuccess: () => {
      qc.invalidateQueries(['hydration', userId]);
      setShowReminder(false);
      // Reset reminder timer
      if (reminderActive) scheduleReminder();
    },
  });

  const scheduleReminder = useCallback(() => {
    if (reminderTimer) clearTimeout(reminderTimer);
    const ms = reminderInterval * 60 * 1000;
    const next = new Date(Date.now() + ms);
    setNextReminder(next);
    const t = setTimeout(() => {
      setShowReminder(true);
    }, ms);
    setReminderTimer(t);
  }, [reminderInterval, reminderTimer]);

  const toggleReminder = () => {
    if (reminderActive) {
      clearTimeout(reminderTimer);
      setReminderTimer(null);
      setNextReminder(null);
      setReminderActive(false);
    } else {
      setReminderActive(true);
      scheduleReminder();
    }
  };

  useEffect(() => {
    return () => { if (reminderTimer) clearTimeout(reminderTimer); };
  }, [reminderTimer]);

  const totalMl = hydration?.total_ml || 0;
  const targetMl = hydration?.target_ml || 2000;
  const logs = hydration?.logs || [];
  const percent = Math.min(100, Math.round((totalMl / targetMl) * 100));
  const glasses = Math.round(totalMl / 250);

  return (
    <div className="page">
      <div className="app-container" style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: 4 }}>Hydration</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Staying hydrated is one of the easiest wins you can get.
          </p>
        </div>

        {/* Reminder flash */}
        {showReminder && (
          <div className="card accent fade-in" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💧</p>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>Time to drink water!</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              You set a reminder every {reminderInterval} minutes. Let's go!
            </p>
            <button id="btn-drink-water-reminder" className="btn btn-primary"
              onClick={() => logMutation.mutate()} disabled={logMutation.isPending}>
              {logMutation.isPending ? <LoadingSpinner size={18} color="#0a0a0f" /> : '💧 I Drank Water!'}
            </button>
          </div>
        )}

        {/* Progress */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem' }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <ProgressRing percent={percent} size={160} stroke={12} />
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1, color: 'var(--accent-green)' }}>
                {isLoading ? '--' : `${glasses}`}
              </div>
              <div className="metric-label">GLASSES</div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {totalMl} ml <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {targetMl} ml</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {percent >= 100 ? '🎉 Daily goal reached!' : `${targetMl - totalMl} ml left to go`}
            </div>
          </div>

          <button id="btn-drink-water" className="btn btn-primary btn-lg"
            onClick={() => logMutation.mutate()} disabled={logMutation.isPending}
            style={{ minWidth: 220 }}>
            {logMutation.isPending
              ? <LoadingSpinner size={18} color="#0a0a0f" />
              : <><Droplets size={20} /> I Drank Water (250ml)</>}
          </button>
        </div>

        {/* Reminder settings */}
        <div className="card" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3>Reminders</h3>
              {reminderActive && nextReminder && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Next reminder: {nextReminder.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <button id="btn-toggle-reminder" className={`btn ${reminderActive ? 'btn-danger' : 'btn-secondary'} btn-sm`}
              onClick={toggleReminder}>
              {reminderActive ? <><BellOff size={14} /> Stop</> : <><Bell size={14} /> Enable</>}
            </button>
          </div>
          <div className="form-group">
            <label className="form-label">Remind every (minutes)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input id="reminder-interval" type="range" min="15" max="120" step="5" value={reminderInterval}
                onChange={(e) => setReminderInterval(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent-green)' }} />
              <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700, color: 'var(--accent-green)' }}>
                {reminderInterval}m
              </span>
            </div>
          </div>
        </div>

        {/* Log timeline */}
        {logs.length > 0 && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Today's Log</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {logs.map((log, i) => {
                const time = new Date(log).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.3rem 0.7rem', background: 'var(--bg-elevated)',
                    borderRadius: 99, fontSize: '0.8rem', color: 'var(--accent-green)',
                    border: '1px solid var(--border-active)',
                  }}>
                    <Droplets size={12} /> {time}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
