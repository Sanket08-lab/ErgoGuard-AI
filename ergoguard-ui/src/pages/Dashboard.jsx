import { useEffect, useState } from 'react'
import { ShieldCheck, Users, AlertTriangle, HardHat, ArrowUpRight, Video, CircleCheck, Activity, ChevronRight, Zap } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api, getDataSource } from '../services/api'
import StatCard from '../components/StatCard'
import IncidentTable from '../components/IncidentTable'
import SeverityBadge from '../components/SeverityBadge'

export default function Dashboard({ onSelectIncident, setPage }) {
  const [summary, setSummary] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [trend, setTrend] = useState([])
  const [zones, setZones] = useState([])
  const [source, setSource] = useState('connecting')
  useEffect(() => {
    const load = () => Promise.all([api.getSummary(), api.getIncidents(), api.getTimeseries(), api.getZones()]).then(([s, i, t, z]) => {setSummary(s);setIncidents(i);setTrend(t);setZones(z);setSource(getDataSource())}).catch(console.error)
    load()
    const timer = window.setInterval(load, 8000)
    return () => window.clearInterval(timer)
  }, [])
  const s = summary || {workers:0,activeIncidents:0,criticalAlerts:0,dangerZoneIntrusions:0,ppeCompliance:null,change:{}}
  const isDemo = source !== 'live'
  return <div className="page-content">
    <div className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'}).toUpperCase()} <span className="live-dot"/> LATEST DETECTIONS</div><h1>Safety overview</h1><p>Here's what's happening across your facility right now.</p></div><div className="welcome-actions"><span className={`mode-chip ${isDemo ? 'mock' : 'connected'}`}><i/>{isDemo ? 'DEMO DATA' : 'API CONNECTED'}</span><button className="primary-btn" onClick={() => setPage('monitoring')}><Video size={16}/> Open live view</button></div></div>
    <div className="stats-grid">
      <StatCard label="Safety events" value={s.activeIncidents} icon={ShieldCheck} tone="green" note="in latest detection frame"/>
      <StatCard label="Workers detected" value={s.workers} icon={Users} tone="blue" note="in latest detection frame"/>
      <StatCard label="Critical alerts" value={s.criticalAlerts || 0} icon={AlertTriangle} tone="orange" note="requiring urgent attention"/>
      <StatCard label="PPE compliance" value={s.ppeCompliance ?? '—'} suffix={s.ppeCompliance == null ? '' : '%'} icon={HardHat} tone="purple" note="workers compliant"/>
    </div>
    <div className="dashboard-main-grid">
      <section className="panel score-panel">
        <div className="panel-heading"><div><h2>Detection activity</h2><p>{isDemo ? 'Illustrative sample history' : 'Safety events in the latest frame'}</p></div><span className="chart-note">{isDemo ? 'DEMO' : 'LIVE FRAME'}</span></div>
        <div className="chart-summary"><strong>{s.activeIncidents}<span> events</span></strong><span className="positive-label"><Activity size={15}/> {s.fps || 0} <small>FPS processing</small></span></div>
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{top:10,right:8,left:-24,bottom:0}}><defs><linearGradient id="safetyGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.24}/><stop offset="100%" stopColor="#2dd4bf" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#243044" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="time" tick={{fill:'#7e8da4',fontSize:11}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:'#7e8da4',fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#111c2d',border:'1px solid #29364b',borderRadius:10,color:'#e8eef8'}}/><Area type="monotone" dataKey="incidents" name="Safety events" stroke="#2dd4bf" strokeWidth={2.5} fill="url(#safetyGradient)" activeDot={{r:4,fill:'#2dd4bf'}}/></AreaChart></ResponsiveContainer></div>
        <div className="chart-footer"><span><i className="legend-dot teal"/> Safety events</span><span className="chart-note">{isDemo ? 'Sample timeline' : 'Latest detection snapshot'}</span></div>
      </section>
      <section className="panel camera-card">
        <div className="panel-heading"><div><h2>Camera preview</h2><p>Connect a browser camera to view a live stream</p></div><span className="camera-live offline"><i/> STANDBY</span></div>
        <div className="camera-preview"><div className="camera-grid"/><div className="camera-scanline"/><div className="camera-overlay-top"><span>CAM-01</span><span>REC <i/></span></div><div className="camera-placeholder"><div className="camera-symbol"><Video size={27}/></div><strong>Camera ready</strong><span>Open live monitoring to enable webcam</span><button onClick={() => setPage('monitoring')}>Connect camera <ChevronRight size={14}/></button></div><div className="camera-overlay-bottom"><span><i className="live-dot"/> 1080p · 24 FPS</span><span>LOCAL PROCESSING</span></div></div>
        <div className="camera-stats"><div><span>Workers detected</span><strong>{s.workers}</strong></div><div><span>Safety events</span><strong className="text-orange">{s.activeIncidents}</strong></div><div><span>Zone status</span><strong className={s.dangerZoneIntrusions ? 'text-orange' : 'text-green'}>{s.dangerZoneIntrusions ? 'Attention' : 'Clear'}</strong></div></div>
      </section>
    </div>
    <div className="lower-grid">
      <section className="panel incidents-panel"><div className="panel-heading"><div><h2>Recent incidents</h2><p>Latest safety events detected by the system</p></div><button className="text-btn" onClick={() => setPage('incidents')}>View all <ArrowUpRight size={15}/></button></div><IncidentTable incidents={incidents} compact onSelect={onSelectIncident}/></section>
      <section className="panel zones-panel"><div className="panel-heading"><div><h2>Safety zones</h2><p>Occupancy in the latest detection frame</p></div><button className="icon-button" onClick={() => setPage('workers')}><ArrowUpRight size={16}/></button></div>
        {zones.slice(0,4).map((zone) => {const occupancy=zone.occupancy??0;const score=Number.isFinite(zone.risk)?zone.risk:null;return <div className="zone-row" key={zone.zoneId || zone.zone}><div className="zone-info"><span className={`zone-marker ${(zone.severity || 'low').toLowerCase()}`}/><div><strong>{zone.zone}</strong><small>{score===null?`${zone.severity || 'Monitored'} · ${occupancy} workers inside`:`${score}/100 sample risk · ${zone.incidents} sample incidents`}</small></div><b>{score===null?occupancy:score}<small>{score===null?' inside':'/100'}</small></b></div><div className="zone-track"><i className={(zone.severity || 'low').toLowerCase()} style={{width:`${score??(occupancy?100:0)}%`}}/></div></div>})}
        {!zones.length && <div className="empty-state">No safety zones in the latest frame.</div>}
      </section>
    </div>
    <div className="privacy-banner"><div className="privacy-icon"><ShieldCheck size={19}/></div><div><strong>Privacy-first safety monitoring</strong><span>Video is processed locally in your browser. Only incident metadata is intended to sync to the server.</span></div><span className="privacy-status"><i/> ON-DEVICE AI</span></div>
  </div>
}
