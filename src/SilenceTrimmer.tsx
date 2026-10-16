import { useEffect, useRef, useState } from "react";
import { api, media, time, type Project } from "./types";
import { Button, Modal } from "./ui";
type Analysis = { id: string; duration: number; pauses: { id: string; start: number; end: number; duration: number }[] };
export function SilenceTrimmer({ project, wave, close, refresh, notify }: { project: Project; wave: number[]; close: () => void; refresh: () => Promise<void>; notify: (s: string) => void }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null), [selected, setSelected] = useState<string[]>([]), [reduction, setReduction] = useState(65), [thresholdDb, setThreshold] = useState(-38), [minPause, setMinPause] = useState(0.3), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const analyze = async () => { setBusy(true); setError(""); try { const a = await api(`/projects/${project.id}/silence/analyze`, "POST", { thresholdDb, minPause }); setAnalysis(a); setSelected(a.pauses.map((p: any) => p.id)); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  useEffect(() => { void analyze(); }, [project.id]);
  const chosen = analysis?.pauses.filter(p => selected.includes(p.id)) || [], removed = chosen.reduce((sum, p) => sum + Math.max(0, p.duration - 0.12) * reduction / 100, 0);
  const apply = async () => { if (!analysis) return; setBusy(true); try { await api(`/projects/${project.id}/jobs`, "POST", { action: "trim", options: { analysisId: analysis.id, selectedPauses: selected, reduction } }); await refresh(); notify("Pause trimming started. Narration, scenes and cues will be retimed together."); close(); } catch (e: any) { setError(e.message); setBusy(false); } };
  return <Modal title="Trim pauses" onClose={close} wide><div className="modal-body form-stack">
    <p>Detected quiet regions are highlighted below. Spoken word boundaries stay protected, and joins use smooth crossfades of up to 20 ms.</p>
    <div className="silence-wave"><svg viewBox="0 0 1000 110" preserveAspectRatio="none" aria-label="Recording waveform">{wave.map((v, i) => <line key={i} x1={i / Math.max(1, wave.length - 1) * 1000} x2={i / Math.max(1, wave.length - 1) * 1000} y1={55 - Math.min(1, Math.abs(v)) * 50} y2={55 + Math.min(1, Math.abs(v)) * 50} stroke="#a6c6b5" strokeWidth="1.5" />)}</svg>{analysis?.pauses.map(p => <button key={p.id} className={selected.includes(p.id) ? "selected" : ""} style={{ left: `${p.start / analysis.duration * 100}%`, width: `${Math.max(0.2, p.duration / analysis.duration * 100)}%` }} title={`${p.start.toFixed(2)}–${p.end.toFixed(2)}s pause`} aria-label={`Pause ${p.start.toFixed(2)} to ${p.end.toFixed(2)} seconds`} aria-pressed={selected.includes(p.id)} onClick={() => { setSelected(s => s.includes(p.id) ? s.filter(id => id !== p.id) : [...s, p.id]); if (audio.current) audio.current.currentTime = Math.max(0, p.start - 0.3); }} />)}</div>
    <audio ref={audio} controls src={media(project, project.audio)} style={{ width: "100%" }} />
    <div className="form-grid"><label>Silence threshold (dB)<input aria-label="Silence threshold" type="number" min="-70" max="-15" value={thresholdDb} onChange={e => setThreshold(Number(e.target.value))} /></label><label>Minimum pause (seconds)<input aria-label="Minimum pause" type="number" min="0.1" max="5" step="0.05" value={minPause} onChange={e => setMinPause(Number(e.target.value))} /></label><Button disabled={busy} onClick={analyze}>{busy ? "Analyzing…" : "Analyze again"}</Button></div>
    <label>Pause reduction · {reduction}%<input aria-label="Pause reduction" type="range" min="0" max="100" step="5" value={reduction} onChange={e => setReduction(Number(e.target.value))} /></label>
    {analysis && <p>{selected.length} of {analysis.pauses.length} pauses selected · approximately {removed.toFixed(2)}s removed · recording {time(analysis.duration)}. Original media stays available in history.</p>}
    {error && <div className="notice error">{error}</div>}
  </div><footer><Button onClick={close}>Cancel</Button><Button primary disabled={busy || !selected.length || !reduction} onClick={apply}>Apply pause reduction</Button></footer></Modal>;
}
