"""RDKit-backed chemistry core: validation, 3D generation, descriptors, education data."""
from __future__ import annotations

from collections import Counter

from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")

MAX_HEAVY_ATOMS = 120


class ChemError(ValueError):
    pass


# Curated reference data, keyed by canonical SMILES. Only these get names / applications.
LIBRARY: dict[str, dict] = {
    "c1ccccc1": {
        "name": "Benzene", "iupac": "Benzene",
        "applications": "Feedstock for styrene, phenol, nylon precursors and many dyes and drugs. Toxic and carcinogenic, so handled with care.",
        "geometry": "Planar hexagon; all six carbons sp2 with 120° angles. The pi electrons are delocalised over the ring (aromatic), so all C–C bonds are the same length (~1.39 Å).",
    },
    "C1CCCCC1": {
        "name": "Cyclohexane", "iupac": "Cyclohexane",
        "applications": "Industrial solvent and the main precursor of adipic acid and caprolactam for nylon manufacture.",
        "geometry": "Non-planar ring that adopts a chair conformation; all carbons sp3 with near-tetrahedral ~111° angles, which makes the ring almost strain-free.",
    },
    "C=C": {
        "name": "Ethene", "iupac": "Ethene (ethylene)",
        "applications": "The most-produced organic chemical in the world: made into polyethylene, ethanol, ethylene glycol; also a plant hormone that ripens fruit.",
        "geometry": "Planar; both carbons sp2 with ~120° angles. The C=C double bond (one sigma + one pi bond) prevents rotation.",
    },
    "CC": {
        "name": "Ethane", "iupac": "Ethane",
        "applications": "Component of natural gas; cracked industrially to make ethene.",
        "geometry": "Both carbons sp3 and tetrahedral (~109.5°); free rotation about the C–C single bond (staggered conformation preferred).",
    },
    "[H][H]": {
        "name": "Hydrogen", "iupac": "Dihydrogen",
        "applications": "Hydrogenation of alkenes and oils, ammonia synthesis (Haber process), fuel cells.",
        "geometry": "Linear diatomic molecule with a single H–H sigma bond (0.74 Å).",
    },
    "O": {
        "name": "Water", "iupac": "Oxidane (water)",
        "applications": "Universal solvent; reactant in hydration and hydrolysis reactions; essential to life.",
        "geometry": "Bent; oxygen is sp3 with two lone pairs, giving an H–O–H angle of ~104.5°.",
    },
    "CCO": {
        "name": "Ethanol", "iupac": "Ethanol",
        "applications": "Fuel additive, solvent, disinfectant, and the alcohol in alcoholic drinks.",
        "geometry": "Both carbons and the oxygen are sp3 (tetrahedral electron geometry); the C–O–H angle is bent (~109°).",
    },
    "CC(=O)O": {
        "name": "Ethanoic acid", "iupac": "Ethanoic acid (acetic acid)",
        "applications": "The acid in vinegar; used to make vinyl acetate, cellulose acetate and esters.",
        "geometry": "Carboxyl carbon is sp2 and trigonal planar (~120°); the methyl carbon is sp3 tetrahedral.",
    },
    "CCOC(C)=O": {
        "name": "Ethyl ethanoate", "iupac": "Ethyl ethanoate (ethyl acetate)",
        "applications": "Solvent in nail-polish remover, glues and decaffeination; gives a fruity smell.",
        "geometry": "Ester carbonyl carbon is sp2 and trigonal planar; the ethyl and methyl carbons are sp3 tetrahedral.",
    },
}

SAMPLES = [
    ("Benzene", "c1ccccc1"), ("Cyclohexane", "C1CCCCC1"), ("Ethene", "C=C"), ("Ethane", "CC"),
    ("Hydrogen", "[H][H]"), ("Water", "O"), ("Ethanol", "CCO"), ("Ethanoic acid", "CC(=O)O"),
    ("Ethyl ethanoate", "CCOC(C)=O"),
]

FUNCTIONAL_GROUPS = [
    ("Carboxylic acid", "[CX3](=O)[OX2H1]"),
    ("Ester", "[#6][CX3](=O)[OX2H0][#6]"),
    ("Aldehyde", "[CX3H1](=O)[#6]"),
    ("Ketone", "[#6][CX3](=O)[#6]"),
    ("Hydroxyl (alcohol)", "[OX2H][CX4]"),
    ("Phenol", "[OX2H]c"),
    ("Amine", "[NX3;H2,H1,H0;!$(NC=O)]"),
    ("Amide", "C(=O)N"),
    ("Aromatic ring", "a1aaaaa1"),
    ("Alkene (C=C)", "[CX3]=[CX3]"),
    ("Alkyne (C≡C)", "C#C"),
    ("Halide", "[F,Cl,Br,I]"),
    ("Nitrile", "C#N"),
]


def parse(smiles: str) -> Chem.Mol:
    if not isinstance(smiles, str) or not smiles.strip():
        raise ChemError("Empty SMILES string.")
    mol = Chem.MolFromSmiles(smiles.strip())
    if mol is None:
        raise ChemError(f"'{smiles}' is not a valid SMILES string (RDKit could not parse or sanitize it).")
    if mol.GetNumAtoms() == 0:
        raise ChemError("SMILES contains no atoms.")
    if mol.GetNumHeavyAtoms() > MAX_HEAVY_ATOMS:
        raise ChemError(f"Molecule too large for the live viewer (>{MAX_HEAVY_ATOMS} heavy atoms).")
    if len(Chem.GetMolFrags(mol)) > 1:
        raise ChemError("SMILES contains several disconnected fragments; enter one molecule at a time.")
    return mol


def canonical(smiles: str) -> str:
    return Chem.MolToSmiles(parse(smiles))


def formula(mol: Chem.Mol) -> str:
    return rdMolDescriptors.CalcMolFormula(mol)


def element_counts(mol: Chem.Mol) -> Counter:
    mh = Chem.AddHs(mol)
    return Counter(a.GetSymbol() for a in mh.GetAtoms())


def embed_3d(mol: Chem.Mol) -> tuple[str, str]:
    """Return (molblock with explicit H and 3D coords, forcefield used)."""
    mh = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 0xC0FFEE
    status = AllChem.EmbedMolecule(mh, params)
    if status != 0:
        params.useRandomCoords = True
        status = AllChem.EmbedMolecule(mh, params)
    if status != 0:
        raise ChemError("RDKit could not generate 3D coordinates for this structure (embedding failed).")
    ff = "none"
    try:
        if mh.GetNumAtoms() > 1 and AllChem.MMFFHasAllMoleculeParams(mh):
            AllChem.MMFFOptimizeMolecule(mh, maxIters=500)
            ff = "MMFF94"
        elif mh.GetNumAtoms() > 1 and AllChem.UFFHasAllMoleculeParams(mh):
            AllChem.UFFOptimizeMolecule(mh, maxIters=500)
            ff = "UFF"
    except Exception:  # optimisation is a refinement; ETKDG geometry is still valid
        ff = "ETKDG only"
    return Chem.MolToMolBlock(mh), ff


def svg_2d(mol: Chem.Mol, size: int = 220) -> str:
    d = rdMolDraw2D.MolDraw2DSVG(size, size)
    opts = d.drawOptions()
    try:
        rdMolDraw2D.SetDarkMode(opts)
    except Exception:
        pass
    opts.setBackgroundColour((0, 0, 0, 0))
    opts.bondLineWidth = 2
    opts.addStereoAnnotation = False
    m = Chem.Mol(mol)
    if m.GetNumAtoms() <= 2 and all(a.GetSymbol() == "H" for a in m.GetAtoms()):
        pass
    rdMolDraw2D.PrepareAndDrawMolecule(d, m)
    d.FinishDrawing()
    return d.GetDrawingText()


def functional_groups(mol: Chem.Mol) -> list[str]:
    found = []
    for name, smarts in FUNCTIONAL_GROUPS:
        patt = Chem.MolFromSmarts(smarts)
        if mol.HasSubstructMatch(patt):
            found.append(name)
    # acid/ester oxygens shouldn't also count as alcohols
    if "Carboxylic acid" in found and "Hydroxyl (alcohol)" in found:
        acid_oh = {m[2] for m in mol.GetSubstructMatches(Chem.MolFromSmarts("[CX3](=O)[OX2H1]"))}
        alc_oh = {m[0] for m in mol.GetSubstructMatches(Chem.MolFromSmarts("[OX2H][CX4]"))}
        if alc_oh <= acid_oh:
            found.remove("Hydroxyl (alcohol)")
    if not found:
        heavy = {a.GetSymbol() for a in mol.GetAtoms()}
        if heavy <= {"C", "H"} and mol.GetNumAtoms() > 0:
            found.append("Alkane (saturated hydrocarbon)")
        else:
            found.append("No common organic functional group")
    return found


def auto_geometry(mol: Chem.Mol) -> str:
    hyb = Counter(str(a.GetHybridization()) for a in mol.GetAtoms() if a.GetAtomicNum() > 1)
    parts = []
    names = {"SP3": "sp3 (tetrahedral, ~109.5°)", "SP2": "sp2 (trigonal planar, ~120°)", "SP": "sp (linear, 180°)"}
    for k, label in names.items():
        if hyb.get(k):
            parts.append(f"{hyb[k]} × {label}")
    return "Heavy-atom hybridisation from RDKit: " + (", ".join(parts) if parts else "n/a") + "."


def _loose_fp(smiles: str):
    """Morgan fingerprint of a possibly-invalid (e.g. multi-fragment) SMILES, without full sanitization."""
    from rdkit.Chem import rdFingerprintGenerator

    m = Chem.MolFromSmiles(smiles)  # sanitized when possible (aromatic perception, so Kekulé benzene == c1ccccc1)
    if m is None:
        m = Chem.MolFromSmiles(smiles, sanitize=False)
    if m is None or m.GetNumAtoms() == 0:
        return None
    try:
        m.UpdatePropertyCache(strict=False)
        Chem.FastFindRings(m)
        return rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048).GetFingerprint(m), m.GetNumAtoms()
    except Exception:
        return None


def closest_matches(smiles: str, top: int = 3) -> list[dict]:
    """Rank curated-library molecules by similarity to a recognizer output.

    Each fragment of the output is compared separately (Tanimoto, Morgan r=2) and weighted by
    the square root of its share of the atoms, so stray marks read as tiny extra fragments don't
    outweigh the main structure."""
    from rdkit import DataStructs

    frags = [f for f in (smiles or "").split(".") if f]
    fps = [fp for fp in (_loose_fp(f) for f in frags) if fp is not None]
    if not fps:
        return []
    total = sum(n for _, n in fps)
    ranked = []
    for can, ref in LIBRARY.items():
        lib = _loose_fp(can)
        if lib is None:
            continue
        score = max(DataStructs.TanimotoSimilarity(fp, lib[0]) * (n / total) ** 0.5 for fp, n in fps)
        ranked.append({"name": ref["name"], "smiles": can, "similarity": round(score, 3)})
    ranked.sort(key=lambda r: -r["similarity"])
    return [r for r in ranked[:top] if r["similarity"] > 0]


def describe(smiles: str, with_3d: bool = True) -> dict:
    mol = parse(smiles)
    can = Chem.MolToSmiles(mol)
    ref = LIBRARY.get(can)
    info = {
        "smiles": can,
        "name": ref["name"] if ref else None,
        "iupac": ref["iupac"] if ref else None,
        "known": bool(ref),
        "formula": formula(mol),
        "molecular_weight": round(Descriptors.MolWt(mol), 3),
        "heavy_atoms": mol.GetNumHeavyAtoms(),
        "functional_groups": functional_groups(mol),
        "geometry": ref["geometry"] if ref else auto_geometry(mol),
        "applications": ref["applications"] if ref else "Not in ChemAR's curated library, so no applications are claimed.",
        "svg": svg_2d(mol),
    }
    if not ref:
        info["name"] = None
    if with_3d:
        mb, ff = embed_3d(mol)
        info["molblock"] = mb
        info["forcefield"] = ff
        info["conformer_method"] = f"RDKit ETKDGv3 + {ff}"
    return info
