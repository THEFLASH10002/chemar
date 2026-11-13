"""Webcam image preprocessing (OpenCV) + chemical structure recognition adapter (MolScribe)."""
from __future__ import annotations

import base64
import os
import threading
import time
from pathlib import Path

import cv2
import numpy as np

CKPT = Path(os.environ.get("CHEMAR_MOLSCRIBE_CKPT", Path.home() / "chemar-models" / "swin_base_char_aux_1m.pth"))
LOW_CONFIDENCE = 0.5


def decode_image(data: bytes) -> np.ndarray:
    if isinstance(data, str):
        data = data.split(",", 1)[-1]
        data = base64.b64decode(data)
    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode the captured image.")
    return img


def preprocess(img: np.ndarray, out_size: int = 512) -> tuple[np.ndarray, dict]:
    """Normalise lighting, denoise, binarise, crop to the ink and pad to a white square."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    # flatten uneven lighting: divide by a heavily blurred background estimate
    k = max(31, (min(h, w) // 8) | 1)
    bg = cv2.medianBlur(cv2.resize(gray, (w // 4 or 1, h // 4 or 1)), (k // 4) | 1)
    bg = cv2.resize(bg, (w, h))
    norm = cv2.divide(gray, bg, scale=255)
    norm = cv2.fastNlMeansDenoising(norm, None, h=12, templateWindowSize=7, searchWindowSize=21)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    norm = clahe.apply(norm)
    _, binary = cv2.threshold(norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    ink = 255 - binary
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # drop specks: keep connected components with reasonable area, away from frame edges
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    keep = np.zeros_like(ink)
    min_area = max(30, (h * w) // 20000)
    margin = 4
    for i in range(1, n):
        x, y, cw, ch, area = stats[i]
        touches_edge = x <= margin or y <= margin or x + cw >= w - margin or y + ch >= h - margin
        if area >= min_area and not (touches_edge and (cw > w * 0.5 or ch > h * 0.5)):
            keep[labels == i] = 255
    meta = {"original_size": [w, h], "ink_pixels": int((keep > 0).sum())}
    ys, xs = np.nonzero(keep)
    if len(xs) < 50:
        meta["empty"] = True
        clean = 255 - keep
        return cv2.resize(clean, (out_size, out_size)), meta
    out, box = _square_crop(keep, out_size)
    meta.update({"crop_box": box, "empty": False})
    meta["_ink"] = keep
    return out, meta


def _square_crop(ink: np.ndarray, out_size: int = 512):
    ys, xs = np.nonzero(ink)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    crop = 255 - ink[y0:y1 + 1, x0:x1 + 1]
    ch, cw = crop.shape
    side = int(max(ch, cw) * 1.15) + 20
    canvas = np.full((side, side), 255, np.uint8)
    oy, ox = (side - ch) // 2, (side - cw) // 2
    canvas[oy:oy + ch, ox:ox + cw] = crop
    out = cv2.resize(canvas, (out_size, out_size), interpolation=cv2.INTER_AREA)
    return out, [int(x0), int(y0), int(x1), int(y1)]


def variants(ink: np.ndarray, out_size: int = 512) -> list[tuple[str, np.ndarray]]:
    """Alternative crops of the same capture: the main drawing alone, the main drawing plus
    nearby labels (e.g. 'OH'), and all ink. Stray marks near the paper edge or fingers often
    confuse the recognizer, so we try the cleaner crops first."""
    h, w = ink.shape
    k = max(9, min(h, w) // 30)
    grouped = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    n, labels, stats, cents = cv2.connectedComponentsWithStats(grouped, 8)
    if n <= 2:
        return []
    cx, cy, diag = w / 2, h / 2, float(np.hypot(w, h))
    best, best_score = None, -1.0
    for i in range(1, n):
        mask = labels == i
        pixels = int((ink[mask] > 0).sum())
        dist = float(np.hypot(cents[i][0] - cx, cents[i][1] - cy)) / diag
        score = pixels * (1.0 - 0.8 * dist)
        if score > best_score:
            best, best_score = i, score
    out = []
    main = np.where(labels == best, ink, 0).astype(np.uint8)
    if main.sum() > 0:
        out.append(("main drawing", _square_crop(main, out_size)[0]))
    x, y, bw, bh, _ = stats[best]
    mx, my = int(bw * 0.35), int(bh * 0.35)
    near = np.zeros_like(ink)
    for i in range(1, n):
        sx, sy, sw, sh, _ = stats[i]
        if sx >= x - mx and sy >= y - my and sx + sw <= x + bw + mx and sy + sh <= y + bh + my:
            near[labels == i] = 255
    near = cv2.bitwise_and(ink, near)
    if near.sum() > main.sum():
        out.append(("drawing + labels", _square_crop(near, out_size)[0]))
    return out


def to_data_url(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()


class Recognizer:
    def __init__(self):
        self._model = None
        self._lock = threading.Lock()
        self._error: str | None = None
        self.device = "cpu"

    def status(self) -> dict:
        if self._model is not None:
            return {"available": True, "method": "MolScribe (pretrained, swin_base_char_aux_1m)", "device": self.device}
        if self._error:
            return {"available": False, "method": None, "reason": self._error}
        try:
            import molscribe  # noqa: F401
        except Exception as e:  # pragma: no cover - depends on env
            return {"available": False, "method": None, "reason": f"MolScribe not installed ({type(e).__name__})."}
        if not CKPT.exists():
            return {"available": False, "method": None, "reason": f"MolScribe checkpoint missing at {CKPT}."}
        return {"available": True, "method": "MolScribe (pretrained, loads on first scan)", "device": None}

    def load(self):
        with self._lock:
            if self._model is not None or self._error:
                return self._model
            try:
                import torch
                from molscribe import MolScribe

                if not CKPT.exists():
                    raise FileNotFoundError(f"checkpoint missing at {CKPT}")
                dev = "cuda" if torch.cuda.is_available() else "cpu"
                try:
                    self._model = MolScribe(str(CKPT), device=torch.device(dev))
                except Exception:
                    dev = "cpu"
                    self._model = MolScribe(str(CKPT), device=torch.device("cpu"))
                self.device = dev
            except Exception as e:
                self._error = f"MolScribe unavailable: {type(e).__name__}: {e}"
            return self._model

    def predict(self, gray: np.ndarray) -> dict:
        model = self.load()
        if model is None:
            raise RuntimeError(self._error or "MolScribe unavailable")
        rgb = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        t = time.time()
        out = model.predict_image(rgb, return_confidence=True)
        out["seconds"] = round(time.time() - t, 2)
        return out


recognizer = Recognizer()
