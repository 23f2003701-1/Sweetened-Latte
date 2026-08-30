You are an expert Senior Computer Vision Engineer, Biomechanics Specialist, and Full-Stack AI Architect.

Your objective is to implement "ZiddiCoach Multi-Movement Engine," a hybrid real-time workout tracking system combining client-side MediaPipe Pose (33 3D landmarks at 30 FPS) with server-side Google Gemini 2.5 Flash (`google-genai` SDK) for qualitative biomechanics audits.

---

### 1. CORE MATHEMATICAL FOUNDATION
Calculate the interior 3D joint angle $\theta$ for any three landmark vectors $A$, $B$ (vertex), and $C$:
$$\theta = \arccos\left(\frac{\vec{BA} \cdot \vec{BC}}{\Vert{}\vec{BA}\Vert{} \Vert{}\vec{BC}\Vert{}}\right) \times \left(\frac{180^\circ}{\pi}\right)$$
Apply Exponential Moving Average (EMA) smoothing ($\alpha = 0.65$) across coordinate streams. Ignore calculations when landmark visibility drops below 0.5.

---

### 2. EXERCISE REGISTRY & KINEMATIC RULES

Implement an `ExerciseRegistry` map covering these four distinct movement patterns:

#### A. Squat (Dynamic Rep-Based)
- Primary Joint: Hip (23/24) -> Knee (25/26) -> Ankle (27/28).
- Finite State Machine (FSM):
  * `START`: Knee angle > 165°.
  * `ECCENTRIC`: Knee transitioning down.
  * `BOTTOM`: Knee angle <= 90° (parallel depth).
  * `CONCENTRIC`: Knee transitioning up.
  * `REP_COMPLETE`: Return to > 160°.
- Real-Time Faults:
  * Valgus Knee Collapse: Check if knee $x$-distance is significantly narrower than ankle $x$-distance during bottom phase.
  * Excessive Forward Lean: Torso inclination angle (Shoulder -> Hip relative to vertical) exceeding threshold.

#### B. Push-Up (Dynamic Rep-Based)
- Primary Joint: Shoulder (11/12) -> Elbow (13/14) -> Wrist (15/16).
- FSM:
  * `TOP`: Elbow angle >= 160°.
  * `ECCENTRIC`: Lowering phase.
  * `BOTTOM`: Elbow angle <= 90°.
  * `CONCENTRIC`: Pressing upward.
  * `REP_COMPLETE`: Full lockout at >= 160°.
- Real-Time Faults:
  * Core Sagging / Pike: Deviation of Shoulder -> Hip -> Ankle straight line (> 15°).
  * Incomplete Lockout: Failing to return to >= 160° at the top.

#### C. Bicep Curl (Dynamic Rep-Based)
- Primary Joint: Shoulder (11/12) -> Elbow (13/14) -> Wrist (15/16).
- FSM:
  * `BOTTOM`: Elbow angle >= 155° (full extension).
  * `CONCENTRIC`: Flexing upward.
  * `TOP`: Elbow angle <= 40° (peak contraction).
  * `ECCENTRIC`: Lowering under control.
  * `REP_COMPLETE`: Reset to >= 155°.
- Real-Time Faults:
  * Elbow Drift / Sway: Horizontal displacement ($x$-axis) of the elbow landmark relative to the shoulder anchor.
  * Body Swing / Momentum: Hip horizontal displacement indicating torso swing.

#### D. Plank (Static Isometric Hold)
- Primary Tracking: Continuous alignment across Shoulder (11/12) -> Hip (23/24) -> Ankle (27/28).
- State Logic:
  * `HOLD_ACTIVE`: Spine straight-line angle remains within 165°–180°. Increment active hold timer (seconds).
  * `HOLD_PAUSED`: Posture broken or joints leave frame.
- Real-Time Faults:
  * Hip Sagging: Hip angle drops below 160° (hyperextension risk).
  * Hip Piking: Hip angle rises above 195° (loss of core engagement).
  * Neck Hyperextension: Ear -> Shoulder line misaligned with spine.

---

### 3. LIVE HUD & AUDIO FEEDBACK LOOP
- Dynamic Skeleton: Green (`#00FF88`) for compliant alignment; Yellow (`#FFD600`) for transitional depth; Red (`#FF3366`) with pulsating joint rings on active fault detection.
- Live Metrics:
  * Rep counter for Squat / Push-Up / Curl; live duration stopwatch (`00:45s`) for Plank.
  * Joint angle arc gauges rendered directly over active vertices.
  * High-contrast warning banner (e.g., `"⚠️ LIFT HIPS UP"`, `"⚠️ PIN ELBOWS TO SIDES"`).
- Web Speech API: Immediate spoken rep count integers, second markers (Plank: 10s, 20s, 30s), and debounced voice cues (> 500ms persist threshold).

---

### 4. GEMINI MULTIMODAL AUDIT INTEGRATION (`POST /api/audit-set`)
When a set ends or plank fails, capture the keyframe image of the compromised position and send it alongside telemetry to Gemini 2.5 Flash:

```python
# System prompt to Gemini:
"""
You are an elite strength coach. Analyze this workout set keyframe and telemetry.
- Exercise: {exercise}
- Total Reps / Hold Time: {metrics}
- Detected Fault Telemetry: {fault_dict}

Evaluate kinematic depth, spine alignment, and fatigue breakdown. 
Output strictly in JSON matching the schema below.
"""
Strict JSON Output Schema:

JSON
{
  "form_score": 88,
  "primary_fault": "string",
  "spoken_feedback": "Concise 12-word coaching cue for audio playback",
  "biomechanical_breakdown": [
    "Joint angle evaluation point 1",
    "Spine / posture evaluation point 2"
  ],
  "next_set_adjustment": "Specific cue or load change"
}
5. CODE DELIVERABLES REQUIRED
Produce modular TypeScript and Python code:

types.ts: Interface definitions for landmarks, FSM states, DynamicExerciseConfig, and StaticHoldConfig.

math.ts: Vector geometry, dot product angle calculations, and EMA smoothing.

registry.ts: Complete rule set for squat, pushup, bicep_curl, and plank.

trackerEngine.ts: Core class processing frames, managing dynamic rep FSM vs. static hold timer, tracking faults, and capturing snapshot keyframes.

hudRenderer.ts: Canvas 2D overlay rendering skeleton, angles, stopwatch/rep counter, and dynamic warning banners.

main.py: FastAPI server implementing the google-genai SDK for /api/audit-set.