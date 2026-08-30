import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, Zap, Info, RefreshCw, X, AlertCircle, Flame, Sparkles, Dumbbell } from 'lucide-react';
import { analyzeMeal, getTodaysMeals, logMealChoice } from '../../lib/api';
import { getProfile } from '../../lib/userSession';
import { LoadingSpinner } from '../shared/SharedComponents';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function NutritionBar({ label, valueRange, numVal, max, color = 'var(--accent-green)' }) {
  const pct = Math.min(100, Math.max(12, (numVal / max) * 100));
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color }}>{valueRange}</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function NutritionResultCard({ result, userId }) {
  const [selectedChoice, setSelectedChoice] = useState(null); // 'original' | 'alternative'
  const [choiceSummary, setChoiceSummary] = useState(null);
  const [isLoggingChoice, setIsLoggingChoice] = useState(false);
  const queryClient = useQueryClient();

  const n = result.estimated_nutrition || {};
  const confidenceColors = { high: 'badge-green', medium: 'badge-amber', low: 'badge-red' };
  const altFood = result.alternative_food;
  const isCalorieHeavy = result.is_calorie_heavy || (n.energy_kcal > 500);

  const calorieRangeText = n.energy_kcal_range || (n.energy_kcal ? `${n.energy_kcal - 50} - ${n.energy_kcal + 50} kcal` : '400 - 500 kcal');
  const proteinRangeText = n.protein_g_range || (n.protein_g ? `${n.protein_g - 2} - ${n.protein_g + 4} g` : '15 - 22 g');
  const carbsRangeText = n.carbs_g_range || (n.carbs_g ? `${n.carbs_g - 5} - ${n.carbs_g + 10} g` : '50 - 65 g');
  const fatRangeText = n.fat_g_range || (n.fat_g ? `${n.fat_g - 3} - ${n.fat_g + 5} g` : '12 - 20 g');

  const handleChoice = async (choiceType) => {
    if (isLoggingChoice) return;
    setIsLoggingChoice(true);
    setSelectedChoice(choiceType);

    const mealName = choiceType === 'original'
      ? (result.identified_items?.join(', ') || 'Original Meal')
      : (altFood?.name || 'Healthy Alternative');
    const caloriesRange = choiceType === 'original' ? calorieRangeText : (altFood?.estimated_nutrition_range?.energy_kcal_range || '250 - 350 kcal');

    try {
      const res = await logMealChoice(
        userId,
        result.meal_id,
        choiceType,
        mealName,
        caloriesRange,
        isCalorieHeavy
      );
      setChoiceSummary(res.change_summary || "Workout plan updated for your meal selection!");
      queryClient.invalidateQueries(['user-plan', userId]);
      queryClient.invalidateQueries(['meals-today', userId]);
    } catch (err) {
      console.error('Error logging meal choice:', err);
      setChoiceSummary("Meal choice recorded! Tomorrow's workout adjusted.");
    } finally {
      setIsLoggingChoice(false);
    }
  };

  return (
    <div className="card accent slide-up" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Meal Analysis</h3>
          {isCalorieHeavy && (
            <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <Flame size={13} color="#f59e0b" /> Calorie-Heavy Meal
            </span>
          )}
        </div>
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

      {/* Calories Range Highlight */}
      <div style={{ textAlign: 'center', margin: '1rem 0', padding: '1.25rem', background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '2.2rem', fontWeight: 900, color: isCalorieHeavy ? '#f59e0b' : 'var(--accent-green)', lineHeight: 1.1 }}>
          {calorieRangeText}
        </div>
        <div className="metric-label" style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Zap size={14} color="var(--accent-green)" /> Estimated Calorie Range
        </div>
      </div>

      {/* Macros in Ranges */}
      <div style={{ marginBottom: '1.25rem' }}>
        <NutritionBar label="Protein Range" valueRange={proteinRangeText} numVal={n.protein_g || 20} max={50} color="var(--accent-green)" />
        <NutritionBar label="Carbohydrates Range" valueRange={carbsRangeText} numVal={n.carbs_g || 60} max={150} color="var(--accent-blue)" />
        <NutritionBar label="Fat Range" valueRange={fatRangeText} numVal={n.fat_g || 20} max={80} color="var(--accent-amber)" />
      </div>

      {/* Verdict */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '1rem', background: 'var(--accent-green-glow)', borderRadius: 10, border: '1px solid var(--border-active)', marginBottom: '1.5rem' }}>
        <Sparkles size={18} color="var(--accent-green)" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
          {result.verdict}
        </p>
      </div>

      {/* Suggested Healthy Alternative Section (Gemini Nano Banana) */}
      {altFood && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1.25rem',
          background: 'linear-gradient(135deg, rgba(255, 225, 53, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
          borderRadius: 16,
          border: '1px solid rgba(255, 225, 53, 0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-green)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              ✨ AI Healthy Alternative
            </span>
            <span className="badge badge-green" style={{ fontSize: '0.75rem' }}>Lower Calories</span>
          </div>

          {/* Generated Image */}
          {altFood.image_url && (
            <div style={{ width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)', background: '#0a0a0f', minHeight: 180 }}>
              <img
                src={altFood.image_url}
                alt={altFood.name || 'Suggested healthy food'}
                loading="lazy"
                style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          )}

          <h4 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
            {altFood.name}
          </h4>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '0.85rem' }}>
            {altFood.description}
          </p>

          {altFood.estimated_nutrition_range && (
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: 10 }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--accent-green)', fontWeight: 700 }}>
                ⚡ {altFood.estimated_nutrition_range.energy_kcal_range || '250 - 350 kcal'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                💪 Protein: {altFood.estimated_nutrition_range.protein_g_range || '25 - 30 g'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Selection: "Did you eat this meal or the alternative?" */}
      <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', textAlign: 'center', color: 'var(--text-primary)' }}>
          Did you eat this meal or switch to the alternative?
        </h4>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1rem' }}>
          Select below — we will automatically adjust tomorrow's workout session via API call!
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${selectedChoice === 'original' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              flex: 1,
              minWidth: 160,
              padding: '0.85rem 1rem',
              borderColor: selectedChoice === 'original' ? '#f59e0b' : 'var(--border)',
              background: selectedChoice === 'original' ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-elevated)',
              color: selectedChoice === 'original' ? '#ffe135' : 'var(--text-primary)'
            }}
            disabled={isLoggingChoice}
            onClick={() => handleChoice('original')}
          >
            {isLoggingChoice && selectedChoice === 'original' ? (
              <LoadingSpinner size={16} />
            ) : (
              <>🍔 Ate Original Meal ({calorieRangeText})</>
            )}
          </button>

          {altFood && (
            <button
              className={`btn ${selectedChoice === 'alternative' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                flex: 1,
                minWidth: 160,
                padding: '0.85rem 1rem',
                borderColor: selectedChoice === 'alternative' ? 'var(--accent-green)' : 'var(--border)',
                background: selectedChoice === 'alternative' ? 'var(--accent-green-glow)' : 'var(--bg-elevated)',
                color: selectedChoice === 'alternative' ? 'var(--accent-green)' : 'var(--text-primary)'
              }}
              disabled={isLoggingChoice}
              onClick={() => handleChoice('alternative')}
            >
              {isLoggingChoice && selectedChoice === 'alternative' ? (
                <LoadingSpinner size={16} />
              ) : (
                <>🥗 Ate Healthy Alternative ({altFood.estimated_nutrition_range?.energy_kcal_range || 'Low Cal'})</>
              )}
            </button>
          )}
        </div>

        {/* Feedback Banner displaying how next day's workout session was adjusted */}
        {choiceSummary && (
          <div className="slide-up" style={{
            marginTop: '1.25rem',
            padding: '1rem 1.25rem',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid var(--accent-green)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}>
            <Dumbbell size={24} color="var(--accent-green)" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-green)', marginBottom: 2 }}>
                Tomorrow's Workout Session Adjusted!
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {choiceSummary}
              </div>
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1.25rem', display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'center' }}>
        <Info size={12} /> Estimates only — not medical nutrition advice.
      </p>
    </div>
  );
}


export default function FoodScanner({ userId }) {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // environment | user
  const [analysisResult, setAnalysisResult] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
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

  // Stop camera stream tracks
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Start live camera
  const startCamera = useCallback(async (mode = facingMode) => {
    stopCameraStream();
    setCameraError(null);
    setCameraLoading(true);
    setCameraOpen(true);

    try {
      const constraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraLoading(false);
    } catch (err) {
      console.error('Camera open error:', err);
      setCameraLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Please allow camera access or choose a file.');
      } else {
        setCameraError(`Camera error: ${err.message || 'Unable to access camera'}`);
      }
    }
  }, [facingMode, stopCameraStream]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Capture frame from video
  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    // If front camera, mirror image
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `meal-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setImageFile(file);
      setImagePreview(URL.createObjectURL(blob));
      setAnalysisResult(null);
      stopCameraStream();
      setCameraOpen(false);
    }, 'image/jpeg', 0.92);
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraError(null);
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setAnalysisResult(null);
    closeCamera();
  };

  return (
    <div className="page">
      <div className="app-container" style={{ maxWidth: 1180, padding: '0 1rem' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0, 230, 118, 0.1)', color: 'var(--accent-green)', padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              <Sparkles size={13} /> Multimodal Food Vision
            </div>
            <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900 }}>Eat This?</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: '0.95rem' }}>
              Scan your meal for instant calorie breakdown and adaptive workout calibration.
            </p>
          </div>
          {todaysMeals.length > 0 && (
            <div className="card" style={{ padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.4rem' }}>🥗</span>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Logged Today</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-green)' }}>{todaysMeals.length} Meals</div>
              </div>
            </div>
          )}
        </div>

        {/* Full-Page 2-Column Responsive Section Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1.75rem',
          alignItems: 'start',
        }}>
          {/* LEFT SECTION: Visual Capture & Scanner Hub */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Camera & Photo Scanner
                </span>
                {imagePreview && (
                  <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>Image Ready</span>
                )}
              </div>

              {/* Viewfinder / Dropzone Box */}
              <div
                id="food-upload-zone"
                style={{
                  border: `2px dashed ${imagePreview || cameraOpen ? 'var(--border-active)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  minHeight: 300,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  background: '#0a0a0f',
                  transition: 'border-color 0.2s',
                }}
              >
                {cameraOpen ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                    {cameraLoading && (
                      <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,15,0.85)', gap: '1rem' }}>
                        <LoadingSpinner size={36} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Starting camera…</p>
                      </div>
                    )}

                    {cameraError ? (
                      <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <AlertCircle size={36} color="var(--accent-red)" style={{ margin: '0 auto 0.75rem' }} />
                        <p style={{ color: 'var(--accent-red)', fontSize: '0.9rem', marginBottom: '1rem' }}>{cameraError}</p>
                        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                          <Upload size={14} /> Upload from device instead
                        </button>
                      </div>
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          style={{
                            width: '100%',
                            height: '100%',
                            minHeight: 320,
                            objectFit: 'cover',
                            transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                          }}
                        />

                        {/* Viewfinder Reticle Overlay */}
                        <div style={{
                          position: 'absolute',
                          inset: '12%',
                          border: '2px solid rgba(0, 230, 118, 0.4)',
                          borderRadius: 16,
                          pointerEvents: 'none',
                          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.3)',
                        }} />

                        {/* In-Camera Control Toolbar */}
                        <div style={{
                          position: 'absolute',
                          bottom: '1rem',
                          left: 0,
                          right: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '1.25rem',
                          zIndex: 10,
                        }}>
                          <button
                            className="btn btn-secondary"
                            style={{ borderRadius: '50%', width: 44, height: 44, padding: 0 }}
                            onClick={closeCamera}
                            title="Cancel"
                          >
                            <X size={20} />
                          </button>

                          <button
                            id="btn-snap-photo"
                            className="btn btn-primary"
                            style={{
                              borderRadius: '50%',
                              width: 62,
                              height: 62,
                              padding: 0,
                              boxShadow: '0 0 24px rgba(0,230,118,0.6)',
                            }}
                            onClick={capturePhoto}
                            title="Take Photo"
                          >
                            <Camera size={28} color="#0a0a0f" />
                          </button>

                          <button
                            className="btn btn-secondary"
                            style={{ borderRadius: '50%', width: 44, height: 44, padding: 0 }}
                            onClick={toggleFacingMode}
                            title="Switch Camera"
                          >
                            <RefreshCw size={18} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : imagePreview ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <img
                      src={imagePreview}
                      alt="Meal preview"
                      style={{ width: '100%', maxHeight: 380, objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                ) : (
                  <div
                    style={{ padding: '3rem 1.5rem', textAlign: 'center', cursor: 'pointer', width: '100%' }}
                    onClick={() => startCamera()}
                  >
                    <div style={{
                      width: 68, height: 68, borderRadius: '50%',
                      background: 'var(--bg-elevated)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem',
                      border: '1px solid var(--border)'
                    }}>
                      <Camera size={34} color="var(--accent-green)" />
                    </div>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>
                      Take Live Photo or Upload
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: 6 }}>
                      Point at your plate or drag & drop an image
                    </p>
                  </div>
                )}

                <input
                  id="food-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>

              {/* Action Buttons Toolbar */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                {!cameraOpen && (
                  <button
                    id="btn-open-camera"
                    className="btn btn-secondary"
                    style={{ flex: 1, minWidth: 130 }}
                    onClick={() => startCamera()}
                  >
                    <Camera size={16} color="var(--accent-green)" />
                    {imagePreview ? 'Retake' : 'Open Camera'}
                  </button>
                )}

                <button
                  id="btn-upload-file"
                  className="btn btn-secondary"
                  style={{ flex: 1, minWidth: 130 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} />
                  Upload Photo
                </button>

                <button
                  id="btn-analyze-meal"
                  className="btn btn-primary"
                  style={{ flex: 2, minWidth: 180 }}
                  onClick={() => analyzeMutation.mutate()}
                  disabled={!imageFile || analyzeMutation.isPending || cameraOpen}
                >
                  {analyzeMutation.isPending ? (
                    <><LoadingSpinner size={18} color="#0a0a0f" /> Analysing with Gemini…</>
                  ) : (
                    <><Zap size={18} /> Analyze with Gemini</>
                  )}
                </button>
              </div>

              {analyzeMutation.isError && (
                <p style={{ color: 'var(--accent-red)', fontSize: '0.88rem', marginTop: '0.75rem', textAlign: 'center' }}>
                  Analysis failed — please try a clearer photo.
                </p>
              )}
            </div>

            {/* Today's Logged Meals History */}
            {todaysMeals.length > 0 && (
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>Today's Meal Diary</h3>
                  <span className="badge badge-blue">{todaysMeals.length} logged</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 280, overflowY: 'auto' }}>
                  {todaysMeals.map((meal, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '1.3rem' }}>🍽</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                          {meal.identified_items?.join(', ') || 'Meal'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {meal.estimated_nutrition?.energy_kcal ? `${meal.estimated_nutrition.energy_kcal} kcal` : 'Scanned meal'} · {meal.estimated_nutrition?.protein_g ? `${meal.estimated_nutrition.protein_g}g protein` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SECTION: AI Multimodal Intelligence & Alternatives */}
          <div>
            {analyzeMutation.isPending ? (
              <div className="card accent" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                <LoadingSpinner size={44} />
                <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Gemini Multimodal Analyzing…</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: 360, margin: '0 auto' }}>
                  Identifying ingredients, calculating calorie ranges, and formatting your alternative dish recommendations.
                </p>
              </div>
            ) : analysisResult ? (
              <NutritionResultCard result={analysisResult} userId={userId} />
            ) : (
              /* Empty state guide */
              <div className="card" style={{ padding: '2.5rem 2rem', textAlign: 'center', border: '1px dashed var(--border)' }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(0, 230, 118, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                  <Zap size={28} color="var(--accent-green)" />
                </div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', fontWeight: 800 }}>Ready for Instant Analysis</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 1.5rem' }}>
                  Snap or upload any plate of food. Gemini will break down its ingredients, estimate calories in realistic ranges, and suggest delicious calorie-smart alternatives that calibrate your workout.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', textAlign: 'left' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: 10 }}>
                    <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>📊</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Macro Ranges</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Min-max estimates</div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: 10 }}>
                    <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>🥑</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Healthy Swaps</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>AI alternative food</div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: 10 }}>
                    <div style={{ fontSize: '1.1rem', marginBottom: 4 }}>⚡</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Adaptive Plan</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Calorie burn burn-off</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


