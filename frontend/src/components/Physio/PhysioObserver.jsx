import { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, AlertCircle, ShieldAlert, CheckCircle, AlertTriangle, Square } from 'lucide-react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { auditPhysioSession } from '../../lib/api';
import { LoadingSpinner } from '../shared/SharedComponents';

// Landmark indices
const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

function angleAt(a, b, c) {
  if (!a || !b || !c) return 180;
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  const cosAngle = dot / (mag1 * mag2 + 1e-6);
  return Math.acos(Math.min(1, Math.max(-1, cosAngle))) * (180 / Math.PI);
}

function avg(a, b) { return (a + b) / 2; }

// Speech synthesis voice feedback with throttling
let lastVoiceTime = 0;
function speakFeedback(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const now = Date.now();
  if (now - lastVoiceTime < 2500) return; // 2.5s cooldown throttling
  lastVoiceTime = now;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('SpeechSynthesis error:', e);
  }
}

// Draw skeleton overlay
function drawPhysioSkeleton(ctx, lms, w, h, limitExceeded) {
  const connections = [
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
    [LM.LEFT_ELBOW, LM.LEFT_WRIST],
    [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
    [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    [LM.LEFT_SHOULDER, LM.LEFT_HIP],
    [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.LEFT_KNEE],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE],
    [LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ];

  const strokeColor = limitExceeded ? '#ef4444' : '#10b981';

  ctx.lineWidth = 4;
  ctx.strokeStyle = strokeColor;
  ctx.lineCap = 'round';

  connections.forEach(([a, b]) => {
    if (!lms[a] || !lms[b]) return;
    ctx.beginPath();
    ctx.moveTo((1 - lms[a].x) * w, lms[a].y * h);
    ctx.lineTo((1 - lms[b].x) * w, lms[b].y * h);
    ctx.stroke();
  });

  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE].forEach((i) => {
    if (!lms[i]) return;
    ctx.beginPath();
    ctx.arc((1 - lms[i].x) * w, lms[i].y * h, 6, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

export default function PhysioObserver({ exercise, onEndSession }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const maxSafeAngle = exercise?.max_safe_angle ?? 35;
  const targetReps = exercise?.target_reps || 10;
  const targetSets = exercise?.target_sets || 3;

  const [currentSet, setCurrentSet] = useState(1);
  const [currentReps, setCurrentReps] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [movementPhase, setMovementPhase] = useState('READY');
  const [guardrailStatus, setGuardrailStatus] = useState('SAFE');
  const [exceededCount, setExceededCount] = useState(0);
  const [geminiFeedback, setGeminiFeedback] = useState(null);

  const [modelLoading, setModelLoading] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  const [canSeeUser, setCanSeeUser] = useState(true);

  // Session telemetry accumulator
  const telemetryRef = useRef({
    exercise_name: exercise?.name || 'Seated Active Knee Extension',
    target_sets: targetSets,
    target_reps: targetReps,
    max_safe_angle: maxSafeAngle,
    sets_completed: 1,
    reps_completed: 0,
    reps_with_limit_exceeded: 0,
    measured_angles: [],
  });

  const stateRef = useRef({
    phase: 'READY',
    lastAngle: 0,
    peakAngle: 0,
    repStartTime: Date.now(),
  });

  // Helper to trigger periodic Gemini audit call
  const triggerAudit = useCallback(async (exceeded, currentRep, currentAngleVal) => {
    try {
      const payload = {
        exercise: {
          name: exercise?.name,
          max_safe_angle: maxSafeAngle,
        },
        telemetry: {
          set: currentSet,
          rep: currentRep,
          current_angle: Math.round(currentAngleVal),
          prescribed_max_angle: maxSafeAngle,
          rom_exceeded: exceeded,
          measured_angles: telemetryRef.current.measured_angles.slice(-10),
        }
      };
      const res = await auditPhysioSession(payload.exercise, payload.telemetry);
      if (res.voice_feedback) {
        setGeminiFeedback(res.voice_feedback);
        if (!exceeded) {
          speakFeedback(res.voice_feedback);
        }
      }
    } catch (e) {
      console.warn('Audit session call exception:', e);
    }
  }, [exercise?.name, maxSafeAngle, currentSet]);

  // Main frame processing loop
  const processLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (video && canvas && video.readyState >= 2) {
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const w = canvas.width;
      const h = canvas.height;

      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      if (landmarker && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const startTimeMs = performance.now();

        try {
          const results = landmarker.detectForVideo(video, startTimeMs);

          if (results && results.landmarks && results.landmarks.length > 0) {
            setCanSeeUser(true);
            const lms = results.landmarks[0];

            // Determine relevant joint angle based on exercise joint type
            let calculatedAngle = 0;
            const jointType = exercise?.joint || 'knee';

            if (jointType === 'shoulder') {
              const leftShoulderAngle = angleAt(lms[LM.LEFT_HIP], lms[LM.LEFT_SHOULDER], lms[LM.LEFT_ELBOW]);
              const rightShoulderAngle = angleAt(lms[LM.RIGHT_HIP], lms[LM.RIGHT_SHOULDER], lms[LM.RIGHT_ELBOW]);
              calculatedAngle = avg(leftShoulderAngle, rightShoulderAngle);
            } else {
              // Knee extension / flexion angle
              const leftKnee = angleAt(lms[LM.LEFT_HIP], lms[LM.LEFT_KNEE], lms[LM.LEFT_ANKLE]);
              const rightKnee = angleAt(lms[LM.RIGHT_HIP], lms[LM.RIGHT_KNEE], lms[LM.RIGHT_ANKLE]);
              // Convert 180 (straight) vs extension angle relative to 0
              const side = exercise?.side || 'left';
              if (side === 'left') {
                calculatedAngle = Math.max(0, 180 - leftKnee);
              } else if (side === 'right') {
                calculatedAngle = Math.max(0, 180 - rightKnee);
              } else {
                calculatedAngle = Math.max(0, 180 - avg(leftKnee, rightKnee));
              }
            }

            const roundedAngle = Math.round(calculatedAngle);
            setCurrentAngle(roundedAngle);
            telemetryRef.current.measured_angles.push(roundedAngle);

            // Guardrail Check against max_safe_angle
            const isExceeded = maxSafeAngle !== null && roundedAngle > maxSafeAngle;
            if (isExceeded) {
              setGuardrailStatus('LIMIT EXCEEDED');
              speakFeedback('Stop there and return to starting position.');
            } else {
              setGuardrailStatus('SAFE');
            }

            // Movement Rep State Machine
            const s = stateRef.current;
            if (roundedAngle > (s.peakAngle || 0)) {
              s.peakAngle = roundedAngle;
            }

            if (s.phase === 'READY' && roundedAngle > 10) {
              s.phase = 'MOVING';
              setMovementPhase('MOVING');
            } else if (s.phase === 'MOVING' && roundedAngle >= (maxSafeAngle ? maxSafeAngle - 5 : 25)) {
              s.phase = 'TARGET POSITION';
              setMovementPhase('TARGET POSITION');
            } else if ((s.phase === 'MOVING' || s.phase === 'TARGET POSITION') && roundedAngle < 8) {
              // Completed Rep!
              s.phase = 'READY';
              setMovementPhase('REP COMPLETE');

              setCurrentReps((prev) => {
                const nextRep = prev + 1;
                telemetryRef.current.reps_completed = nextRep;

                if (isExceeded) {
                  setExceededCount((c) => {
                    const nextC = c + 1;
                    telemetryRef.current.reps_with_limit_exceeded = nextC;
                    return nextC;
                  });
                }

                // Trigger Gemini Audit on rep complete
                triggerAudit(isExceeded, nextRep, roundedAngle);

                // Auto advance set if target reps hit
                if (nextRep >= targetReps) {
                  setCurrentSet((sNum) => {
                    const nextSet = sNum + 1;
                    telemetryRef.current.sets_completed = Math.min(targetSets, nextSet);
                    return nextSet;
                  });
                  return 0;
                }
                return nextRep;
              });

              s.peakAngle = 0;
            }

            // Draw Skeleton Overlay
            drawPhysioSkeleton(ctx, lms, w, h, isExceeded);
          } else {
            setCanSeeUser(false);
          }
        } catch (e) {
          console.warn('Pose detect error:', e);
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(processLoop);
  }, [exercise, maxSafeAngle, targetReps, targetSets, currentSet, triggerAudit]);

  // Init camera & MediaPipe
  useEffect(() => {
    let isCancelled = false;

    const init = async () => {
      try {
        setCameraError(null);
        setModelLoading(true);

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        if (isCancelled) return;

        try {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        } catch (ex) {
          landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        }
        if (isCancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setModelLoading(false);
        animFrameRef.current = requestAnimationFrame(processLoop);
      } catch (err) {
        console.error('Camera/MediaPipe error:', err);
        setModelLoading(false);
        setCameraError(`Unable to open camera: ${err.message || err}`);
      }
    };

    init();

    return () => {
      isCancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close?.();
      }
    };
  }, [processLoop]);

  const handleFinish = () => {
    onEndSession(telemetryRef.current);
  };

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <div className="app-container" style={{ maxWidth: 720 }}>
        {/* Real-time Telemetry Bar */}
        <div className="card" style={{
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#ffffff' }}>
              {exercise?.name || 'Seated Active Knee Extension'}
            </h3>
            <span className={`badge ${guardrailStatus === 'LIMIT EXCEEDED' ? 'badge-red' : 'badge-green'}`}>
              {guardrailStatus === 'LIMIT EXCEEDED' ? '⚠️ LIMIT EXCEEDED' : '✓ SAFE ROM'}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.75rem',
            textAlign: 'center'
          }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '0.6rem', borderRadius: 10 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Prescribed ROM</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffe135' }}>{maxSafeAngle}°</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '0.6rem', borderRadius: 10 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Current Angle</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: guardrailStatus === 'LIMIT EXCEEDED' ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {currentAngle}°
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '0.6rem', borderRadius: 10 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Set</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#818cf8' }}>{currentSet} / {targetSets}</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '0.6rem', borderRadius: 10 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Reps</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#818cf8' }}>{currentReps} / {targetReps}</div>
            </div>
          </div>
        </div>

        {/* Viewfinder Container */}
        <div style={{
          position: 'relative',
          minHeight: 380,
          background: '#000',
          borderRadius: 20,
          overflow: 'hidden',
          border: guardrailStatus === 'LIMIT EXCEEDED' ? '3px solid var(--accent-red)' : '1px solid var(--border)',
          boxShadow: guardrailStatus === 'LIMIT EXCEEDED' ? '0 0 30px rgba(239, 68, 68, 0.4)' : 'none',
          transition: 'all 0.2s'
        }}>
          {modelLoading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(10,10,15,0.88)', gap: '1rem'
            }}>
              <LoadingSpinner size={36} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Initializing MediaPipe Pose Observer…</p>
            </div>
          )}

          {cameraError && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(10,10,15,0.92)', gap: '1rem', padding: '1.5rem', textAlign: 'center'
            }}>
              <AlertCircle size={40} color="var(--accent-red)" />
              <p style={{ color: 'var(--accent-red)', fontSize: '0.92rem' }}>{cameraError}</p>
            </div>
          )}

          {!canSeeUser && !modelLoading && !cameraError && (
            <div style={{
              position: 'absolute', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(255, 171, 64, 0.95)', borderRadius: 8, padding: '0.5rem 1rem',
              fontSize: '0.82rem', fontWeight: 700, color: '#0a0a0f', zIndex: 5, whiteSpace: 'nowrap'
            }}>
              ⚠️ Step back into camera frame
            </div>
          )}

          <video ref={videoRef} muted playsInline autoPlay style={{ display: 'none' }} />
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

          {/* Movement Phase Overlay Badge */}
          <div style={{
            position: 'absolute', top: '1rem', left: '1rem',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
            borderRadius: 10, padding: '0.4rem 0.85rem', fontSize: '0.8rem', fontWeight: 700,
            color: '#fff', border: '1px solid rgba(255,255,255,0.15)'
          }}>
            Status: {guardrailStatus === 'LIMIT EXCEEDED' ? 'ROM Limit Exceeded' : 'Good Movement'}
          </div>
        </div>

        {/* Gemini Clinical Audio Feedback Banner */}
        {geminiFeedback && (
          <div className="slide-up" style={{
            marginTop: '1rem',
            padding: '0.85rem 1.1rem',
            background: 'rgba(129, 140, 248, 0.15)',
            border: '1px solid rgba(129, 140, 248, 0.4)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <ShieldAlert size={20} color="#818cf8" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.86rem', color: '#e0e7ff' }}>
              <strong>Gemini Observer:</strong> "{geminiFeedback}"
            </div>
          </div>
        )}

        {/* End Session Button */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button
            id="btn-end-physio-session"
            className="btn btn-secondary"
            style={{
              padding: '0.85rem 2rem',
              borderRadius: 14,
              borderColor: 'var(--accent-red)',
              color: 'var(--accent-red)',
              fontWeight: 700
            }}
            onClick={handleFinish}
          >
            <Square size={16} fill="var(--accent-red)" /> End Session
          </button>
        </div>
      </div>
    </div>
  );
}
