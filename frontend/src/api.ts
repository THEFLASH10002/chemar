export interface MoleculeInfo {
  smiles: string
  name: string | null
  iupac: string | null
  known: boolean
  formula: string
  molecular_weight: number
  heavy_atoms: number
  functional_groups: string[]
  geometry: string
  applications: string
  svg: string
  molblock: string
  forcefield: string
  conformer_method: string
  coefficient?: number
}

export interface Recognition {
  status: 'success' | 'uncertain' | 'suggested' | 'failed' | 'unavailable' | 'empty'
  message: string
  suggestions?: { name: string; smiles: string; similarity: number }[]
  crop?: string
  method: string | null
  processed_image: string
  raw_smiles?: string
  smiles?: string
  confidence?: number | null
  seconds?: number
  molecule?: MoleculeInfo
}

export interface Reaction {
  id: string
  name: string
  type: string
  conditions: string
  reversible: boolean
  equation: string
  balanced: boolean
  explanation: string
  significance: string
  reactants: MoleculeInfo[]
  products: MoleculeInfo[]
}

export type ReactResult =
  | { supported: true; reaction: Reaction }
  | { supported: false; message: string; available: { name: string; equation: string; reactants: string[] }[] }

export interface Health {
  ok: boolean
  rdkit: string
  recognition: { available: boolean; method: string | null; reason?: string; device?: string | null }
}

async function req<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try { const j = await r.json(); msg = typeof j.detail === 'string' ? j.detail : msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return r.json() as Promise<T>
}

export const api = {
  health: () => req<Health>('/api/health'),
  samples: () => req<{ name: string; smiles: string; formula: string }[]>('/api/samples'),
  molecule: (smiles: string) => req<MoleculeInfo>('/api/molecule', { smiles }),
  recognize: (image: string) => req<Recognition>('/api/recognize', { image }),
  react: (a: string, b: string) => req<ReactResult>('/api/react', { smiles_a: a, smiles_b: b }),
}

export const displayName = (m: { name: string | null; formula: string }) => m.name ?? m.formula
