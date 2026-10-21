import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Camera, ShieldCheck, Users, AlertTriangle, Maximize2, Scan, CircleStop, RefreshCw } from 'lucide-react'
import { api, getDataSource } from '../services/api'
import SeverityBadge from '../components/SeverityBadge'

export default function Monitoring() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [workers, setWorkers] = useState([])
  const [summary, setSummary] = useState(null)
  const [source, setSource] = useState('connecting')
  useEffect(() => { Promise.all([api.getWorkers(), api.getSummary()]).then(([workerData, summaryData]) => {setWorkers(workerData);setSummary(summaryData);setSource(getDataSource())}).catch(console.error) }, [])
  useEffect(() => { let timer; if (running) timer = setInterval(() => setElapsed(s => s + 1), 1000); return () => clearInterval(timer) }, [running])
  useEffect(() => () => streamRef.current?.getTracks().forEach(t => t.stop()), [])
  const startCamera = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera access requires localhost or an HTTPS website in a supported browser.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false})
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraEnabled(true)
    } catch { setError('Camera permission was denied or no camera was found. Check browser permissions and try again.') }
  }
  const stopCamera = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; if(videoRef.current) videoRef.current.srcObject = null; setCameraEnabled(false); setRunning(false) }
  const toggleMonitoring = async () => { if (!cameraEnabled) await startCamera(); else setRunning(v => !v) }
  const fmt = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`
  return <div className="page-content">
    <div className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> COMPUTER VISION · CAMERA 01</div><h1>Live monitoring</h1><p>Manage camera input and monitor the safety environment.</p></div><div className="welcome-actions"><span className={`mode-chip ${running ? 'connected' : 'mock'}`}><i/>{running ? 'MONITORING' : source==='live'?'API CONNECTED':'DEMO DATA'}</span><button className={running ? 'danger-btn' : 'primary-btn'} onClick={toggleMonitoring}>{running ? <CircleStop size={16}/> : <Video size={16}/>} {running ? 'Pause monitoring' : cameraEnabled ? 'Start monitoring' : 'Connect camera'}</button></div></div>
    <div className="monitor-layout"><section className="panel monitor-panel"><div className="panel-heading"><div><h2>Camera 01 — Main floor</h2><p>Local camera stream · No video upload</p></div><span className={`camera-live ${running ? '' : 'offline'}`}><i/> {running ? 'LIVE' : 'STANDBY'}</span></div>
      <div className="monitor-video"><video ref={videoRef} autoPlay playsInline muted className={cameraEnabled ? 'visible' : ''}/>{!cameraEnabled && <div className="camera-empty"><div className="camera-symbol"><Camera size={30}/></div><h3>Camera is not connected</h3><p>Connect your camera to preview the local video stream.</p><button className="primary-btn" onClick={startCamera}><Video size={16}/> Enable camera</button></div>}<div className="monitor-corner top-left">CAM-01 <span>1920 × 1080</span></div><div className="monitor-corner top-right">{running ? <><i className="live-dot"/> REC</> : 'NOT RECORDING'}</div>{running && <div className="demo-detection"><span>DEMO MODE</span><p>Camera stream active</p><small>AI models not connected</small></div>}<div className="monitor-corner bottom-left">LOCAL PROCESSING · {fmt(elapsed)}</div><button className="fullscreen-btn" onClick={() => videoRef.current?.requestFullscreen?.()}><Maximize2 size={16}/></button></div>
      {error && <div className="inline-error">{error}</div>}
      <div className="monitor-controls"><div className="monitor-control-status"><span className={`pulse ${running ? 'on' : ''}`}/><div><strong>{running ? 'Monitoring session active' : 'Ready to monitor'}</strong><small>{running ? 'Camera stream is being displayed locally' : 'No AI detections are running yet'}</small></div></div><div className="monitor-buttons">{cameraEnabled && <button className="secondary-btn" onClick={stopCamera}><VideoOff size={15}/> Disconnect</button>}{cameraEnabled && <button className="secondary-btn" onClick={() => {stopCamera();setTimeout(startCamera,100)}}><RefreshCw size={15}/> Reconnect</button>}</div></div>
    </section>
    <div className="monitor-side"><section className="panel"><div className="panel-heading"><div><h2>Latest detection snapshot</h2><p>From the ErgoGuard detection API</p></div><Scan size={18} className="muted-icon"/></div><div className="live-stat-list"><div><span><Users/> Workers detected</span><strong>{summary?.workers ?? workers.length}</strong></div><div><span><AlertTriangle/> Safety events</span><strong className="text-orange">{summary?.activeIncidents ?? 0}</strong></div><div><span><ShieldCheck/> PPE compliance</span><strong className="text-green">{summary?.ppeCompliance == null ? '—' : `${summary.ppeCompliance}%`}</strong></div></div><div className="demo-note">The browser camera preview is separate from the server-side AI detection feed.</div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Worker status</h2><p>Latest detection frame</p></div><span className="subtle-count">{workers.length}</span></div><div className="worker-status-list">{workers.map(w=><div className="worker-status" key={w.id}><div className="avatar small">{w.id.slice(-2)}</div><div className="worker-status-text"><strong>{w.name}</strong><small>{w.zone}</small></div><SeverityBadge level={w.risk}/></div>)}{!workers.length&&<div className="empty-state">No workers in the latest frame.</div>}</div><button className="text-btn full-width" onClick={() => window.dispatchEvent(new CustomEvent('ergoguard:navigate',{detail:'workers'}))}>View all workers →</button></section>
    </div></div>
  </div>
}
