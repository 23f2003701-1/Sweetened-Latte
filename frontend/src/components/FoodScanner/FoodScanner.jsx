import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, Zap, Info, RefreshCw, X, AlertCircle } from 'lucide-react';
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
      <div className="app-container" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: 4 }}>Can I Eat This?</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Take a photo of your meal for an instant AI nutrition verdict with Gemini Multimodal.
          </p>
        </div>

        {/* Live Camera Viewfinder or Image Upload/Preview Box */}
        <div
          id="food-upload-zone"
          style={{
            border: `2px dashed ${imagePreview || cameraOpen ? 'var(--border-active)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-xl)',
            minHeight: 280,
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
            <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
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
                      objectFit: 'cover',
                      transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                    }}
                  />

                  {/* Viewfinder Reticle Overlay */}
                  <div style={{
                    position: 'absolute',
                    inset: '10%',
                    border: '2px solid rgba(0, 230, 118, 0.4)',
                    borderRadius: 16,
                    pointerEvents: 'none',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.25)',
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
                        width: 60,
                        height: 60,
                        padding: 0,
                        boxShadow: '0 0 20px rgba(0,230,118,0.5)',
                      }}
                      onClick={capturePhoto}
                      title="Take Photo"
                    >
                      <Camera size={26} color="#0a0a0f" />
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
                style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }}
              />
            </div>
          ) : (
            <div
              style={{ padding: '2.5rem 1.5rem', textAlign: 'center', cursor: 'pointer' }}
              onClick={() => startCamera()}
            >
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--bg-elevated)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem'
              }}>
                <Camera size={32} color="var(--accent-green)" />
              </div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem' }}>
                Open Camera or Upload Photo
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                Take a live photo of your meal or select an image file
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

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          {!cameraOpen && (
            <button
              id="btn-open-camera"
              className="btn btn-secondary"
              style={{ flex: 1, minWidth: 140 }}
              onClick={() => startCamera()}
            >
              <Camera size={18} color="var(--accent-green)" />
              {imagePreview ? 'Retake with Camera' : 'Take Photo'}
            </button>
          )}

          <button
            id="btn-upload-file"
            className="btn btn-secondary"
            style={{ flex: 1, minWidth: 140 }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={18} />
            Upload File
          </button>

          <button
            id="btn-analyze-meal"
            className="btn btn-primary"
            style={{ flex: 2, minWidth: 200 }}
            onClick={() => analyzeMutation.mutate()}
            disabled={!imageFile || analyzeMutation.isPending || cameraOpen}
          >
            {analyzeMutation.isPending ? (
              <><LoadingSpinner size={18} color="#0a0a0f" /> Analysing with Gemini…</>
            ) : (
              <><Zap size={18} /> Analyze Meal</>
            )}
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

