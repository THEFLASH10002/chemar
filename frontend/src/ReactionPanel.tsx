import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Atom, FlaskConical, Loader2, Plus, Save, ScanEye, Sparkles, Thermometer, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api, displayName, type MoleculeInfo, type ReactResult, type Reaction } from './api'
import { MolViewer } from './MolViewer'
import type { InventoryItem } from './App'

type Phase = 'idle' | 'loading' | 'approach' | 'flash' | 'done' | 'unsupported' | 'error'

interface Props {
  selected: InventoryItem[]
  onSaveProduct: (m: MoleculeInfo) => void
  onInspect: (m: MoleculeInfo) => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function ReactionPanel({ selected, onSaveProduct, onInspect }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [unsupported, setUnsupported] = useState<Extract<ReactResult, { supported: false }> | null>(null)
  const [error, setError] = useState('')
  const ready = selected.length === 2

  async function react() {
    if (!ready) return
    setPhase('loading'); setReaction(null); setUnsupported(null); setError('')
    try {
      const res = await api.react(selected[0].smiles, selected[1].smiles)
      if (!res.supported) { setUnsupported(res); setPhase('unsupported'); return }
      setReaction(res.reaction)
      setPhase('approach'); await sleep(1700)
      setPhase('flash'); await sleep(900)
      setPhase('done')
    } catch (e) {
      setError((e as Error).message); setPhase('error')
    }
  }

  const particles = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    angle: (i / 28) * Math.PI * 2 + Math.random() * 0.3, dist: 90 + Math.random() * 140, size: 3 + Math.random() * 5, hue: Math.random() > 0.5 ? '#22e3ff' : '#a78bfa',
  })), [reaction])

  return (
    <section className="glass p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="panel-title"><FlaskConical size={14} /> Reaction chamber</div>
        <div className="flex items-center gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2">
              {i === 1 && <Plus size={14} className="text-slate-500" />}
              <div className={`min-w-28 rounded-lg border px-3 py-1.5 text-center text-sm ${selected[i] ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-dashed border-white/15 text-slate-500'}`}>
                {selected[i] ? selected[i].name : `Reactant ${i + 1}`}
              </div>
            </div>
          ))}
          <button className="btn-primary ml-2" disabled={!ready || phase === 'loading' || phase === 'approach' || phase === 'flash'} onClick={react}>
            {phase === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} React
          </button>
        </div>
      </div>

      {phase === 'idle' && (
        <p className="py-6 text-center text-sm text-slate-400">Select two molecules in your inventory, then press <b className="text-cyan-200">React</b>. Only reactions in ChemAR's validated library are shown.</p>
      )}
      {phase === 'loading' && <p className="flex items-center justify-center gap-2 py-6 text-sm text-cyan-200"><Loader2 className="animate-spin" size={16} /> Checking the validated reaction library…</p>}
      {phase === 'error' && <p className="py-6 text-center text-sm text-rose-300">Reaction request failed: {error}</p>}

      {phase === 'unsupported' && unsupported && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="mb-2 flex items-center gap-2 font-medium text-amber-200"><AlertTriangle size={16} /> No validated reaction</div>
          <p className="text-sm text-slate-300">{unsupported.message}</p>
          <div className="mt-3 text-xs text-slate-400">Supported in this build:</div>
          <ul className="mt-1 grid gap-1 text-sm text-slate-300 md:grid-cols-2">
            {unsupported.available.map((r) => <li key={r.name} className="font-mono text-xs"><span className="text-cyan-200">{r.reactants.join(' + ')}</span> · {r.equation}</li>)}
          </ul>
        </motion.div>
      )}

      {reaction && (phase === 'approach' || phase === 'flash' || phase === 'done') && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <div className="relative h-64 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.18),transparent_60%)]" />
            <AnimatePresence>
              {phase !== 'done' && reaction.reactants.map((r, i) => {
                const fromLeft = i === 0
                return (
                  <motion.div key={r.smiles} className="absolute top-1/2 h-44 w-44 -translate-y-1/2"
                    initial={{ left: fromLeft ? '2%' : '68%', opacity: 0, scale: 0.7 }}
                    animate={phase === 'approach' ? { left: fromLeft ? '26%' : '44%', opacity: 1, scale: 1 } : { left: '35%', opacity: 0, scale: 0.4 }}
                    exit={{ opacity: 0 }} transition={{ duration: phase === 'approach' ? 1.6 : 0.5, ease: 'easeInOut' }}>
                    <MolViewer molblock={r.molblock} spin />
                    <div className="absolute bottom-0 w-full text-center text-xs text-slate-300">{(r.coefficient ?? 1) > 1 ? `${r.coefficient} × ` : ''}{displayName(r)}</div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            {phase === 'flash' && (
              <>
                <motion.div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/60 blur-2xl"
                  initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 1.6, 2.4], opacity: [0, 1, 0] }} transition={{ duration: 0.9 }} />
                {particles.map((p, i) => (
                  <motion.span key={i} className="absolute left-1/2 top-1/2 rounded-full" style={{ width: p.size, height: p.size, background: p.hue, boxShadow: `0 0 10px ${p.hue}` }}
                    initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(p.angle) * p.dist, y: Math.sin(p.angle) * p.dist, opacity: 0 }} transition={{ duration: 0.85, ease: 'easeOut' }} />
                ))}
              </>
            )}
            {phase === 'done' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 px-2">
                {reaction.products.map((p, i) => (
                  <motion.div key={p.smiles} className="relative h-52 flex-1" initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', delay: i * 0.15, stiffness: 120 }}>
                    <MolViewer molblock={p.molblock} spin labels={false} />
                    <div className="absolute bottom-0 w-full text-center text-xs text-cyan-100">{displayName(p)}</div>
                  </motion.div>
                ))}
              </div>
            )}
            <div className="absolute left-3 top-2 text-[10px] uppercase tracking-widest text-slate-500">Illustrative animation, not a dynamics simulation</div>
          </div>

          <AnimatePresence>
            {phase === 'done' && (
              <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-3 text-sm">
                <div>
                  <div className="font-display text-lg font-bold text-white">{reaction.name}</div>
                  <div className="text-xs text-violet-300">{reaction.type}{reaction.balanced && ' · atom-balanced ✓ (verified by RDKit)'}</div>
                </div>
                <div className="rounded-xl border border-cyan-300/30 bg-cyan-300/5 px-3 py-2 text-center font-mono text-base text-cyan-100">{reaction.equation}</div>
                <div className="flex gap-2 text-slate-300"><Thermometer size={16} className="mt-0.5 shrink-0 text-amber-300" /><span><b className="text-slate-100">Conditions:</b> {reaction.conditions}</span></div>
                <div className="flex gap-2 text-slate-300"><Atom size={16} className="mt-0.5 shrink-0 text-cyan-300" /><span><b className="text-slate-100">What changes:</b> {reaction.explanation}</span></div>
                <div className="flex gap-2 text-slate-300"><Sparkles size={16} className="mt-0.5 shrink-0 text-violet-300" /><span><b className="text-slate-100">Why it matters:</b> {reaction.significance}</span></div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {reaction.products.map((p) => (
                    <div key={p.smiles} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs">
                      <span className="text-slate-200">{displayName(p)}</span><ArrowRight size={12} className="text-slate-500" />
                      <button className="text-cyan-300 hover:underline" onClick={() => onInspect(p)}><ScanEye size={12} className="inline" /> Inspect</button>
                      <button className="text-violet-300 hover:underline" onClick={() => onSaveProduct(p)}><Save size={12} className="inline" /> Save</button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}
