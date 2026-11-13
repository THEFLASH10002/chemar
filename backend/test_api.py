import base64

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from rdkit import Chem

import chem
import reactions
import recognition
from main import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"]


def test_valid_smiles():
    r = client.post("/api/molecule", json={"smiles": "OCC"})
    assert r.status_code == 200
    d = r.json()
    assert d["smiles"] == "CCO" and d["name"] == "Ethanol" and d["formula"] == "C2H6O"


@pytest.mark.parametrize("bad", ["", "C1CC", "xyz", "C(C"])
def test_invalid_smiles(bad):
    assert client.post("/api/molecule", json={"smiles": bad}).status_code == 422


def test_benzene_generation():
    d = client.post("/api/molecule", json={"smiles": "C1=CC=CC=C1"}).json()
    assert d["smiles"] == "c1ccccc1" and d["formula"] == "C6H6"
    assert "Aromatic ring" in d["functional_groups"]
    assert abs(d["molecular_weight"] - 78.114) < 0.01


def test_ethanol_3d_coordinates():
    d = chem.describe("CCO")
    mol = Chem.MolFromMolBlock(d["molblock"], removeHs=False)
    assert mol.GetNumAtoms() == 9  # 2 C + 1 O + 6 H
    conf = mol.GetConformer()
    zs = [conf.GetAtomPosition(i).z for i in range(mol.GetNumAtoms())]
    assert max(zs) - min(zs) > 0.1  # genuinely 3D
    assert "Hydroxyl (alcohol)" in d["functional_groups"]


@pytest.mark.parametrize("smi", [s for _, s in chem.SAMPLES])
def test_all_samples_embed(smi):
    d = chem.describe(smi)
    assert d["molblock"] and d["known"]


def test_samples_endpoint():
    names = [s["name"] for s in client.get("/api/samples").json()]
    assert {"Benzene", "Ethanol", "Water", "Hydrogen", "Ethyl ethanoate"} <= set(names)


@pytest.mark.parametrize("a,b,products", [
    ("C=C", "[H][H]", {"CC"}),
    ("O", "C=C", {"CCO"}),
    ("CC(=O)O", "OCC", {"CCOC(C)=O", "O"}),
    ("c1ccccc1", "[H][H]", {"C1CCCCC1"}),
])
def test_supported_reactions_order_independent(a, b, products):
    for x, y in [(a, b), (b, a)]:
        d = client.post("/api/react", json={"smiles_a": x, "smiles_b": y}).json()
        assert d["supported"]
        rx = d["reaction"]
        assert {p["smiles"] for p in rx["products"]} == products
        assert rx["balanced"]
        for p in rx["products"]:
            assert Chem.MolFromSmiles(p["smiles"]) is not None and p["molblock"]


def test_unsupported_reaction():
    d = client.post("/api/react", json={"smiles_a": "c1ccccc1", "smiles_b": "O"}).json()
    assert d["supported"] is False and "No validated reaction" in d["message"]


def test_balanced_equations():
    for r in reactions.REACTIONS:
        assert reactions.is_balanced(r), r["id"]
    eqs = {r["id"]: reactions.equation(r) for r in reactions.REACTIONS}
    assert eqs["fischer_esterification"] == "C2H6O + C2H4O2 ⇌ C4H8O2 + H2O"
    assert eqs["hydrogenation_benzene"] == "C6H6 + 3 H2 → C6H12"


def test_unbalanced_detected():
    bad = {"reactants": [("C=C", 1)], "products": [("CC", 1)], "reversible": False}
    assert not reactions.is_balanced(bad)


def _png(img):
    return "data:image/png;base64," + base64.b64encode(cv2.imencode(".png", img)[1].tobytes()).decode()


def test_recognition_blank_image_reports_empty():
    blank = np.full((480, 640, 3), 235, np.uint8)
    d = client.post("/api/recognize", json={"image": _png(blank)}).json()
    assert d["status"] == "empty" and d.get("smiles") is None


def test_recognition_fallback_when_unavailable(monkeypatch):
    img = np.full((480, 640, 3), 255, np.uint8)
    cv2.line(img, (200, 240), (440, 240), (0, 0, 0), 6)
    monkeypatch.setattr(recognition.recognizer, "status", lambda: {"available": False, "reason": "test"})
    d = client.post("/api/recognize", json={"image": _png(img)}).json()
    assert d["status"] == "unavailable" and d.get("smiles") is None
    assert "SMILES" in d["message"]


def test_recognition_never_fakes_invalid(monkeypatch):
    img = np.full((480, 640, 3), 255, np.uint8)
    cv2.line(img, (200, 240), (440, 240), (0, 0, 0), 6)
    monkeypatch.setattr(recognition.recognizer, "status", lambda: {"available": True, "method": "mock"})
    monkeypatch.setattr(recognition.recognizer, "predict", lambda g: {"smiles": "C1CC(", "confidence": 0.9})
    d = client.post("/api/recognize", json={"image": _png(img)}).json()
    assert d["status"] == "failed" and "smiles" not in d


def test_preprocess_crops_drawing():
    img = np.full((480, 640, 3), 200, np.uint8)
    cv2.circle(img, (320, 240), 60, (20, 20, 20), 5)
    out, meta = recognition.preprocess(img)
    assert out.shape == (512, 512) and not meta["empty"]
    x0, y0, x1, y1 = meta["crop_box"]
    assert 240 <= x0 <= 270 and 370 <= x1 <= 400


def test_recognition_suggests_closest_library_match(monkeypatch):
    img = np.full((480, 640, 3), 255, np.uint8)
    cv2.circle(img, (320, 240), 80, (0, 0, 0), 6)
    monkeypatch.setattr(recognition.recognizer, "status", lambda: {"available": True, "method": "mock"})
    monkeypatch.setattr(recognition.recognizer, "predict", lambda g: {"smiles": "C1=CC=CC=C1.CC", "confidence": 0.05})
    d = client.post("/api/recognize", json={"image": _png(img)}).json()
    assert d["status"] == "suggested"
    assert d["molecule"]["name"] == "Benzene" and d["suggestions"][0]["name"] == "Benzene"
    assert "suggestion, not an exact recognition" in d["message"]


def test_closest_match_ignores_stray_fragments():
    assert chem.closest_matches("C1=CC=CC=C1.CC")[0]["name"] == "Benzene"
    assert chem.closest_matches("CC(=O)O.C")[0]["name"] == "Ethanoic acid"
