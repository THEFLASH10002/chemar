import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import {
  Atom, Camera, CameraOff, CheckCircle2, CircleAlert, Eye, EyeOff, FlaskRound, Hexagon, Loader2, Move, Orbit, RotateCcw,
  Save, ScanLine, Sparkles, Tag, Trash2, Wand2, XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, displayName, type Health, type MoleculeInfo, type Recognition } from './api'
import { MolViewer, type RenderStyle } from './MolViewer'
import { ReactionPanel } from './ReactionPanel'

export interface InventoryItem { id: string; smiles: string; name: string; formula: string; svg: string; source: Source }
type Source = 'scan' | 'demo' | 'manual' | 'reaction'
type CamStatus = 'init' | 'active' | 'denied' | 'error'

const INV_KEY = 'chemar.inventory.v1'
const loadInv = (): InventoryItem[] => { try { return JSON.parse(localStorage.getItem(INV_KEY) || '[]') } catch { return [] } }

function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CamStatus>('init')
  const [error, setError] = useState('')
  const start = useCallback(async () => {
    setStatus('init'); setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('error'); setError('This browser does not support webcam access.'); return }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      setStream(s); setStatus('active')
    } catch (e) {
      const err = e as DOMException
      setStatus(err.name === 'NotAllowedError' ? 'denied' : 'error'); setError(err.message || err.name)
    }
  }, [])
  useEffect(() => { start() }, [start])
  return { stream, status, error, start }
}

function Video({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play().catch(() => {}) } }, [stream])
  return <video ref={ref} muted playsInline autoPlay className={className} />
}

const SOURCE_BADGE: Record<Source, string> = {
  scan: 'bg-cyan-400/15 text-cyan-200 border-cyan-300/30', demo: 'bg-violet-400/15 text-violet-200 border-violet-300/30',
  manual: 'bg-slate-400/15 text-slate-200 border-slate-300/30', reaction: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30',
}

export default function App() {
  const cam = useCamera()
  const scanVideo = useRef<HTMLVideoElement>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  const [samples, setSamples] = useState<{ name: string; smiles: string; formula: string }[]>([])
  const [current, setCurrent] = useState<MoleculeInfo | null>(null)
  const [source, setSource] = useState<Source>('demo')
  const [loadingMol, setLoadingMol] = useState(false)
  const [molError, setMolError] = useState('')
  const [smilesInput, setSmilesInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [recog, setRecog] = useState<Recognition | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>(loadInv)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [labels, setLabels] = useState(true)
  const [spin, setSpin] = useState(true)
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('ballstick')
  const [scale, setScale] = useState(1)
  const [showCam, setShowCam] = useState(true)
  const [toast, setToast] = useState('')
  const drag = useDragControls()
  const [dragKey, setDragKey] = useState(0)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setBackendDown(true))
    api.samples().then(setSamples).catch(() => setBackendDown(true))
  }, [])
  useEffect(() => { localStorage.setItem(INV_KEY, JSON.stringify(inventory)) }, [inventory])
  useEffect(() => { if (scanVideo.current && cam.stream) { scanVideo.current.srcObject = cam.stream; scanVideo.current.play().catch(() => {}) } }, [cam.stream])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2200); return () => clearTimeout(t) }, [toast])

  async function loadMolecule(smiles: string, src: Source) {
    setLoadingMol(true); setMolError('')
    try { const m = await api.molecule(smiles); setCurrent(m); setSource(src); setSmilesInput(m.smiles) }
    catch (e) { setMolError((e as Error).message) }
    finally { setLoadingMol(false) }
  }

  async function scan() {
    const v = scanVideo.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    setScanning(true); setRecog(null)
    try {
      const r = await api.recognize(c.toDataURL('image/jpeg', 0.92))
      setRecog(r)
      if (r.smiles) setSmilesInput(r.smiles)
    } catch (e) {
      setRecog({ status: 'failed', message: (e as Error).message, method: null, processed_image: '' })
    } finally { setScanning(false) }
  }

  function confirmScan() {
    if (recog?.molecule) { setCurrent(recog.molecule); setSource('scan'); setToast('Scanned molecule loaded') }
  }

  function save(m: MoleculeInfo, src: Source) {
    if (inventory.some((i) => i.smiles === m.smiles)) { setToast(`${displayName(m)} is already in your inventory`); return }
    setInventory((inv) => [...inv, { id: crypto.randomUUID(), smiles: m.smiles, name: displayName(m), formula: m.formula, svg: m.svg, source: src }])
    setToast(`Saved ${displayName(m)} to inventory`)
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id])
  }

  const selected = selectedIds.map((id) => inventory.find((i) => i.id === id)).filter(Boolean) as InventoryItem[]
  const rec = health?.recognition

  return (
    <div className="mx-auto flex min-h-full max-w-[1680px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-600 shadow-[0_0_30px_-4px_rgba(34,227,255,0.7)]"><Hexagon className="text-slate-950" size={22} /></div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">Chem<span className="text-cyan-300">AR</span></h1>
            <p className="text-xs text-slate-400">Draw it. Scan it. Bring chemistry to life.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full border px-2.5 py-1 ${backendDown ? 'border-rose-400/40 text-rose-300' : 'border-emerald-400/30 text-emerald-300'}`}>
            {backendDown ? 'Backend offline' : health ? `RDKit ${health.rdkit}` : 'Connecting…'}
          </span>
          {rec && <span title={rec.reason} className={`rounded-full border px-2.5 py-1 ${rec.available ? 'border-cyan-300/30 text-cyan-200' : 'border-amber-400/30 text-amber-200'}`}>
            {rec.available ? `Recognition: ${rec.method}` : 'Recognition unavailable: manual/demo mode'}</span>}
        </div>
      </header>

      <main className="grid flex-1 gap-4 xl:grid-cols-[340px_1fr_360px]">
        {/* LEFT: camera + scan */}
        <section className="glass flex flex-col gap-3 p-4">
          <div className="panel-title"><Camera size={14} /> Live scanner</div>
          <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
            <video ref={scanVideo} muted playsInline autoPlay className="h-full w-full object-cover" />
            {cam.status !== 'active' && (
              <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm">
                {cam.status === 'init' ? <span className="flex items-center gap-2 text-cyan-200"><Loader2 className="animate-spin" size={16} /> Initialising camera…</span> : (
                  <div className="space-y-2 text-slate-300">
                    <CameraOff className="mx-auto text-rose-300" />
                    <div>{cam.status === 'denied' ? 'Camera permission was denied.' : 'Camera unavailable.'}</div>
                    <div className="text-xs text-slate-500">{cam.error}</div>
                    <button className="btn-ghost" onClick={cam.start}>Retry camera</button>
                  </div>)}
              </div>)}
            {cam.status === 'active' && <>
              <div className="pointer-events-none absolute inset-[12%] rounded-lg border-2 border-dashed border-cyan-300/50" />
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE</div>
            </>}
            {scanning && <div className="pointer-events-none absolute inset-0"><div className="scanline w-full" /></div>}
          </div>
          <button className="btn-primary w-full py-2.5" disabled={cam.status !== 'active' || scanning} onClick={scan}>
            {scanning ? <><Loader2 size={16} className="animate-spin" /> Recognising structure…</> : <><ScanLine size={16} /> Scan molecule</>}
          </button>
          <p className="text-[11px] leading-snug text-slate-500">Black marker on white paper, drawing filling the dashed box, steady and well lit.</p>

          <AnimatePresence mode="wait">
            {recog && (
              <motion.div key={recog.status + (recog.raw_smiles ?? '')} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {recog.status === 'success' && <><CheckCircle2 size={16} className="text-emerald-400" /> <span className="text-emerald-200">Recognition successful</span></>}
                  {recog.status === 'uncertain' && <><CircleAlert size={16} className="text-amber-300" /> <span className="text-amber-200">Uncertain: please verify</span></>}
                  {recog.status === 'suggested' && <><Sparkles size={16} className="text-amber-300" /> <span className="text-amber-200">Closest match: {recog.molecule?.name ?? recog.molecule?.formula}</span></>}
                  {(recog.status === 'failed' || recog.status === 'empty' || recog.status === 'unavailable') && <><XCircle size={16} className="text-rose-400" /> <span className="text-rose-200">{recog.status === 'unavailable' ? 'Recognition unavailable' : recog.status === 'empty' ? 'No drawing found' : 'Recognition failed'}</span></>}
                </div>
                <div className="flex gap-3">
                  {recog.processed_image && <img src={recog.processed_image} alt="Preprocessed capture" className="h-20 w-20 shrink-0 rounded-lg border border-white/10 bg-white object-contain" />}
                  {recog.molecule ? <div className="mol-svg h-20 w-20 shrink-0" dangerouslySetInnerHTML={{ __html: recog.molecule.svg }} /> : null}
                  <div className="min-w-0 space-y-0.5 text-xs text-slate-400">
                    {recog.raw_smiles !== undefined && <div className="truncate">SMILES: <span className="font-mono text-cyan-200">{recog.smiles ?? recog.raw_smiles}</span></div>}
                    {recog.molecule && <div>Formula: <span className="text-slate-200">{recog.molecule.formula}</span>{recog.molecule.name && <> · <span className="text-slate-200">{recog.molecule.name}</span></>}</div>}
                    {recog.confidence != null && <div>Confidence: <span className="text-slate-200">{(recog.confidence * 100).toFixed(1)}%</span> (model-reported)</div>}
                    {recog.method && <div>Method: <span className="text-slate-300">{recog.method}</span>{recog.seconds != null && ` · ${recog.seconds}s`}</div>}
                  </div>
                </div>
                <p className="text-xs text-slate-400">{recog.message}</p>
                {recog.status === 'suggested' && recog.suggestions && recog.suggestions.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    Other similar:
                    {recog.suggestions.slice(1).map((s) => (
                      <button key={s.smiles} className="chip" onClick={() => loadMolecule(s.smiles, 'scan')}>{s.name} · {(s.similarity * 100).toFixed(0)}%</button>
                    ))}
                  </div>
                )}
                {recog.molecule && <button className="btn-primary w-full" onClick={confirmScan}><CheckCircle2 size={15} /> {recog.status === 'suggested' ? `Use ${recog.molecule.name ?? 'closest match'}` : 'Confirm & visualise'}</button>}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-2 border-t border-white/5 pt-3">
            <div className="panel-title"><Wand2 size={14} /> SMILES input</div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (smilesInput.trim()) loadMolecule(smilesInput, recog?.smiles === smilesInput ? 'scan' : 'manual') }}>
              <input className="input" value={smilesInput} onChange={(e) => setSmilesInput(e.target.value)} placeholder="e.g. CCO or c1ccccc1" spellCheck={false} />
              <button className="btn-ghost shrink-0" disabled={loadingMol}>{loadingMol ? <Loader2 size={15} className="animate-spin" /> : 'Build'}</button>
            </form>
            {molError && <p className="text-xs text-rose-300">{molError}</p>}
          </div>

          <div className="space-y-2 border-t border-white/5 pt-3">
            <div className="panel-title text-violet-300/90"><Sparkles size={14} /> Demo mode <span className="normal-case tracking-normal text-slate-500">(not webcam recognition)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {samples.map((s) => <button key={s.smiles} className="chip" onClick={() => loadMolecule(s.smiles, 'demo')}>{s.name}</button>)}
            </div>
          </div>
        </section>

        {/* CENTER: AR viewer */}
        <section className="glass relative flex min-h-[520px] flex-col overflow-hidden p-0">
          <div className="absolute inset-0">
            {showCam && cam.stream && <Video stream={cam.stream} className="h-full w-full object-cover opacity-55" />}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/70" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(34,227,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,227,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
          </div>
          <div className="relative z-10 flex items-center justify-between p-3">
            <div className="panel-title"><Orbit size={14} /> AR-style molecular overlay</div>
            {current && <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${SOURCE_BADGE[source]}`}>{source === 'scan' ? 'From webcam scan' : source === 'demo' ? 'Demo molecule' : source === 'reaction' ? 'Reaction product' : 'Manual SMILES'}</span>}
          </div>
          <div className="relative z-10 flex-1">
            <AnimatePresence mode="wait">
              {current ? (
                <motion.div key={current.smiles + dragKey} drag dragControls={drag} dragListener={false} dragMomentum={false}
                  initial={{ opacity: 0, scale: 0.6, filter: 'blur(8px)' }} animate={{ opacity: 1, scale, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 90, damping: 16 }} className="absolute inset-0">
                  <div className="absolute inset-8 rounded-full bg-[radial-gradient(circle,rgba(34,227,255,0.12),transparent_65%)]" />
                  <MolViewer molblock={current.molblock} labels={labels} spin={spin} renderStyle={renderStyle} />
                  <button onPointerDown={(e) => drag.start(e)} className="absolute left-1/2 top-2 -translate-x-1/2 cursor-grab rounded-full border border-white/15 bg-slate-900/70 p-1.5 text-slate-300 active:cursor-grabbing" title="Drag to reposition"><Move size={14} /></button>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center p-6 text-center">
                  <div className="space-y-3">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 18, ease: 'linear' }}><Atom size={64} className="mx-auto text-cyan-300/60" /></motion.div>
                    <div className="font-display text-xl text-white">Scan a drawing to begin</div>
                    <div className="text-sm text-slate-400">or choose a demo molecule / type a SMILES string</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {loadingMol && <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/40"><span className="flex items-center gap-2 text-cyan-200"><Loader2 className="animate-spin" /> Generating 3D conformer…</span></div>}
          </div>
          {current && (
            <div className="relative z-10 m-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-2 text-xs backdrop-blur">
              <div className="mr-auto pl-1">
                <div className="font-display text-lg font-bold leading-tight text-white">{displayName(current)}</div>
                <div className="font-mono text-cyan-300">{current.formula}</div>
              </div>
              <button className={`btn-ghost !px-2.5 !py-1.5 ${labels ? '!border-cyan-300/50 !text-cyan-200' : ''}`} onClick={() => setLabels(!labels)}><Tag size={14} /> Labels</button>
              <button className={`btn-ghost !px-2.5 !py-1.5 ${spin ? '!border-cyan-300/50 !text-cyan-200' : ''}`} onClick={() => setSpin(!spin)}><Orbit size={14} /> Spin</button>
              <select className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-slate-200" value={renderStyle} onChange={(e) => setRenderStyle(e.target.value as RenderStyle)}>
                <option value="ballstick">Ball &amp; stick</option><option value="spacefill">Space-filling</option><option value="stick">Sticks</option>
              </select>
              <label className="flex items-center gap-1.5 text-slate-400">Scale<input type="range" min={0.5} max={1.8} step={0.05} value={scale} onChange={(e) => setScale(+e.target.value)} className="w-20 accent-cyan-400" /></label>
              <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => setShowCam(!showCam)} title="Toggle camera backdrop">{showCam ? <Eye size={14} /> : <EyeOff size={14} />}</button>
              <button className="btn-ghost !px-2.5 !py-1.5" onClick={() => { setScale(1); setDragKey((k) => k + 1) }} title="Reset position"><RotateCcw size={14} /></button>
              <button className="btn-primary !px-3 !py-1.5" onClick={() => save(current, source)}><Save size={14} /> Save</button>
            </div>
          )}
          <div className="relative z-10 -mt-1 pb-2 text-center text-[10px] text-slate-500">Drag to rotate · scroll to zoom · handle to move</div>
        </section>

        {/* RIGHT: info + inventory */}
        <aside className="flex flex-col gap-4">
          <section className="glass p-4">
            <div className="panel-title mb-3"><FlaskRound size={14} /> Molecule intelligence</div>
            {current ? (
              <div className="space-y-2.5 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Name" value={current.iupac ?? 'Not in curated library'} />
                  <Stat label="Formula" value={current.formula} mono />
                  <Stat label="Mol. weight" value={`${current.molecular_weight.toFixed(2)} g/mol`} />
                  <Stat label="Heavy atoms" value={String(current.heavy_atoms)} />
                </div>
                <div><div className="text-[11px] uppercase tracking-wider text-slate-500">Functional groups</div>
                  <div className="mt-1 flex flex-wrap gap-1">{current.functional_groups.map((g) => <span key={g} className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs text-violet-200">{g}</span>)}</div></div>
                <Block label="Geometry" text={current.geometry} />
                <Block label="Applications" text={current.applications} />
                <div className="text-[10px] text-slate-500">SMILES <span className="font-mono text-slate-400">{current.smiles}</span> · {current.conformer_method}</div>
              </div>
            ) : <p className="text-sm text-slate-500">No molecule loaded yet.</p>}
          </section>

          <section className="glass flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="panel-title"><Atom size={14} /> Inventory ({inventory.length})</div>
              <span className="text-[11px] text-slate-500">select 2 to react</span>
            </div>
            {inventory.length === 0 && <p className="text-sm text-slate-500">Save molecules here to combine them in the reaction chamber.</p>}
            <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1">
              <AnimatePresence>
                {inventory.map((it) => {
                  const sel = selectedIds.includes(it.id)
                  return (
                    <motion.div layout key={it.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                      className={`rounded-xl border p-2 transition ${sel ? 'border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_20px_-6px_rgba(34,227,255,0.8)]' : 'border-white/10 bg-white/[0.03]'}`}>
                      <button className="mol-svg block h-20 w-full" onClick={() => loadMolecule(it.smiles, it.source)} title="View in AR" dangerouslySetInnerHTML={{ __html: it.svg }} />
                      <div className="truncate text-sm font-medium text-slate-100">{it.name}</div>
                      <div className="flex items-center justify-between font-mono text-[11px] text-cyan-300"><span>{it.formula}</span><span className={`rounded border px-1 font-sans text-[9px] uppercase ${SOURCE_BADGE[it.source]}`}>{it.source}</span></div>
                      <div className="mt-1.5 flex gap-1">
                        <button className={`flex-1 rounded-md px-2 py-1 text-xs ${sel ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`} onClick={() => toggleSelect(it.id)}>{sel ? 'Selected' : 'Select'}</button>
                        <button className="rounded-md bg-white/5 px-2 py-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300" title="Remove" aria-label={`Remove ${it.name}`}
                          onClick={() => { setInventory((inv) => inv.filter((x) => x.id !== it.id)); setSelectedIds((s) => s.filter((x) => x !== it.id)) }}><Trash2 size={13} /></button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </section>
        </aside>
      </main>

      <ReactionPanel selected={selected} onSaveProduct={(m) => save(m, 'reaction')} onInspect={(m) => { setCurrent(m); setSource('reaction') }} />

      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-cyan-300/30 bg-slate-900/90 px-4 py-2 text-sm text-cyan-100 shadow-lg backdrop-blur">{toast}</motion.div>}
      </AnimatePresence>
    </div>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1.5"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className={`text-slate-100 ${mono ? 'font-mono text-cyan-200' : ''}`}>{value}</div></div>
}

function Block({ label, text }: { label: string; text: string }) {
  return <div><div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div><p className="mt-0.5 text-[13px] leading-relaxed text-slate-300">{text}</p></div>
}
