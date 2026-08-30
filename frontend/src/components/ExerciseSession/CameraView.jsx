import { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, CameraOff, AlertCircle } from 'lucide-react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LoadingSpinner } from '../shared/SharedComponents';

// ── MediaPipe landmark indices ────────────────────────────────────────────────
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,     RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,     RIGHT_WRIST: 16,
  LEFT_HIP: 23,       RIGHT_HIP: 24,
  LEFT_KNEE: 25,      RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,     RIGHT_ANKLE: 28,
};

// ── Math helpers ──────────────────────────────────────────────────────────────
function angleAt(a, b, c) {
  if (!a || !b || !c) return 180;
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  return Math.acos(Math.min(1, Math.max(-1, dot / (mag + 1e-6)))) * (180 / Math.PI);
}

function avg(...vals) { return vals.reduce((a, b) => a + b, 0) / vals.length; }

const VISIBILITY_THRESHOLD = 0.1;
function vis(lms, ...idxs) {
  return idxs.every((i) => lms[i] && (lms[i].visibility === undefined || lms[i].visibility > VISIBILITY_THRESHOLD));
}

function midpoint(a, b) {
  if (!a || !b) return { x: 0, y: 0, z: 0 };
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
}

// ── Angle Smoother (EMA) ──────────────────────────────────────────────────────
class AngleSmoother {
  constructor(alpha = 0.3) {
    this.alpha = alpha;
    this.value = null;
  }
  update(raw) {
    if (this.value === null) {
      this.value = raw;
    } else {
      this.value = this.alpha * raw + (1 - this.alpha) * this.value;
    }
    return this.value;
  }
  get() { return this.value ?? 0; }
  reset() { this.value = null; }
}

// ── Phases ────────────────────────────────────────────────────────────────────
const PHASES = {
  STANDING: 'STANDING',
  DESCENDING: 'DESCENDING',
  BOTTOM: 'BOTTOM',
  ASCENDING: 'ASCENDING',
  CORRECTING: 'CORRECTING',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SQUAT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
class SquatEngine {
  constructor() {
    this.phase = PHASES.STANDING;
    this.repCount = 0;
    this.reps = [];

    // Smoothers
    this.leftKneeSmoother = new AngleSmoother(0.35);
    this.rightKneeSmoother = new AngleSmoother(0.35);
    this.leftHipSmoother = new AngleSmoother(0.35);
    this.rightHipSmoother = new AngleSmoother(0.35);

    // Per-rep tracking
    this.repStartTime = 0;
    this.repMinKneeAngle = 180;
    this.repMinDepth = 0;
    this.repAlignmentSamples = [];

    // Calibration
    this.standingKneeAngle = null;

    // Correction tracking (internal only, no red UI)
    this.badAlignmentFrames = 0;
    this.correctionIssue = '';

    // Frame feedback
    this.frameFeedback = [];

    // Thresholds
    this.STANDING_ANGLE = 150;
    this.DESCENDING_ANGLE = 140;
    this.BOTTOM_ANGLE = 110;
    this.ASCENDING_ANGLE = 120;
    this.RETURN_STANDING_ANGLE = 140;
  }

  process(lms) {
    this.frameFeedback = [];

    if (!vis(lms, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_SHOULDER)) {
      return this._state();
    }

    const leftHip = lms[LM.LEFT_HIP];
    const rightHip = lms[LM.RIGHT_HIP];
    const leftKnee = lms[LM.LEFT_KNEE];
    const rightKnee = lms[LM.RIGHT_KNEE];
    const leftAnkle = lms[LM.LEFT_ANKLE];
    const rightAnkle = lms[LM.RIGHT_ANKLE];
    const leftShoulder = lms[LM.LEFT_SHOULDER];
    const rightShoulder = lms[LM.RIGHT_SHOULDER];

    // Smoothed angles
    const rawLeftKnee = angleAt(leftHip, leftKnee, leftAnkle);
    const rawRightKnee = angleAt(rightHip, rightKnee, rightAnkle);
    const rawLeftHip = angleAt(leftShoulder, leftHip, leftKnee);
    const rawRightHip = angleAt(rightShoulder, rightHip, rightKnee);

    const leftKneeAngle = this.leftKneeSmoother.update(rawLeftKnee);
    const rightKneeAngle = this.rightKneeSmoother.update(rawRightKnee);
    const leftHipAngle = this.leftHipSmoother.update(rawLeftHip);
    const rightHipAngle = this.rightHipSmoother.update(rawRightHip);

    const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const hipAngle = (leftHipAngle + rightHipAngle) / 2;

    // Calibrate on first standing frame or fallback if they start descending
    if (this.standingKneeAngle === null) {
      if (kneeAngle > this.STANDING_ANGLE) {
        this.standingKneeAngle = kneeAngle;
      } else if (kneeAngle < this.DESCENDING_ANGLE) {
        this.standingKneeAngle = 170; // fallback
      }
    }

    // Depth (normalised 0 = standing, 1 = deep)
    const standRef = this.standingKneeAngle ?? 170;
    const bottomRef = 70;
    const depth = Math.max(0, Math.min(1, (standRef - kneeAngle) / (standRef - bottomRef)));

    // Alignment (knee over ankle)
    const kneeMid = midpoint(leftKnee, rightKnee);
    const ankleMid = midpoint(leftAnkle, rightAnkle);
    const kneeOffset = Math.abs(kneeMid.x - ankleMid.x);
    const alignment = Math.max(0, Math.min(1, 1 - kneeOffset * 10));

    // Back angle for tick feedback
    const backAngle = angleAt(leftShoulder, leftHip, { x: leftHip?.x || 0, y: (leftHip?.y || 0) - 1 });

    // Internal correction tracking (no red UI)
    if (this.phase !== PHASES.STANDING && this.phase !== PHASES.CORRECTING) {
      if (alignment < 0.60) {
        this.badAlignmentFrames++;
        if (this.badAlignmentFrames > 10) {
          this.phase = PHASES.CORRECTING;
          this.correctionIssue = 'Your knees are caving inward. Stand up and reset.';
        }
      } else {
        this.badAlignmentFrames = 0;
      }
    }

    // State machine
    const prevPhase = this.phase;

    switch (this.phase) {
      case PHASES.CORRECTING:
        if (kneeAngle > this.STANDING_ANGLE && alignment > 0.85) {
          this.phase = PHASES.STANDING;
          this.correctionIssue = '';
          this.badAlignmentFrames = 0;
          this.frameFeedback.push('Good. Ready to continue.');
        }
        break;

      case PHASES.STANDING:
        if (kneeAngle < this.DESCENDING_ANGLE) {
          this.phase = PHASES.DESCENDING;
          this.repStartTime = performance.now();
          this.repMinKneeAngle = kneeAngle;
          this.repMinDepth = depth;
          this.repAlignmentSamples = [alignment];
        }
        break;

      case PHASES.DESCENDING:
        this.repMinKneeAngle = Math.min(this.repMinKneeAngle, kneeAngle);
        this.repMinDepth = Math.max(this.repMinDepth, depth);
        this.repAlignmentSamples.push(alignment);

        if (kneeAngle < this.BOTTOM_ANGLE) {
          this.phase = PHASES.BOTTOM;
        } else if (kneeAngle > this.RETURN_STANDING_ANGLE) {
          this.phase = PHASES.STANDING;
          this.frameFeedback.push('Try going deeper.');
        }
        break;

      case PHASES.BOTTOM:
        this.repMinKneeAngle = Math.min(this.repMinKneeAngle, kneeAngle);
        this.repMinDepth = Math.max(this.repMinDepth, depth);
        this.repAlignmentSamples.push(alignment);

        if (kneeAngle > this.ASCENDING_ANGLE) {
          this.phase = PHASES.ASCENDING;
        }
        break;

      case PHASES.ASCENDING:
        this.repAlignmentSamples.push(alignment);

        if (kneeAngle > this.RETURN_STANDING_ANGLE) {
          // Rep complete
          this.repCount++;
          const avgAlignment = this.repAlignmentSamples.reduce((a, b) => a + b, 0) / this.repAlignmentSamples.length;

          this.reps.push({
            rep: this.repCount,
            duration_ms: performance.now() - this.repStartTime,
            depth: this.repMinDepth,
            alignment: avgAlignment,
            min_knee_angle: this.repMinKneeAngle,
          });

          this.phase = PHASES.STANDING;
        }
        break;
    }

    // Live form feedback
    if (this.phase !== PHASES.STANDING) {
      if (depth < 0.5 && this.phase === PHASES.BOTTOM) {
        this.frameFeedback.push('Try going slightly deeper.');
      }
      if (alignment < 0.75) {
        this.frameFeedback.push('Keep your knees aligned with your feet.');
      }
    }

    if (prevPhase === PHASES.ASCENDING && this.phase === PHASES.STANDING) {
      this.frameFeedback.push('Good rep! 💪');
    }

    return this._state(kneeAngle, hipAngle, depth, alignment, backAngle);
  }

  _state(kneeAngle = 180, hipAngle = 180, depth = 0, alignment = 1, backAngle = 0) {
    return {
      phase: this.phase,
      repCount: this.repCount,
      currentKneeAngle: Math.round(kneeAngle),
      currentHipAngle: Math.round(hipAngle),
      currentDepth: depth,
      currentAlignment: alignment,
      reps: [...this.reps],
      formFeedback: [...this.frameFeedback],
      correctionIssue: this.correctionIssue || undefined,
      // Tick feedback extras
      extras: {
        kneeAngle: Math.round(kneeAngle),
        depth: Math.round(depth * 100),
        alignmentOk: alignment >= 0.75,
        backAngle,
        repState: this.phase,
      },
    };
  }

  getSetSummary() {
    if (this.reps.length === 0) return null;

    const avgDepth = this.reps.reduce((s, r) => s + r.depth, 0) / this.reps.length;
    const avgAlignment = this.reps.reduce((s, r) => s + r.alignment, 0) / this.reps.length;
    const avgDuration = this.reps.reduce((s, r) => s + r.duration_ms, 0) / this.reps.length;

    const formIssues = [];
    const lastThird = this.reps.slice(-Math.ceil(this.reps.length / 3));
    const lastThirdAlignment = lastThird.reduce((s, r) => s + r.alignment, 0) / lastThird.length;
    if (lastThirdAlignment < avgAlignment - 0.05) {
      formIssues.push('Alignment decreased during final repetitions.');
    }
    if (avgDepth < 0.6) {
      formIssues.push('Overall squat depth was shallow.');
    }

    return {
      exercise: 'Squats',
      reps: this.reps.length,
      average_depth: parseFloat(avgDepth.toFixed(2)),
      average_alignment: parseFloat(avgAlignment.toFixed(2)),
      average_rep_duration_ms: Math.round(avgDuration),
      form_issues: formIssues,
      rep_metrics: this.reps.map((r) => ({
        rep: r.rep,
        depth: parseFloat(r.depth.toFixed(2)),
        alignment: parseFloat(r.alignment.toFixed(2)),
        duration_ms: Math.round(r.duration_ms),
        min_knee_angle: Math.round(r.min_knee_angle),
      })),
    };
  }

  getLastRepData() {
    if (this.reps.length === 0) return null;
    const r = this.reps[this.reps.length - 1];
    return {
      rep_number: r.rep,
      depth_score: Math.round(r.depth * 100),
      alignment_ok: r.alignment >= 0.75,
      back_angle: 0,
      tempo_seconds: Math.round(r.duration_ms / 100) / 10,
      back_angle_max: 0,
    };
  }

  reset() {
    this.phase = PHASES.STANDING;
    this.repCount = 0;
    this.reps = [];
    this.repMinKneeAngle = 180;
    this.repMinDepth = 0;
    this.repAlignmentSamples = [];
    this.standingKneeAngle = null;
    this.badAlignmentFrames = 0;
    this.correctionIssue = '';
    this.leftKneeSmoother.reset();
    this.rightKneeSmoother.reset();
    this.leftHipSmoother.reset();
    this.rightHipSmoother.reset();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LUNGE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
class LungeEngine {
  constructor() {
    this.phase = PHASES.STANDING;
    this.repCount = 0;
    this.reps = [];

    // Smoothers
    this.leftKneeSmoother = new AngleSmoother(0.35);
    this.rightKneeSmoother = new AngleSmoother(0.35);
    this.hipSmoother = new AngleSmoother(0.35);

    // Per-rep tracking
    this.repStartTime = 0;
    this.repMinFrontKneeAngle = 180;
    this.repMinDepth = 0;
    this.repAlignmentSamples = [];

    // Calibration
    this.standingKneeAngle = null;

    // Correction tracking
    this.badAlignmentFrames = 0;
    this.correctionIssue = '';

    this.frameFeedback = [];

    // Thresholds
    this.STANDING_ANGLE = 150;
    this.DESCENDING_ANGLE = 140;
    this.BOTTOM_ANGLE = 95;
    this.ASCENDING_ANGLE = 105;
    this.RETURN_STANDING_ANGLE = 140;
  }

  process(lms) {
    this.frameFeedback = [];

    if (!vis(lms, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE)) {
      return this._state();
    }

    const leftKneeRaw = angleAt(lms[LM.LEFT_HIP], lms[LM.LEFT_KNEE], lms[LM.LEFT_ANKLE]);
    const rightKneeRaw = vis(lms, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE)
      ? angleAt(lms[LM.RIGHT_HIP], lms[LM.RIGHT_KNEE], lms[LM.RIGHT_ANKLE])
      : 180;

    const leftKneeAngle = this.leftKneeSmoother.update(leftKneeRaw);
    const rightKneeAngle = this.rightKneeSmoother.update(rightKneeRaw);

    // Front knee = the more bent one
    const frontKneeAngle = Math.min(leftKneeAngle, rightKneeAngle);

    // Calibrate standing or fallback
    if (this.standingKneeAngle === null) {
      if (frontKneeAngle > this.STANDING_ANGLE) {
        this.standingKneeAngle = frontKneeAngle;
      } else if (frontKneeAngle < this.DESCENDING_ANGLE) {
        this.standingKneeAngle = 170; // fallback
      }
    }

    // Back angle (torso lean)
    const backAngle = vis(lms, LM.LEFT_SHOULDER, LM.LEFT_HIP)
      ? angleAt(lms[LM.LEFT_SHOULDER], lms[LM.LEFT_HIP], { x: lms[LM.LEFT_HIP]?.x || 0, y: (lms[LM.LEFT_HIP]?.y || 0) - 1 })
      : 0;
    const smoothedBackAngle = this.hipSmoother.update(backAngle);

    // Depth normalised (0 = standing, 1 = deep lunge at ~90° front knee)
    const standRef = this.standingKneeAngle ?? 170;
    const bottomRef = 80;
    const depth = Math.max(0, Math.min(1, (standRef - frontKneeAngle) / (standRef - bottomRef)));

    // Knee over ankle alignment
    const kneeOverAnkle = vis(lms, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_KNEE, LM.RIGHT_ANKLE)
      ? Math.abs((lms[LM.LEFT_KNEE]?.x || 0) - (lms[LM.LEFT_ANKLE]?.x || 0)) < 0.08 ||
        Math.abs((lms[LM.RIGHT_KNEE]?.x || 0) - (lms[LM.RIGHT_ANKLE]?.x || 0)) < 0.08
      : true;
    const alignment = kneeOverAnkle ? 1.0 : 0.5;

    // Internal correction tracking
    if (this.phase !== PHASES.STANDING && this.phase !== PHASES.CORRECTING) {
      if (smoothedBackAngle > 60) {
        this.badAlignmentFrames++;
        if (this.badAlignmentFrames > 12) {
          this.phase = PHASES.CORRECTING;
          this.correctionIssue = 'You\'re leaning too far forward. Stand up tall and reset.';
        }
      } else {
        this.badAlignmentFrames = 0;
      }
    }

    // State machine
    const prevPhase = this.phase;

    switch (this.phase) {
      case PHASES.CORRECTING:
        if (frontKneeAngle > this.STANDING_ANGLE && smoothedBackAngle < 35) {
          this.phase = PHASES.STANDING;
          this.correctionIssue = '';
          this.badAlignmentFrames = 0;
          this.frameFeedback.push('Good posture. Ready to continue.');
        }
        break;

      case PHASES.STANDING:
        if (frontKneeAngle < this.DESCENDING_ANGLE) {
          this.phase = PHASES.DESCENDING;
          this.repStartTime = performance.now();
          this.repMinFrontKneeAngle = frontKneeAngle;
          this.repMinDepth = depth;
          this.repAlignmentSamples = [alignment];
        }
        break;

      case PHASES.DESCENDING:
        this.repMinFrontKneeAngle = Math.min(this.repMinFrontKneeAngle, frontKneeAngle);
        this.repMinDepth = Math.max(this.repMinDepth, depth);
        this.repAlignmentSamples.push(alignment);

        if (frontKneeAngle < this.BOTTOM_ANGLE) {
          this.phase = PHASES.BOTTOM;
        } else if (frontKneeAngle > this.RETURN_STANDING_ANGLE) {
          this.phase = PHASES.STANDING;
          this.frameFeedback.push('Try lunging deeper.');
        }
        break;

      case PHASES.BOTTOM:
        this.repMinFrontKneeAngle = Math.min(this.repMinFrontKneeAngle, frontKneeAngle);
        this.repMinDepth = Math.max(this.repMinDepth, depth);
        this.repAlignmentSamples.push(alignment);

        if (frontKneeAngle > this.ASCENDING_ANGLE) {
          this.phase = PHASES.ASCENDING;
        }
        break;

      case PHASES.ASCENDING:
        this.repAlignmentSamples.push(alignment);

        if (frontKneeAngle > this.RETURN_STANDING_ANGLE) {
          this.repCount++;
          const avgAlignment = this.repAlignmentSamples.reduce((a, b) => a + b, 0) / this.repAlignmentSamples.length;

          this.reps.push({
            rep: this.repCount,
            duration_ms: performance.now() - this.repStartTime,
            depth: this.repMinDepth,
            alignment: avgAlignment,
            min_front_knee_angle: this.repMinFrontKneeAngle,
            back_angle: smoothedBackAngle,
          });

          this.phase = PHASES.STANDING;
        }
        break;
    }

    // Live form feedback
    if (this.phase !== PHASES.STANDING) {
      if (depth < 0.5 && this.phase === PHASES.BOTTOM) {
        this.frameFeedback.push('Try lunging a little deeper.');
      }
      if (smoothedBackAngle > 35) {
        this.frameFeedback.push('Stand taller — keep your torso upright.');
      }
      if (!kneeOverAnkle) {
        this.frameFeedback.push('Front knee too far forward.');
      }
    }

    if (prevPhase === PHASES.ASCENDING && this.phase === PHASES.STANDING) {
      this.frameFeedback.push('Good lunge! 🏃');
    }

    return this._state(frontKneeAngle, smoothedBackAngle, depth, alignment);
  }

  _state(frontKneeAngle = 180, backAngle = 0, depth = 0, alignment = 1) {
    return {
      phase: this.phase,
      repCount: this.repCount,
      currentKneeAngle: Math.round(frontKneeAngle),
      currentHipAngle: 0,
      currentDepth: depth,
      currentAlignment: alignment,
      reps: [...this.reps],
      formFeedback: [...this.frameFeedback],
      correctionIssue: this.correctionIssue || undefined,
      extras: {
        frontKneeAngle: Math.round(frontKneeAngle),
        backAngle,
        kneeOverAnkle: alignment >= 0.75,
        depth: Math.round(depth * 100),
        repState: this.phase,
      },
    };
  }

  getSetSummary() {
    if (this.reps.length === 0) return null;

    const avgDepth = this.reps.reduce((s, r) => s + r.depth, 0) / this.reps.length;
    const avgAlignment = this.reps.reduce((s, r) => s + r.alignment, 0) / this.reps.length;
    const avgDuration = this.reps.reduce((s, r) => s + r.duration_ms, 0) / this.reps.length;
    const avgBackAngle = this.reps.reduce((s, r) => s + (r.back_angle || 0), 0) / this.reps.length;

    const formIssues = [];
    if (avgDepth < 0.6) formIssues.push('Overall lunge depth was shallow.');
    if (avgBackAngle > 40) formIssues.push('Torso was leaning forward too much.');
    const badAlignmentReps = this.reps.filter(r => r.alignment < 0.75).length;
    if (badAlignmentReps > this.reps.length * 0.3) formIssues.push('Front knee went past ankle on several reps.');

    return {
      exercise: 'Lunges',
      reps: this.reps.length,
      average_depth: parseFloat(avgDepth.toFixed(2)),
      average_alignment: parseFloat(avgAlignment.toFixed(2)),
      average_rep_duration_ms: Math.round(avgDuration),
      average_back_angle: parseFloat(avgBackAngle.toFixed(1)),
      form_issues: formIssues,
      rep_metrics: this.reps.map((r) => ({
        rep: r.rep,
        depth: parseFloat(r.depth.toFixed(2)),
        alignment: parseFloat(r.alignment.toFixed(2)),
        duration_ms: Math.round(r.duration_ms),
        min_front_knee_angle: Math.round(r.min_front_knee_angle),
        back_angle: parseFloat((r.back_angle || 0).toFixed(1)),
      })),
    };
  }

  getLastRepData() {
    if (this.reps.length === 0) return null;
    const r = this.reps[this.reps.length - 1];
    return {
      rep_number: r.rep,
      depth_score: Math.round(r.depth * 100),
      alignment_ok: r.alignment >= 0.75,
      back_angle: r.back_angle || 0,
      front_knee_angle: r.min_front_knee_angle,
      tempo_seconds: Math.round(r.duration_ms / 100) / 10,
      back_angle_max: r.back_angle || 0,
    };
  }

  reset() {
    this.phase = PHASES.STANDING;
    this.repCount = 0;
    this.reps = [];
    this.repMinFrontKneeAngle = 180;
    this.repMinDepth = 0;
    this.repAlignmentSamples = [];
    this.standingKneeAngle = null;
    this.badAlignmentFrames = 0;
    this.correctionIssue = '';
    this.leftKneeSmoother.reset();
    this.rightKneeSmoother.reset();
    this.hipSmoother.reset();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BICEP CURL ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
class BicepCurlEngine {
  constructor() {
    this.phase = PHASES.STANDING; // STANDING = arm extended
    this.repCount = 0;
    this.reps = [];

    // Smoothers
    this.leftElbowSmoother = new AngleSmoother(0.35);
    this.rightElbowSmoother = new AngleSmoother(0.35);
    this.backSmoother = new AngleSmoother(0.35);

    // Per-rep tracking
    this.repStartTime = 0;
    this.repMinElbowAngle = 180;
    this.repMaxCurlDepth = 0;
    this.repBackAngleSamples = [];

    // Calibration
    this.standingElbowAngle = null;

    // Correction tracking
    this.badSwingFrames = 0;
    this.correctionIssue = '';

    this.frameFeedback = [];

    // Thresholds (for elbow angle)
    this.STANDING_ANGLE = 140; // arm extended
    this.DESCENDING_ANGLE = 130; // start curling
    this.BOTTOM_ANGLE = 65;   // arm fully curled
    this.ASCENDING_ANGLE = 75;  // starting to extend
    this.RETURN_STANDING_ANGLE = 130; // arm back extended
  }

  process(lms) {
    this.frameFeedback = [];

    const useLeft = vis(lms, LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST);
    const useRight = vis(lms, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
    if (!useLeft && !useRight) return this._state();

    // Calculate elbow angles
    let elbowAngle;
    if (useLeft && useRight) {
      const leftRaw = angleAt(lms[LM.LEFT_SHOULDER], lms[LM.LEFT_ELBOW], lms[LM.LEFT_WRIST]);
      const rightRaw = angleAt(lms[LM.RIGHT_SHOULDER], lms[LM.RIGHT_ELBOW], lms[LM.RIGHT_WRIST]);
      const leftSmooth = this.leftElbowSmoother.update(leftRaw);
      const rightSmooth = this.rightElbowSmoother.update(rightRaw);
      elbowAngle = (leftSmooth + rightSmooth) / 2;
    } else if (useLeft) {
      const raw = angleAt(lms[LM.LEFT_SHOULDER], lms[LM.LEFT_ELBOW], lms[LM.LEFT_WRIST]);
      elbowAngle = this.leftElbowSmoother.update(raw);
    } else {
      const raw = angleAt(lms[LM.RIGHT_SHOULDER], lms[LM.RIGHT_ELBOW], lms[LM.RIGHT_WRIST]);
      elbowAngle = this.rightElbowSmoother.update(raw);
    }

    // Back angle (to detect swinging)
    const backAngleRaw = vis(lms, LM.LEFT_SHOULDER, LM.LEFT_HIP)
      ? angleAt(lms[LM.LEFT_SHOULDER], lms[LM.LEFT_HIP], { x: lms[LM.LEFT_HIP]?.x || 0, y: (lms[LM.LEFT_HIP]?.y || 0) - 1 })
      : 0;
    const backAngle = this.backSmoother.update(backAngleRaw);

    // Calibrate
    if (this.standingElbowAngle === null) {
      if (elbowAngle > this.STANDING_ANGLE) {
        this.standingElbowAngle = elbowAngle;
      } else if (elbowAngle < this.DESCENDING_ANGLE) {
        this.standingElbowAngle = 170; // fallback
      }
    }

    // Curl depth (0 = arm extended, 1 = fully curled)
    const standRef = this.standingElbowAngle ?? 170;
    const peakRef = 40;
    const curlDepth = Math.max(0, Math.min(1, (standRef - elbowAngle) / (standRef - peakRef)));

    // Back stability (1.0 = stable, lower = swinging)
    const backStability = Math.max(0, Math.min(1, 1 - (backAngle / 60)));

    // Internal correction for excessive swinging
    if (this.phase !== PHASES.STANDING && this.phase !== PHASES.CORRECTING) {
      if (backAngle > 50) {
        this.badSwingFrames++;
        if (this.badSwingFrames > 10) {
          this.phase = PHASES.CORRECTING;
          this.correctionIssue = 'You\'re swinging your back. Keep your back straight.';
        }
      } else {
        this.badSwingFrames = 0;
      }
    }

    // State machine (note: for curls, "descending" = curling up, angles decrease)
    const prevPhase = this.phase;

    switch (this.phase) {
      case PHASES.CORRECTING:
        if (elbowAngle > this.STANDING_ANGLE && backAngle < 25) {
          this.phase = PHASES.STANDING;
          this.correctionIssue = '';
          this.badSwingFrames = 0;
          this.frameFeedback.push('Good. Ready to continue.');
        }
        break;

      case PHASES.STANDING:
        if (elbowAngle < this.DESCENDING_ANGLE) {
          this.phase = PHASES.DESCENDING;
          this.repStartTime = performance.now();
          this.repMinElbowAngle = elbowAngle;
          this.repMaxCurlDepth = curlDepth;
          this.repBackAngleSamples = [backAngle];
        }
        break;

      case PHASES.DESCENDING:
        this.repMinElbowAngle = Math.min(this.repMinElbowAngle, elbowAngle);
        this.repMaxCurlDepth = Math.max(this.repMaxCurlDepth, curlDepth);
        this.repBackAngleSamples.push(backAngle);

        if (elbowAngle < this.BOTTOM_ANGLE) {
          this.phase = PHASES.BOTTOM;
        } else if (elbowAngle > this.RETURN_STANDING_ANGLE) {
          this.phase = PHASES.STANDING;
          this.frameFeedback.push('Curl higher for full range.');
        }
        break;

      case PHASES.BOTTOM:
        this.repMinElbowAngle = Math.min(this.repMinElbowAngle, elbowAngle);
        this.repMaxCurlDepth = Math.max(this.repMaxCurlDepth, curlDepth);
        this.repBackAngleSamples.push(backAngle);

        if (elbowAngle > this.ASCENDING_ANGLE) {
          this.phase = PHASES.ASCENDING;
        }
        break;

      case PHASES.ASCENDING:
        this.repBackAngleSamples.push(backAngle);

        if (elbowAngle > this.RETURN_STANDING_ANGLE) {
          this.repCount++;
          const avgBackAngle = this.repBackAngleSamples.reduce((a, b) => a + b, 0) / this.repBackAngleSamples.length;

          this.reps.push({
            rep: this.repCount,
            duration_ms: performance.now() - this.repStartTime,
            curl_depth: this.repMaxCurlDepth,
            min_elbow_angle: this.repMinElbowAngle,
            back_angle: avgBackAngle,
            back_stability: Math.max(0, Math.min(1, 1 - (avgBackAngle / 60))),
          });

          this.phase = PHASES.STANDING;
        }
        break;
    }

    // Live form feedback
    if (this.phase !== PHASES.STANDING) {
      if (backAngle > 30) {
        this.frameFeedback.push('Keep your back straight — no swinging.');
      }
    }

    if (prevPhase === PHASES.ASCENDING && this.phase === PHASES.STANDING) {
      this.frameFeedback.push('Good curl! 💪');
    }

    return this._state(elbowAngle, backAngle, curlDepth, backStability);
  }

  _state(elbowAngle = 180, backAngle = 0, curlDepth = 0, backStability = 1) {
    return {
      phase: this.phase,
      repCount: this.repCount,
      currentKneeAngle: Math.round(elbowAngle), // reuse field for display consistency
      currentHipAngle: 0,
      currentDepth: curlDepth,
      currentAlignment: backStability,
      reps: [...this.reps],
      formFeedback: [...this.frameFeedback],
      correctionIssue: this.correctionIssue || undefined,
      extras: {
        elbowAngle: Math.round(elbowAngle),
        backAngle,
        fullCurl: elbowAngle < 55,
        depth: Math.round(curlDepth * 100),
        repState: this.phase,
      },
    };
  }

  getSetSummary() {
    if (this.reps.length === 0) return null;

    const avgCurlDepth = this.reps.reduce((s, r) => s + r.curl_depth, 0) / this.reps.length;
    const avgBackStability = this.reps.reduce((s, r) => s + r.back_stability, 0) / this.reps.length;
    const avgDuration = this.reps.reduce((s, r) => s + r.duration_ms, 0) / this.reps.length;
    const avgBackAngle = this.reps.reduce((s, r) => s + r.back_angle, 0) / this.reps.length;

    const formIssues = [];
    if (avgCurlDepth < 0.7) formIssues.push('Curls were not reaching full range of motion.');
    if (avgBackAngle > 25) formIssues.push('Noticeable back swing during curls.');

    const lastThird = this.reps.slice(-Math.ceil(this.reps.length / 3));
    const lastThirdBackAngle = lastThird.reduce((s, r) => s + r.back_angle, 0) / lastThird.length;
    if (lastThirdBackAngle > avgBackAngle + 5) {
      formIssues.push('Back swinging increased in final reps — likely fatigue.');
    }

    return {
      exercise: 'Bicep Curls',
      reps: this.reps.length,
      average_curl_depth: parseFloat(avgCurlDepth.toFixed(2)),
      average_back_stability: parseFloat(avgBackStability.toFixed(2)),
      average_rep_duration_ms: Math.round(avgDuration),
      average_back_angle: parseFloat(avgBackAngle.toFixed(1)),
      form_issues: formIssues,
      rep_metrics: this.reps.map((r) => ({
        rep: r.rep,
        curl_depth: parseFloat(r.curl_depth.toFixed(2)),
        min_elbow_angle: Math.round(r.min_elbow_angle),
        back_angle: parseFloat(r.back_angle.toFixed(1)),
        back_stability: parseFloat(r.back_stability.toFixed(2)),
        duration_ms: Math.round(r.duration_ms),
      })),
    };
  }

  getLastRepData() {
    if (this.reps.length === 0) return null;
    const r = this.reps[this.reps.length - 1];
    return {
      rep_number: r.rep,
      depth_score: Math.round(r.curl_depth * 100),
      alignment_ok: r.back_stability >= 0.5,
      elbow_angle: r.min_elbow_angle,
      back_angle: r.back_angle,
      tempo_seconds: Math.round(r.duration_ms / 100) / 10,
      back_angle_max: r.back_angle,
    };
  }

  reset() {
    this.phase = PHASES.STANDING;
    this.repCount = 0;
    this.reps = [];
    this.repMinElbowAngle = 180;
    this.repMaxCurlDepth = 0;
    this.repBackAngleSamples = [];
    this.standingElbowAngle = null;
    this.badSwingFrames = 0;
    this.correctionIssue = '';
    this.leftElbowSmoother.reset();
    this.rightElbowSmoother.reset();
    this.backSmoother.reset();
  }
}

// ── Engine factory ────────────────────────────────────────────────────────────
function createEngine(exercise) {
  switch (exercise) {
    case 'Lunges':      return new LungeEngine();
    case 'Bicep Curls': return new BicepCurlEngine();
    case 'Squats':
    default:            return new SquatEngine();
  }
}

// ── Tick feedback from engine state ───────────────────────────────────────────
export function getTickFeedback(extras, exercise = 'Squats') {
  if (!extras) return [];

  switch (exercise) {
    case 'Squats':
      return [
        { label: 'Depth',          ok: (extras.depth ?? 0) >= 70, msg: (extras.depth ?? 0) >= 70 ? 'Good depth!' : 'Try going lower.',           class: (extras.depth ?? 0) >= 70 ? 'ok' : 'warn' },
        { label: 'Knee Alignment', ok: extras.alignmentOk,        msg: extras.alignmentOk ? 'Knees tracking well' : 'Keep knees over toes.',      class: extras.alignmentOk ? 'ok' : 'warn' },
        { label: 'Back Position',  ok: (extras.backAngle ?? 0) < 45, msg: (extras.backAngle ?? 0) < 45 ? 'Good posture' : 'Chest up a bit more.', class: (extras.backAngle ?? 0) < 45 ? 'ok' : (extras.backAngle ?? 0) > 60 ? 'bad' : 'warn' },
      ];
    case 'Lunges':
      return [
        { label: 'Depth',       ok: (extras.depth ?? 0) >= 70, msg: (extras.depth ?? 0) >= 70 ? 'Good depth!' : 'Lunge deeper.',                                class: (extras.depth ?? 0) >= 70 ? 'ok' : 'warn' },
        { label: 'Knee Pos.',   ok: extras.kneeOverAnkle,       msg: extras.kneeOverAnkle ? 'Knee over ankle' : 'Front knee too far forward.',                   class: extras.kneeOverAnkle ? 'ok' : 'warn' },
        { label: 'Torso',       ok: (extras.backAngle ?? 0) < 35, msg: (extras.backAngle ?? 0) < 35 ? 'Upright torso' : 'Stand taller.',                         class: (extras.backAngle ?? 0) < 35 ? 'ok' : 'warn' },
      ];
    case 'Bicep Curls':
      return [
        { label: 'Curl Depth',   ok: (extras.elbowAngle ?? 180) < 60,  msg: (extras.elbowAngle ?? 180) < 60 ? 'Full curl!' : 'Curl higher.',                    class: (extras.elbowAngle ?? 180) < 60 ? 'ok' : 'warn' },
        { label: 'Full Extend',  ok: (extras.elbowAngle ?? 0) > 140,   msg: (extras.elbowAngle ?? 0) > 140 ? 'Good extension' : 'Extend fully.',                class: (extras.elbowAngle ?? 0) > 140 ? 'ok' : 'warn' },
        { label: 'Back Stable',  ok: (extras.backAngle ?? 0) < 30,     msg: (extras.backAngle ?? 0) < 30 ? 'No swinging' : 'Keep back straight.',                class: (extras.backAngle ?? 0) < 30 ? 'ok' : (extras.backAngle ?? 0) > 50 ? 'bad' : 'warn' },
      ];
    default:
      return [];
  }
}

// ── Per-exercise skeleton connections ─────────────────────────────────────────
const SKELETON_CONFIGS = {
  'Squats': {
    connections: [
      [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
      [LM.LEFT_SHOULDER, LM.LEFT_HIP],   [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
      [LM.LEFT_HIP, LM.RIGHT_HIP],
      [LM.LEFT_HIP, LM.LEFT_KNEE],       [LM.RIGHT_HIP, LM.RIGHT_KNEE],
      [LM.LEFT_KNEE, LM.LEFT_ANKLE],     [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    ],
    joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
  },
  'Lunges': {
    connections: [
      [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
      [LM.LEFT_SHOULDER, LM.LEFT_HIP],  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
      [LM.LEFT_HIP,      LM.RIGHT_HIP],
      [LM.LEFT_HIP,      LM.LEFT_KNEE], [LM.RIGHT_HIP, LM.RIGHT_KNEE],
      [LM.LEFT_KNEE,     LM.LEFT_ANKLE],[LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    ],
    joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
  },
  'Bicep Curls': {
    connections: [
      [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
      [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],   [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
      [LM.LEFT_ELBOW,    LM.LEFT_WRIST],   [LM.RIGHT_ELBOW,    LM.RIGHT_WRIST],
      [LM.LEFT_SHOULDER, LM.LEFT_HIP],     [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
      [LM.LEFT_HIP,      LM.RIGHT_HIP],
    ],
    joints: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST, LM.LEFT_HIP, LM.RIGHT_HIP],
  },
};

// ── Skeleton drawing ──────────────────────────────────────────────────────────
function drawSkeleton(ctx, lms, w, h, isBottom, exercise) {
  const cfg = SKELETON_CONFIGS[exercise] || SKELETON_CONFIGS['Squats'];
  const lineColor = isBottom ? '#00e676' : 'rgba(0, 230, 118, 0.75)';

  ctx.lineWidth = 4;
  ctx.strokeStyle = lineColor;
  ctx.lineCap = 'round';

  cfg.connections.forEach(([a, b]) => {
    if (!lms[a] || !lms[b]) return;
    ctx.beginPath();
    ctx.moveTo((1 - lms[a].x) * w, lms[a].y * h);
    ctx.lineTo((1 - lms[b].x) * w, lms[b].y * h);
    ctx.stroke();
  });

  cfg.joints.forEach((i) => {
    if (!lms[i]) return;
    ctx.beginPath();
    ctx.arc((1 - lms[i].x) * w, lms[i].y * h, 6, 0, Math.PI * 2);
    ctx.fillStyle = isBottom ? '#00e676' : '#69f0ae';
    ctx.fill();
    ctx.strokeStyle = '#0a0a0f';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

// ── CameraView component ──────────────────────────────────────────────────────
export default function CameraView({ active, exercise = 'Squats', onRepComplete, onFrameMetrics, repCount, engineRef }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const exerciseRef = useRef(exercise);
  const internalEngineRef = useRef(createEngine(exercise));
  const prevRepCountRef = useRef(0);

  // Expose engine via engineRef prop
  useEffect(() => {
    if (engineRef) {
      engineRef.current = internalEngineRef.current;
    }
  }, [engineRef]);

  // Reset engine when exercise changes
  useEffect(() => {
    exerciseRef.current = exercise;
    internalEngineRef.current = createEngine(exercise);
    prevRepCountRef.current = 0;
    if (engineRef) {
      engineRef.current = internalEngineRef.current;
    }
  }, [exercise, engineRef]);

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
      canvas.width  = video.videoWidth  || 640;
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
        try {
          const results = landmarker.detectForVideo(video, performance.now());

          if (results?.landmarks?.length > 0) {
            setCanSeeUser(true);
            const lms = results.landmarks[0];
            const engine = internalEngineRef.current;
            const state = engine.process(lms);

            // Emit frame metrics (extras)
            onFrameMetrics?.(state.extras);

            // Check for new rep
            if (state.repCount > prevRepCountRef.current) {
              prevRepCountRef.current = state.repCount;
              const repData = engine.getLastRepData();
              if (repData) {
                onRepComplete?.(repData);
              }
            }

            // Draw skeleton
            drawSkeleton(ctx, lms, w, h, state.phase === PHASES.BOTTOM, exerciseRef.current);
          } else {
            setCanSeeUser(false);
          }
        } catch (e) {
          console.warn('[CameraView] Pose detect error:', e);
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(processLoop);
  }, [active, onRepComplete, onFrameMetrics]);

  // ── Initialize MediaPipe & Webcam ───────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    let isCancelled = false;

    const init = async () => {
      try {
        setCameraError(null);
        setModelLoading(true);

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        if (isCancelled) return;

        const options = {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };

        try {
          poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } });
        } catch {
          poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } });
        }

        if (isCancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });

        if (isCancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setModelLoading(false);
        // Reset engine and rep tracking when starting fresh
        internalEngineRef.current.reset();
        prevRepCountRef.current = 0;
        animFrameRef.current = requestAnimationFrame(processLoop);
      } catch (err) {
        setModelLoading(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCameraError('Camera access denied. Please allow camera permissions.');
        } else {
          setCameraError(`Camera error: ${err.message || err}`);
        }
      }
    };

    init();

    return () => {
      isCancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      if (poseLandmarkerRef.current) { poseLandmarkerRef.current.close?.(); poseLandmarkerRef.current = null; }
    };
  }, [active, processLoop]);

  if (!active) {
    return (
      <div className="camera-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: 'var(--text-muted)', minHeight: 320 }}>
        <CameraOff size={48} strokeWidth={1.2} />
        <p style={{ fontSize: '0.92rem' }}>Camera is idle. Click <strong>Start Set</strong> below to begin tracking.</p>
      </div>
    );
  }

  return (
    <div className="camera-container active" style={{ position: 'relative', minHeight: 320, background: '#000' }}>
      {modelLoading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,15,0.85)', gap: '1rem' }}>
          <LoadingSpinner size={36} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading MediaPipe Pose Tracker…</p>
        </div>
      )}

      {cameraError && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,15,0.92)', gap: '1rem', padding: '1.5rem', textAlign: 'center' }}>
          <AlertCircle size={40} color="var(--accent-red)" />
          <p style={{ color: 'var(--accent-red)', fontSize: '0.92rem', maxWidth: 400 }}>{cameraError}</p>
        </div>
      )}

      {!canSeeUser && !modelLoading && !cameraError && (
        <div style={{ position: 'absolute', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,171,64,0.92)', borderRadius: 8, padding: '0.45rem 1rem', fontSize: '0.82rem', fontWeight: 600, color: '#0a0a0f', zIndex: 5, whiteSpace: 'nowrap' }}>
          ⚠️ Step back so your full body is visible
        </div>
      )}

      <video ref={videoRef} muted playsInline autoPlay style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 'inherit' }} />
    </div>
  );
}
