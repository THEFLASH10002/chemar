"""ChemAR FastAPI backend."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rdkit import rdBase

import chem
import reactions
import recognition

app = FastAPI(title="ChemAR API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def warm_up_recognizer():
    """Load MolScribe in the background so the first scan isn't slow."""
    import os
    import threading

    if os.environ.get("CHEMAR_NO_WARMUP") != "1" and recognition.recognizer.status()["available"]:
        threading.Thread(target=recognition.recognizer.load, daemon=True).start()


class SmilesIn(BaseModel):
    smiles: str


class ReactIn(BaseModel):
    smiles_a: str
    smiles_b: str


class ImageIn(BaseModel):
    image: str  # data URL or base64 PNG/JPEG


@app.get("/api/health")
def health():
    return {"ok": True, "rdkit": rdBase.rdkitVersion, "recognition": recognition.recognizer.status()}


@app.get("/api/samples")
def samples():
    return [{"name": n, "smiles": s, "formula": chem.formula(chem.parse(s))} for n, s in chem.SAMPLES]


@app.post("/api/molecule")
def molecule(body: SmilesIn):
    try:
        return chem.describe(body.smiles)
    except chem.ChemError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/api/reactions")
def reaction_list():
    return reactions.catalog()


@app.post("/api/react")
def react(body: ReactIn):
    try:
        a, b = chem.canonical(body.smiles_a), chem.canonical(body.smiles_b)
    except chem.ChemError as e:
        raise HTTPException(status_code=422, detail=str(e))
    rxn = reactions.find(a, b)
    if rxn is None:
        def label(s):
            ref = chem.LIBRARY.get(s)
            return ref["name"] if ref else chem.formula(chem.parse(s))
        return {
            "supported": False,
            "message": f"No validated reaction is available for {label(a)} + {label(b)} in ChemAR's curated library. "
                       "Putting two molecules together does not mean they react, so ChemAR does not predict products it cannot verify.",
            "available": reactions.catalog(),
        }
    return {"supported": True, "reaction": reactions.serialize(rxn)}


@app.post("/api/recognize")
def recognize(body: ImageIn):
    try:
        img = recognition.decode_image(body.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    processed, meta = recognition.preprocess(img)
    ink = meta.pop("_ink", None)
    base = {"processed_image": recognition.to_data_url(processed), "preprocess": meta}
    if meta.get("empty"):
        return {**base, "status": "empty", "method": None,
                "message": "No drawing detected. Hold dark-ink drawing on white paper closer to the camera."}
    status = recognition.recognizer.status()
    if not status["available"]:
        return {**base, "status": "unavailable", "method": None,
                "message": f"Structure recognition is not available on this machine ({status.get('reason')}). "
                           "Type the SMILES or pick a demo molecule instead."}

    # Try cleaner crops first (main drawing only, drawing + nearby labels), then all ink.
    candidates = (recognition.variants(ink) if ink is not None else []) + [("all ink", processed)]
    attempts, best_valid, best_any = [], None, None
    for label, image in candidates:
        try:
            pred = recognition.recognizer.predict(image)
        except Exception as e:
            return {**base, "status": "unavailable", "method": None, "message": str(e)}
        raw = pred.get("smiles") or ""
        conf = float(pred.get("confidence") or 0.0)
        att = {"crop": label, "raw_smiles": raw, "confidence": round(conf, 3), "seconds": pred.get("seconds"), "image": image}
        try:
            att["info"] = chem.describe(raw)
        except chem.ChemError as e:
            att["error"] = str(e)
        attempts.append(att)
        if best_any is None or conf > best_any["confidence"]:
            best_any = att
        if "info" in att and (best_valid is None or conf > best_valid["confidence"]):
            best_valid = att
        if best_valid is not None and best_valid["confidence"] >= 0.8:
            break  # confident, valid answer: no need to try more crops

    method = recognition.recognizer.status().get("method")
    tried = [{k: a[k] for k in ("crop", "raw_smiles", "confidence")} for a in attempts]
    chosen = best_valid or best_any
    out = {**base, "processed_image": recognition.to_data_url(chosen["image"]), "raw_smiles": chosen["raw_smiles"],
           "confidence": chosen["confidence"], "method": method, "crop": chosen["crop"],
           "seconds": round(sum(a["seconds"] or 0 for a in attempts), 2), "attempts": tried}

    if best_valid is not None and best_valid["confidence"] >= recognition.LOW_CONFIDENCE:
        info = best_valid["info"]
        return {**out, "status": "success", "smiles": info["smiles"], "molecule": info,
                "message": f"Structure recognised ({best_valid['crop']}) and validated by RDKit. Please confirm it matches your drawing."}

    # Not a confident valid reading: suggest the most similar molecule from the curated library.
    matches = chem.closest_matches(chosen["raw_smiles"]) if chosen["raw_smiles"] else []
    if best_valid is not None:
        exact = next((m for m in matches if m["smiles"] == best_valid["info"]["smiles"]), None)
        if exact:
            matches = [exact] + [m for m in matches if m is not exact]
    if matches:
        top = matches[0]
        info = chem.describe(top["smiles"])
        return {**out, "status": "suggested", "smiles": info["smiles"], "molecule": info, "suggestions": matches,
                "message": f"Couldn't read the drawing confidently (best model output '{chosen['raw_smiles']}', "
                           f"{chosen['confidence'] * 100:.0f}% confidence). Closest molecule in ChemAR's library: "
                           f"{top['name']} ({top['similarity'] * 100:.0f}% Tanimoto similarity). This is a suggestion, not an exact recognition."}
    if best_valid is not None:
        info = best_valid["info"]
        return {**out, "status": "uncertain", "smiles": info["smiles"], "molecule": info,
                "message": "Low confidence; please check the structure before using it."}
    return {**out, "status": "failed",
            "message": f"The recognizer produced '{chosen['raw_smiles']}', which RDKit rejected ({chosen.get('error')}). "
                       "Try redrawing or enter SMILES manually."}
