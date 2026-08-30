import { useState } from 'react';
import { ArrowRight, ArrowLeft, Dumbbell, Target, Clock, User, AlertTriangle } from 'lucide-react';
import { onboardUser } from '../../lib/api';
import { getUserId, saveProfile, savePlan } from '../../lib/userSession';
import { LoadingSpinner } from '../shared/SharedComponents';

const EQUIPMENT_OPTIONS = [
  { value: 'bodyweight_only', label: 'Bodyweight Only' },
  { value: 'dumbbells', label: 'Dumbbells' },
  { value: 'resistance_bands', label: 'Resistance Bands' },
  { value: 'full_gym', label: 'Full Gym' },
];

const CONSTRAINT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'knee_pain', label: 'Knee Pain' },
  { value: 'back_pain', label: 'Back Pain' },
  { value: 'shoulder_pain', label: 'Shoulder Pain' },
  { value: 'wrist_pain', label: 'Wrist Pain' },
];

const STEPS = [
  { id: 'personal', title: 'Tell us about you', icon: User },
  { id: 'goals', title: 'Your goals', icon: Target },
  { id: 'schedule', title: 'Schedule & equipment', icon: Dumbbell },
  { id: 'constraints', title: 'Any limitations?', icon: AlertTriangle },
];

export default function OnboardingFlow({ onComplete }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    age: '',
    height_cm: '',
    weight_kg: '',
    sex: 'prefer_not_to_say',
    fitness_experience: 'beginner',
    goal: 'general_fitness',
    dietary_preference: 'no_preference',
    available_equipment: ['bodyweight_only'],
    available_time_minutes: 30,
    days_per_week: 3,
    constraints: ['none'],
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleArray = (key, val) => {
    setForm((f) => {
      const arr = f[key];
      if (val === 'none') return { ...f, [key]: ['none'] };
      const filtered = arr.filter((v) => v !== 'none');
      if (filtered.includes(val)) {
        return { ...f, [key]: filtered.filter((v) => v !== val) || ['none'] };
      }
      return { ...f, [key]: [...filtered, val] };
    });
  };

  const toggleEquipment = (val) => {
    setForm((f) => {
      const arr = f.available_equipment;
      if (arr.includes(val)) {
        const next = arr.filter((v) => v !== val);
        return { ...f, available_equipment: next.length ? next : ['bodyweight_only'] };
      }
      return { ...f, available_equipment: [...arr, val] };
    });
  };

  const isStepValid = () => {
    if (step === 0) return form.age && form.height_cm && form.weight_kg;
    if (step === 1) return form.goal && form.dietary_preference;
    if (step === 2) return form.available_equipment.length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      let height = Number(form.height_cm) || 170;
      // If entered in feet (e.g. 5.8 or 6.0), convert to cm
      if (height < 10) {
        height = Math.round(height * 30.48);
      } else if (height < 30) {
        // If entered in meters (e.g. 1.75)
        height = Math.round(height * 100);
      }

      const profile = {
        ...form,
        age: Number(form.age) || 25,
        height_cm: height,
        weight_kg: Number(form.weight_kg) || 70,
        available_time_minutes: Number(form.available_time_minutes) || 30,
        days_per_week: Number(form.days_per_week) || 3,
        available_equipment: form.available_equipment?.length ? form.available_equipment : ['bodyweight_only'],
        constraints: form.constraints.filter((c) => c !== 'none').length
          ? form.constraints.filter((c) => c !== 'none')
          : [],
      };
      const result = await onboardUser(profile);
      saveProfile(profile);
      savePlan(result.plan);
      onComplete({ userId: result.user_id, plan: result.plan });
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;
  const StepIcon = STEPS[step].icon;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.25rem',
    }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
            Ziddi<span style={{ color: 'var(--accent-green)' }}>Fit</span>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>
            Your personal AI fitness loop
          </p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Step {step + 1} of {STEPS.length}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-green)', fontWeight: 600 }}>
              {STEPS[step].title}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'var(--accent-green)',
              width: `${progress}%`,
              transition: 'width 0.4s ease',
              borderRadius: 2,
            }} />
          </div>
        </div>

        {/* Card */}
        <div className="card fade-in" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'var(--accent-green-glow)',
              border: '1px solid var(--border-active)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <StepIcon size={18} color="var(--accent-green)" />
            </div>
            <h3>{STEPS[step].title}</h3>
          </div>

          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Age</label>
                  <input id="onboard-age" type="number" className="form-input" placeholder="25" min="10" max="100"
                    value={form.age} onChange={(e) => set('age', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sex</label>
                  <select id="onboard-sex" className="form-select" value={form.sex} onChange={(e) => set('sex', e.target.value)}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Height (cm)</label>
                  <input id="onboard-height" type="number" className="form-input" placeholder="170" min="100" max="250"
                    value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Weight (kg)</label>
                  <input id="onboard-weight" type="number" className="form-input" placeholder="70" min="20" max="300"
                    value={form.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Fitness Experience</label>
                <select id="onboard-experience" className="form-select" value={form.fitness_experience}
                  onChange={(e) => set('fitness_experience', e.target.value)}>
                  <option value="beginner">Beginner — I'm just starting out</option>
                  <option value="intermediate">Intermediate — I work out occasionally</option>
                  <option value="advanced">Advanced — I train regularly</option>
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Primary Goal</label>
                <select id="onboard-goal" className="form-select" value={form.goal}
                  onChange={(e) => set('goal', e.target.value)}>
                  <option value="lose_weight">Lose weight</option>
                  <option value="build_muscle">Build muscle</option>
                  <option value="general_fitness">General fitness</option>
                  <option value="improve_endurance">Improve endurance</option>
                  <option value="improve_flexibility">Improve flexibility</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Dietary Preference</label>
                <select id="onboard-diet" className="form-select" value={form.dietary_preference}
                  onChange={(e) => set('dietary_preference', e.target.value)}>
                  <option value="no_preference">No preference</option>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="vegan">Vegan</option>
                  <option value="eggetarian">Eggetarian</option>
                  <option value="non_vegetarian">Non-vegetarian</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Days per week</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input id="onboard-days" type="range" min="1" max="7" value={form.days_per_week}
                    onChange={(e) => set('days_per_week', Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent-green)' }} />
                  <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700, color: 'var(--accent-green)', fontSize: '1.2rem' }}>
                    {form.days_per_week}
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Time per session (minutes)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <input id="onboard-time" type="range" min="15" max="120" step="5" value={form.available_time_minutes}
                    onChange={(e) => set('available_time_minutes', Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent-green)' }} />
                  <span style={{ minWidth: 48, textAlign: 'center', fontWeight: 700, color: 'var(--accent-green)', fontSize: '1.2rem' }}>
                    {form.available_time_minutes}m
                  </span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Available Equipment</label>
                <div className="checkbox-group">
                  {EQUIPMENT_OPTIONS.map((opt) => (
                    <label key={opt.value} id={`equip-${opt.value}`}
                      className={`checkbox-chip ${form.available_equipment.includes(opt.value) ? 'checked' : ''}`}
                      onClick={() => toggleEquipment(opt.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      {form.available_equipment.includes(opt.value) ? '✓ ' : ''}{opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                Do you have any injuries or physical limitations? We'll make sure your plan avoids anything that could cause discomfort.
              </p>
              <div className="form-group">
                <label className="form-label">Select all that apply</label>
                <div className="checkbox-group">
                  {CONSTRAINT_OPTIONS.map((opt) => (
                    <label key={opt.value} id={`constraint-${opt.value}`}
                      className={`checkbox-chip ${form.constraints.includes(opt.value) ? 'checked' : ''}`}
                      onClick={() => toggleArray('constraints', opt.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      {form.constraints.includes(opt.value) ? '✓ ' : ''}{opt.label}
                    </label>
                  ))}
                </div>
              </div>
              {error && (
                <p style={{ color: 'var(--accent-red)', fontSize: '0.88rem', background: 'rgba(255,82,82,0.08)', padding: '0.75rem', borderRadius: 8 }}>
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
            {step > 0 && (
              <button id="onboard-prev" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={loading}>
                <ArrowLeft size={16} /> Back
              </button>
            )}
            <div style={{ flex: 1 }} />
            {step < STEPS.length - 1 ? (
              <button id="onboard-next" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}
                disabled={!isStepValid()}>
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button id="onboard-submit" className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <><LoadingSpinner size={18} color="#0a0a0f" /> Generating your plan…</>
                ) : (
                  <><Target size={18} /> Get My Plan</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
