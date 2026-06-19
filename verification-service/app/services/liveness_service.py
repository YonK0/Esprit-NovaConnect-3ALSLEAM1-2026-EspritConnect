"""Cheap liveness detection between captured frames.

Goal: reject the trivial attack of holding a photo up to the camera.
This is not a strong liveness check — production systems use depth,
infrared, or active challenges. For Phase 0 we look for movement
between frames:

1. eye-aspect-ratio (EAR) drop ≥ threshold → a blink happened
2. nose-vs-eye horizontal delta → head turned

Either signal across the 3 frames is sufficient. We avoid imposing a
specific order so the user can blink first or turn first.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import face_recognition
import numpy as np

from ..config import settings


@dataclass(frozen=True)
class LivenessResult:
    passed: bool
    score: float            # max absolute movement across frame pairs
    reason: str


def _eye_aspect_ratio(eye: list[tuple[int, int]]) -> float:
    # Standard EAR over 6 landmarks (face_recognition gives left/right
    # eyes as 6-point polygons). Higher = more open.
    p = np.array(eye, dtype=float)
    a = np.linalg.norm(p[1] - p[5])
    b = np.linalg.norm(p[2] - p[4])
    c = np.linalg.norm(p[0] - p[3])
    if c == 0:
        return 0.0
    return (a + b) / (2.0 * c)


def _yaw_proxy(landmarks: dict) -> float | None:
    """A rough yaw proxy: difference between nose-tip x and mid-eye x,
    normalized by inter-ocular distance. Bigger absolute value = more turn."""
    nose = landmarks.get("nose_tip")
    left_eye = landmarks.get("left_eye")
    right_eye = landmarks.get("right_eye")
    if not (nose and left_eye and right_eye):
        return None
    nose_x = np.mean([p[0] for p in nose])
    le_x = np.mean([p[0] for p in left_eye])
    re_x = np.mean([p[0] for p in right_eye])
    mid_x = (le_x + re_x) / 2.0
    iod = abs(re_x - le_x)
    if iod == 0:
        return None
    return (nose_x - mid_x) / iod


def check(frames_rgb: List[np.ndarray]) -> LivenessResult:
    """Decide whether the user blinked or turned across the captured frames."""
    if len(frames_rgb) < 2:
        return LivenessResult(False, 0.0, "Need at least 2 frames")

    ears: list[float] = []
    yaws: list[float] = []
    for frame in frames_rgb:
        lm_list = face_recognition.face_landmarks(frame)
        if not lm_list:
            continue
        lm = lm_list[0]
        if "left_eye" in lm and "right_eye" in lm:
            ears.append((_eye_aspect_ratio(lm["left_eye"]) + _eye_aspect_ratio(lm["right_eye"])) / 2.0)
        yaw = _yaw_proxy(lm)
        if yaw is not None:
            yaws.append(yaw)

    if len(ears) < 2 and len(yaws) < 2:
        return LivenessResult(False, 0.0, "Could not extract enough landmarks")

    ear_delta = (max(ears) - min(ears)) if len(ears) >= 2 else 0.0
    yaw_delta = (max(yaws) - min(yaws)) if len(yaws) >= 2 else 0.0
    # yaw_delta is unitless from the proxy above; map roughly to degrees:
    # 0.1 proxy ≈ ~10° for a frontal portrait. Calibration TBD with real data.
    yaw_delta_deg_proxy = abs(yaw_delta) * 100

    blink_ok = ear_delta >= settings().blink_ear_delta_threshold
    turn_ok = yaw_delta_deg_proxy >= settings().yaw_delta_threshold_deg

    score = max(ear_delta, yaw_delta_deg_proxy / 100)
    if blink_ok or turn_ok:
        reason = "blink detected" if blink_ok else "head turn detected"
        return LivenessResult(True, round(score, 4), reason)
    return LivenessResult(
        False,
        round(score, 4),
        "No blink or head turn detected — frames look static",
    )
