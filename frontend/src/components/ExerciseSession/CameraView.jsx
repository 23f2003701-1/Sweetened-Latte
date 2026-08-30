import { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, CameraOff, AlertCircle } from 'lucide-react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LoadingSpinner } from '../shared/SharedComponents';

// ── Landmark indices (MediaPipe Pose 33 points) ──────────────────────────────
const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
};

// ── Math helpers ──────────────────────────────────────────────────────────────
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

function depthScore(kneeAngle) {
  return kneeAngle <= 100 ? 100 : Math.max(0, Math.round(100 - (kneeAngle - 100) * 2));
}

function avg(a, b) { return (a + b) / 2; }

const VISIBILITY_THRESHOLD = 0.5;

function visible(landmarks, ...indices) {
  return indices.every((i) => landmarks[i] && (landmarks[i].visibility === undefined || landmarks[i].visibility > VISIBILITY_THRESHOLD));
}

// ── Rep state machine ─────────────────────────────────────────────────────────
const REP_STATES = { STANDING: 'STANDING', DESCENDING: 'DESCENDING', BOTTOM: 'BOTTOM', ASCENDING: 'ASCENDING' };

// ── Feedback messages ─────────────────────────────────────────────────────────
export function getTickFeedback(metrics) {
  const ticks = [];

  // Depth
  const depthOk = metrics.depth >= 70;
  ticks.push({
    label: 'Depth',
    ok: depthOk,
    msg: depthOk ? 'Good depth!' : 'Try going a little lower.',
    class: depthOk ? 'ok' : 'warn',
  });

  // Alignment
  const alignOk = metrics.alignmentOk;
  ticks.push({
    label: 'Knee Alignment',
    ok: alignOk,
    msg: alignOk ? 'Knees tracking well' : 'Keep knees aligned with feet.',
    class: alignOk ? 'ok' : 'warn',
  });

  // Back
  const backOk = metrics.backAngle < 45;
  ticks.push({
    label: 'Back Position',
    ok: backOk,
    msg: backOk ? 'Good posture' : 'Keep chest up a bit more.',
    class: backOk ? 'ok' : (metrics.backAngle > 60 ? 'bad' : 'warn'),
  });

  return ticks;
}

// ── Drawing Skeleton Overlay ───────────────────────────────────────────────────
function drawSkeleton(ctx, landmarks, w, h, isBottom) {
  const connections = [
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    [LM.LEFT_SHOULDER, LM.LEFT_HIP],
    [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.LEFT_KNEE],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE],
    [LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ];

  const lineColor = isBottom ? '#00e676' : 'rgba(0, 230, 118, 0.75)';

  ctx.lineWidth = 4;
  ctx.strokeStyle = lineColor;
  ctx.lineCap = 'round';

  connections.forEach(([a, b]) => {
    if (!landmarks[a] || !landmarks[b]) return;
    ctx.beginPath();
    // Invert X because canvas video is mirrored
    ctx.moveTo((1 - landmarks[a].x) * w, landmarks[a].y * h);
    ctx.lineTo((1 - landmarks[b].x) * w, landmarks[b].y * h);
    ctx.stroke();
  });

  // Draw joints
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE].forEach((i) => {
    if (!landmarks[i]) return;
    ctx.beginPath();
    ctx.arc((1 - landmarks[i].x) * w, landmarks[i].y * h, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#00e676';
    ctx.fill();
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

export default function CameraView({ active, onRepComplete, onFrameMetrics, repCount }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const stateRef = useRef({
    repState: REP_STATES.STANDING,
    bottomTime: 0,
    bottomDepth: 100,
    lastKneeAngle: 170,
    repStartTime: Date.now(),
  });

  const [cameraError, setCameraError] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [canSeeUser, setCanSeeUser] = useState(true);

  // ── Frame Processing Loop ───────────────────────────────────────────────────
  const processLoop = useCallback(() => {
    if (!active) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = poseLandmarkerRef.current;

    if (video && canvas && video.readyState >= 2) {
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const w = canvas.width;
      const h = canvas.height;

      // Draw mirrored camera feed
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

            // Knee angle
            const leftKnee = angleAt(lms[LM.LEFT_HIP], lms[LM.LEFT_KNEE], lms[LM.LEFT_ANKLE]);
            const rightKnee = angleAt(lms[LM.RIGHT_HIP], lms[LM.RIGHT_KNEE], lms[LM.RIGHT_ANKLE]);
            const kneeAngle = avg(leftKnee, rightKnee);

            // Back angle (vertical)
            const leftBack = angleAt(lms[LM.LEFT_SHOULDER], lms[LM.LEFT_HIP], { x: lms[LM.LEFT_HIP]?.x || 0, y: (lms[LM.LEFT_HIP]?.y || 0) - 1 });
            const rightBack = angleAt(lms[LM.RIGHT_SHOULDER], lms[LM.RIGHT_HIP], { x: lms[LM.RIGHT_HIP]?.x || 0, y: (lms[LM.RIGHT_HIP]?.y || 0) - 1 });
            const backAngle = avg(leftBack, rightBack);

            // Knee alignment (offset)
            const kneeX = avg(lms[LM.LEFT_KNEE]?.x || 0, lms[LM.RIGHT_KNEE]?.x || 0);
            const ankleX = avg(lms[LM.LEFT_ANKLE]?.x || 0, lms[LM.RIGHT_ANKLE]?.x || 0);
            const stanceWidth = Math.abs((lms[LM.LEFT_ANKLE]?.x || 0) - (lms[LM.RIGHT_ANKLE]?.x || 0)) || 0.2;
            const alignmentOk = Math.abs(kneeX - ankleX) < stanceWidth * 0.35;

            const depth = depthScore(kneeAngle);

            // Rep State Machine
            const s = stateRef.current;
            const isBottom = s.repState === REP_STATES.BOTTOM;

            if (kneeAngle > 155) {
              if (s.repState === REP_STATES.ASCENDING) {
                // Completed 1 full rep!
                const tempo = (Date.now() - s.repStartTime) / 1000;
                onRepComplete?.({
                  rep_number: repCount + 1,
                  depth_score: s.bottomDepth,
                  alignment_ok: alignmentOk,
                  back_angle_max: backAngle,
                  tempo_seconds: Math.round(tempo * 10) / 10,
                });
                s.repStartTime = Date.now();
              }
              s.repState = REP_STATES.STANDING;
            } else if (s.repState === REP_STATES.STANDING && kneeAngle < 145) {
              s.repState = REP_STATES.DESCENDING;
            } else if (s.repState === REP_STATES.DESCENDING && kneeAngle <= 105) {
              s.repState = REP_STATES.BOTTOM;
              s.bottomDepth = depth;
              s.bottomTime = Date.now();
            } else if (s.repState === REP_STATES.BOTTOM && kneeAngle > 115) {
              s.repState = REP_STATES.ASCENDING;
            }
            s.lastKneeAngle = kneeAngle;

            // Emit live metrics to overlay UI
            onFrameMetrics?.({ depth, backAngle, alignmentOk, kneeAngle, repState: s.repState });

            // Draw skeleton
            drawSkeleton(ctx, lms, w, h, isBottom);
          } else {
            setCanSeeUser(false);
          }
        } catch (e) {
          console.warn('Pose detect error:', e);
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(processLoop);
  }, [active, onRepComplete, onFrameMetrics, repCount]);

  // ── Initialize MediaPipe & Webcam ───────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    let isCancelled = false;

    const initMediaPipeAndCamera = async () => {
      try {
        setCameraError(null);
        setModelLoading(true);

        // 1. Initialize MediaPipe Tasks Vision FilesetResolver
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        if (isCancelled) return;

        // 2. Create PoseLandmarker with GPU / fallback to CPU
        try {
          poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (gpuError) {
          console.warn('GPU delegate failed, falling back to CPU:', gpuError);
          poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        }

        if (isCancelled) return;

        // 3. Request webcam stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
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
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCameraError('Camera access was denied. Please allow camera permissions in your browser.');
        } else {
          setCameraError(`Camera initialization error: ${err.message || err}`);
        }
      }
    };

    initMediaPipeAndCamera();

    return () => {
      isCancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close?.();
        poseLandmarkerRef.current = null;
      }
    };
  }, [active, processLoop]);

  if (!active) {
    return (
      <div className="camera-container" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '1rem', color: 'var(--text-muted)', minHeight: 320
      }}>
        <CameraOff size={48} strokeWidth={1.2} />
        <p style={{ fontSize: '0.92rem' }}>Camera is idle. Click <strong>Start Set</strong> below to begin tracking.</p>
      </div>
    );
  }

  return (
    <div className="camera-container active" style={{ position: 'relative', minHeight: 320, background: '#000' }}>
      {modelLoading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10,10,15,0.85)', gap: '1rem'
        }}>
          <LoadingSpinner size={36} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading MediaPipe Pose Tracker…</p>
        </div>
      )}

      {cameraError && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10,10,15,0.92)', gap: '1rem', padding: '1.5rem', textAlign: 'center'
        }}>
          <AlertCircle size={40} color="var(--accent-red)" />
          <p style={{ color: 'var(--accent-red)', fontSize: '0.92rem', maxWidth: 400 }}>{cameraError}</p>
        </div>
      )}

      {!canSeeUser && !modelLoading && !cameraError && (
        <div style={{
          position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255, 171, 64, 0.92)', borderRadius: 8, padding: '0.45rem 1rem',
          fontSize: '0.82rem', fontWeight: 600, color: '#0a0a0f', zIndex: 5, whiteSpace: 'nowrap'
        }}>
          ⚠️ Step back into frame so full body is visible
        </div>
      )}

      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{ display: 'none' }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: 'inherit' }}
      />
    </div>
  );
}
