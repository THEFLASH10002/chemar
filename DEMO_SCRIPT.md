# ChemAR demo script (~3 minutes)

**Before you go on:** run `start.bat` and allow camera access. Have your drawings ready: benzene, ethanol and ethanoic acid (thick black marker, white paper). Check the header badge says whether recognition is available. Clear the inventory from a previous run (trash icons).

1. **Hook (15 s):** "Chemistry students learn 3D molecules from flat drawings. ChemAR turns your drawing into a real 3D molecule. Draw it, scan it, bring chemistry to life."
2. **Scan benzene (40 s):** Hold the benzene sheet inside the dashed box and press **Scan molecule**. Point out the preprocessed image (what the model saw), the SMILES, the model-reported confidence and the method. Press **Confirm & visualise**: the molecule fades in over the live camera feed.
   - *If recognition misses:* "Every result is validated by RDKit; when it's unsure we say so instead of faking it." Type `c1ccccc1` or tap Demo → Benzene.
3. **Manipulate (30 s):** Drag to rotate, scroll to zoom, toggle Labels / Spin / Space-filling, use the scale slider, drag the move handle. Read the info panel: aromatic ring, planar 120°, MW 78.11.
4. **Build the inventory (30 s):** **Save** benzene. Scan (or demo) **ethanol** and **ethanoic acid**, saving each.
5. **React (45 s):** Select ethanol and ethanoic acid, then press **React**. The molecules fly together, there's a burst of energy, and ethyl ethanoate + water appear. Read out the balanced equation `C2H6O + C2H4O2 ⇌ C4H8O2 + H2O`, the H₂SO₄/reflux conditions and the "nail-polish remover" fact. Press **Inspect** on the ester to put it into AR.
6. **Honesty beat (20 s):** Select benzene + ethanol, then press **React**: "No validated reaction." "Putting two molecules together doesn't mean they react. ChemAR only shows reactions it can verify."
7. **Close:** Demo → Benzene + Hydrogen → React gives cyclohexane (3 H₂, Ni catalyst): the flat aromatic ring puckers into a chair.
