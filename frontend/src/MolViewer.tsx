import { useEffect, useRef } from 'react'
import * as $3Dmol from '3dmol'

export type RenderStyle = 'ballstick' | 'spacefill' | 'stick'

interface Props {
  molblock: string
  labels?: boolean
  spin?: boolean
  renderStyle?: RenderStyle
  className?: string
  zoom?: number
}

const STYLES: Record<RenderStyle, object> = {
  ballstick: { stick: { radius: 0.14, colorscheme: 'cyanCarbon' }, sphere: { scale: 0.27, colorscheme: 'cyanCarbon' } },
  spacefill: { sphere: { scale: 0.95, colorscheme: 'cyanCarbon' } },
  stick: { stick: { radius: 0.2, colorscheme: 'cyanCarbon' } },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function MolViewer({ molblock, labels = false, spin = false, renderStyle = 'ballstick', className = '', zoom = 0.9 }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewer = useRef<any>(null)

  useEffect(() => {
    const el = host.current!
    el.innerHTML = ''
    const v = (($3Dmol as any).createViewer)(el, { backgroundColor: 'black', backgroundAlpha: 0, antialias: true })
    v.setBackgroundColor(0x000000, 0)
    viewer.current = v
    const ro = new ResizeObserver(() => { v.resize(); v.render() })
    ro.observe(el)
    return () => { ro.disconnect(); try { v.clear() } catch { /* ignore */ } el.innerHTML = ''; viewer.current = null }
  }, [])

  useEffect(() => {
    const v = viewer.current
    if (!v || !molblock) return
    v.removeAllModels(); v.removeAllLabels()
    const model = v.addModel(molblock, 'sdf')
    v.setStyle({}, STYLES[renderStyle])
    if (labels) {
      for (const a of model.selectedAtoms({})) {
        v.addLabel(a.elem, {
          position: { x: a.x, y: a.y, z: a.z }, fontSize: a.elem === 'H' ? 10 : 13, fontColor: a.elem === 'H' ? '#cbd5e1' : 'white',
          backgroundColor: '#0b1020', backgroundOpacity: 0.55, borderThickness: 0, inFront: true, alignment: 'center',
        })
      }
    }
    v.zoomTo(); v.zoom(zoom); v.render()
  }, [molblock, labels, renderStyle, zoom])

  useEffect(() => {
    const v = viewer.current
    if (!v) return
    if (spin) v.spin('y', 0.6)
    else v.spin(false)
  }, [spin, molblock])

  return <div ref={host} className={`relative h-full w-full ${className}`} />
}
