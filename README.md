# ChemAR — Draw it. Scan it. Bring chemistry to life.

An AR-style chemistry lab: draw a skeletal structure on paper, scan it with your webcam, get a validated 3D molecule floating over the live camera feed, save it, and react it with another molecule from a curated, atom-balanced reaction library.

## Launch (Windows)

Double-click `start.bat`, or run each in its own terminal:

```bash
cd backend && ~/chemar-venv/Scripts/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 in Chrome or Edge and allow camera access.

> The Python venv lives at `%USERPROFILE%\chemar-venv` (not in the project) because RDKit's DLLs fail to load from very long Windows paths.

### Fresh setup on another machine
```bash
python -m venv --system-site-packages ~/chemar-venv
~/chemar-venv/Scripts/python -m pip install fastapi "uvicorn[standard]" rdkit opencv-python-headless pillow numpy python-multipart pytest httpx
cd frontend && npm install
```
Recognition (optional, already set up on this machine). MolScribe pins ancient versions, so install it loosely:
```bash
~/chemar-venv/Scripts/python -m pip install --no-deps MolScribe timm==0.4.12 SmilesPE OpenNMT-py==2.2.0 albumentations==1.1.0 qudida
```
```bash
~/chemar-venv/Scripts/python -m pip install --only-binary=:all: scikit-image scikit-learn
```
Two local patches were needed on Windows/Python 3.14 (originals saved as `.orig`):
1. `site-packages/onmt/__init__.py` reduced to `__version__ = "2.2.0"`, so it doesn't import `torchtext`.
2. `site-packages/molscribe/chemistry.py`: `multiprocessing.Pool(16)` replaced with an in-process serial pool. Without this, every scan spawns 16 torch processes and takes minutes.

The checkpoint `swin_base_char_aux_1m.pth` (Hugging Face `yujieq/MolScribe`, 1.1 GB) goes in `%USERPROFILE%\chemar-models\`, or set `CHEMAR_MOLSCRIBE_CKPT`. The backend warms up the model in the background at startup. Without MolScribe, the app runs normally, says recognition is unavailable, and still offers manual SMILES and demo mode.

Measured on this laptop (RTX 5060, CUDA): ~0.3–1.3 s of model time per scan. On simulated hand-drawn webcam photos, benzene → `c1ccccc1` (conf 0.80) and ethanol → `CCO` (conf 0.79).

## Architecture

| Layer | What it does |
|---|---|
| `backend/chem.py` | RDKit: SMILES validation and canonicalisation, ETKDGv3 3D conformers + MMFF94 (UFF fallback), formula, MW, SMARTS functional groups, dark-mode 2D SVG, curated educational data |
| `backend/reactions.py` | 4 curated reactions; atom balance verified with RDKit at import time; order-independent matching on canonical SMILES |
| `backend/recognition.py` | OpenCV preprocessing (illumination flattening, NL-means denoise, CLAHE, Otsu binarisation, speck removal, auto-crop to ink, square pad, resize) → MolScribe adapter |
| `backend/main.py` | FastAPI: `/api/health`, `/api/samples`, `/api/molecule`, `/api/recognize`, `/api/react`, `/api/reactions` |
| `frontend/` | React + TS + Vite + Tailwind + 3Dmol.js + Framer Motion + Lucide |

Reactions supported:
1. Ethene + H₂ → ethane (Ni, ~150 °C)
2. Ethene + H₂O → ethanol (H₃PO₄, ~300 °C, 60–70 atm)
3. Ethanol + ethanoic acid ⇌ ethyl ethanoate + H₂O (conc. H₂SO₄, reflux)
4. Benzene + 3 H₂ → cyclohexane (Ni, high T/P)

Any other pair gets an explicit "No validated reaction" response. Products are never guessed.

## Tests
```bash
cd backend && ~/chemar-venv/Scripts/python -m pytest -v test_api.py
```
```bash
cd frontend && npm run build
```

## Honest limitations
- The "AR" is an AR-style overlay: the molecule floats over the live camera feed and can be rotated, zoomed, scaled and dragged. It is not anchored to the paper (no ArUco tracking).
- Recognition quality on hand-drawn webcam photos depends on MolScribe, which was trained mostly on printed/rendered structures. Results are always RDKit-validated and shown for confirmation. Confidence is the model's own score and is never invented.
- Names, applications and geometry text only come from the 9-molecule curated library. Other molecules show computed data only.
- No Claude-generated explanations: explanations are curated text. The optional Anthropic API integration was not built.
- Reaction animations are illustrative, not molecular dynamics.
