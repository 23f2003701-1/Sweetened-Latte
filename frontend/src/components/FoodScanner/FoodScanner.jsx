import { useState, useRef } from 'react';
import { Camera, Upload, Zap, Info } from 'lucide-react';
import { analyzeMeal, getTodaysMeals } from '../../lib/api';
import { getProfile } from '../../lib/userSession';
import { LoadingSpinner } from '../shared/SharedComponents';
import { useQuery, useMutation } from '@tanstack/react-query';

function NutritionBar({ label, value, max, color = 'var(--accent-green)' }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color }}>{value}g</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function NutritionResultCard({ result }) {
  const n = result.estimated_nutrition || {};
  const confidenceColors = { high: 'badge-green', medium: 'badge-amber', low: 'badge-red' };

  return (
    <div className="card accent slide-up" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3>Meal Analysis</h3>
        <span className={`badge ${confidenceColors[result.confidence] || 'badge-blue'}`}>
          {result.confidence} confidence
        </span>
      </div>

      {/* Identified items */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
          Identified Items
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {result.identified_items?.map((item, i) => (
            <span key={i} className="badge badge-blue">{item}</span>
          ))}
        </div>
      </div>

      {/* Calories highlight */}
      {n.energy_kcal && (
        <div style={{ textAlign: 'center', margin: '1rem 0', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: 12 }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent-green)', lineHeight: 1 }}>
            {n.energy_kcal}
          </div>
          <div className="metric-label" style={{ marginTop: 4 }}>Estimated kcal</div>
        </div>
      )}

      {/* Macros */}
      <div style={{ marginBottom: '1rem' }}>
        <NutritionBar label="Protein" value={n.protein_g || 0} max={50} color="var(--accent-green)" />
        <NutritionBar label="Carbohydrates" value={n.carbs_g || 0} max={150} color="var(--accent-blue)" />
        <NutritionBar label="Fat" value={n.fat_g || 0} max={80} color="var(--accent-amber)" />
      </div>

      {/* Verdict */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem', background: 'var(--accent-green-glow)', borderRadius: 10, border: '1px solid var(--border-active)' }}>
        <Zap size={18} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
          {result.verdict}
        </p>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <Info size={12} /> Estimates only — not medical nutrition advice.
      </p>
    </div>
  );
}

export default function FoodScanner({ userId }) {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const profile = getProfile();

  const { data: todaysMealsData } = useQuery({
    queryKey: ['meals-today', userId],
    queryFn: () => getTodaysMeals(userId),
    staleTime: 2 * 60 * 1000,
  });
  const todaysMeals = todaysMealsData?.meals || [];

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeMeal(
      userId,
      imageFile,
      profile?.goal || 'general_fitness',
      profile?.dietary_preference || 'no_preference'
    ),
    onSuccess: (data) => setAnalysisResult(data),
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setAnalysisResult(null);
  };

  return (
    <div className="page">
      <div className="app-container" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: 4 }}>Can I Eat This?</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Take a photo of your meal for an instant AI nutrition verdict.
          </p>
        </div>

        {/* Upload area */}
        <div
          id="food-upload-zone"
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${imagePreview ? 'var(--border-active)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-xl)',
            minHeight: 240,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--bg-card)',
            transition: 'border-color 0.2s',
          }}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Meal preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', maxHeight: 360 }} />
          ) : (
            <>
              <Upload size={40} color="var(--text-muted)" strokeWidth={1.5} />
              <p style={{ color: 'var(--text-muted)', marginTop: '1rem', fontSize: '0.9rem' }}>
                Click to upload a meal photo
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                JPG, PNG, WEBP accepted
              </p>
            </>
          )}
          <input
            id="food-file-input"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button id="btn-camera-capture" className="btn btn-secondary" style={{ flex: 1 }}
            onClick={() => fileInputRef.current?.click()}>
            <Camera size={16} /> {imagePreview ? 'Retake' : 'Take Photo'}
          </button>
          <button id="btn-analyze-meal" className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => analyzeMutation.mutate()}
            disabled={!imageFile || analyzeMutation.isPending}>
            {analyzeMutation.isPending
              ? <><LoadingSpinner size={18} color="#0a0a0f" /> Analysing with Gemini…</>
              : <><Zap size={18} /> Analyze Meal</>}
          </button>
        </div>

        {analyzeMutation.isError && (
          <p style={{ color: 'var(--accent-red)', fontSize: '0.88rem', marginTop: '0.75rem', textAlign: 'center' }}>
            Analysis failed — please try again.
          </p>
        )}

        {analysisResult && <NutritionResultCard result={analysisResult} />}

        {/* Today's meal log */}
        {todaysMeals.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Today's Meals</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {todaysMeals.map((meal, i) => (
                <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🍽</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {meal.identified_items?.join(', ') || 'Meal'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {meal.estimated_nutrition?.energy_kcal} kcal · {meal.estimated_nutrition?.protein_g}g protein
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
