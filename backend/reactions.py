"""Curated, validated reaction library. Only reactions listed here are ever reported."""
from __future__ import annotations

from collections import Counter

import chem

REACTIONS = [
    {
        "id": "hydrogenation_ethene",
        "name": "Catalytic hydrogenation of ethene",
        "type": "Addition (hydrogenation)",
        "reactants": [("C=C", 1), ("[H][H]", 1)],
        "products": [("CC", 1)],
        "reversible": False,
        "conditions": "Nickel catalyst at ~150 °C (or Pt/Pd at room temperature)",
        "explanation": "The C=C pi bond is weaker than the sigma bond. On the metal surface H–H is split into H atoms, which add one to each carbon. The pi bond breaks, both carbons go from sp2 (planar) to sp3 (tetrahedral), and the unsaturated alkene becomes a saturated alkane.",
        "significance": "The same chemistry hardens vegetable oils into margarine and is used throughout fine-chemical and pharmaceutical synthesis.",
    },
    {
        "id": "hydration_ethene",
        "name": "Acid-catalysed hydration of ethene",
        "type": "Addition (hydration)",
        "reactants": [("C=C", 1), ("O", 1)],
        "products": [("CCO", 1)],
        "reversible": True,
        "conditions": "Steam with a phosphoric acid (H3PO4) catalyst on silica, ~300 °C, ~60–70 atm",
        "explanation": "H+ from the acid adds to the electron-rich C=C, forming a carbocation. Water attacks that carbocation, then loses H+ to regenerate the catalyst. Overall H and OH add across the double bond, turning the alkene into an alcohol.",
        "significance": "This is how most industrial (synthetic) ethanol is manufactured.",
    },
    {
        "id": "fischer_esterification",
        "name": "Fischer esterification",
        "type": "Condensation (esterification)",
        "reactants": [("CCO", 1), ("CC(=O)O", 1)],
        "products": [("CCOC(C)=O", 1), ("O", 1)],
        "reversible": True,
        "conditions": "Concentrated H2SO4 catalyst, heated under reflux; reversible equilibrium",
        "explanation": "The acid catalyst protonates the C=O of ethanoic acid, making the carbon more electrophilic. The O of ethanol attacks it, and after proton transfers a water molecule leaves. The –OH of the acid and the H of the alcohol leave as H2O, joining the two molecules through an ester (–COO–) link.",
        "significance": "Esters give fruits their smells; ethyl ethanoate is a widely used solvent (nail-polish remover, glues).",
    },
    {
        "id": "hydrogenation_benzene",
        "name": "Catalytic hydrogenation of benzene",
        "type": "Addition (hydrogenation)",
        "reactants": [("c1ccccc1", 1), ("[H][H]", 3)],
        "products": [("C1CCCCC1", 1)],
        "reversible": False,
        "conditions": "Nickel (or Pt/Pd) catalyst, ~150–200 °C, high H2 pressure (aromatic ring resists addition)",
        "explanation": "Aromatic stabilisation makes benzene far harder to hydrogenate than an alkene, so forcing conditions are needed. Three H2 molecules add across the ring, every carbon goes from sp2 to sp3, and the flat aromatic ring becomes the puckered chair of cyclohexane.",
        "significance": "Industrial route to cyclohexane, the starting point for nylon-6 and nylon-6,6.",
    },
]


def _side_counts(side):
    total = Counter()
    for smi, coeff in side:
        for el, n in chem.element_counts(chem.parse(smi)).items():
            total[el] += n * coeff
    return total


def is_balanced(rxn) -> bool:
    return _side_counts(rxn["reactants"]) == _side_counts(rxn["products"])


def _term(smi, coeff):
    f = chem.formula(chem.parse(smi))
    return (f"{coeff} " if coeff > 1 else "") + f


def equation(rxn) -> str:
    arrow = " ⇌ " if rxn["reversible"] else " → "
    return " + ".join(_term(s, c) for s, c in rxn["reactants"]) + arrow + " + ".join(_term(s, c) for s, c in rxn["products"])


def validate_library():
    for rxn in REACTIONS:
        for smi, _ in rxn["reactants"] + rxn["products"]:
            chem.parse(smi)
        if not is_balanced(rxn):
            raise RuntimeError(f"Reaction {rxn['id']} is not atom-balanced")


validate_library()

_INDEX = {
    tuple(sorted(chem.canonical(s) for s, _ in r["reactants"])): r for r in REACTIONS
}


def find(smiles_a: str, smiles_b: str):
    key = tuple(sorted([chem.canonical(smiles_a), chem.canonical(smiles_b)]))
    return _INDEX.get(key)


def serialize(rxn, with_3d=True) -> dict:
    def side(items):
        return [{"coefficient": c, **chem.describe(s, with_3d=with_3d)} for s, c in items]

    return {
        "id": rxn["id"], "name": rxn["name"], "type": rxn["type"],
        "conditions": rxn["conditions"], "reversible": rxn["reversible"],
        "equation": equation(rxn), "balanced": is_balanced(rxn),
        "explanation": rxn["explanation"], "significance": rxn["significance"],
        "reactants": side(rxn["reactants"]), "products": side(rxn["products"]),
    }


def catalog() -> list[dict]:
    return [
        {"id": r["id"], "name": r["name"], "equation": equation(r), "conditions": r["conditions"],
         "reactants": [chem.LIBRARY[chem.canonical(s)]["name"] for s, _ in r["reactants"]]}
        for r in REACTIONS
    ]
