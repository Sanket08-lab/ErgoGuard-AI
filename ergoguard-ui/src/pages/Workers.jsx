import { useEffect, useState } from 'react'
import { Search, Users, MapPin, ShieldCheck, AlertTriangle } from 'lucide-react'
import { api, getDataSource } from '../services/api'
import SeverityBadge from '../components/SeverityBadge'

export default function Workers() {
  const [query,setQuery] = useState('')
  const [sampleWorkers,setWorkers] = useState([])
  const [zones,setZones] = useState([])
  const [summary,setSummary] = useState(null)
  const [source,setSource] = useState('connecting')
  useEffect(() => { Promise.all([api.getWorkers(),api.getZones(),api.getSummary()]).then(([workerData,zoneData,summaryData])=>{setWorkers(workerData);setZones(zoneData);setSummary(summaryData);setSource(getDataSource())}).catch(console.error) }, [])
  const list = sampleWorkers.filter(w => `${w.id} ${w.name} ${w.zone} ${w.status}`.toLowerCase().includes(query.toLowerCase()))
  const atRisk = sampleWorkers.filter(w => ['Critical','High'].includes(w.risk)).length
  const compliant = sampleWorkers.length ? Math.round((sampleWorkers.filter(w=>w.status==='Compliant').length/sampleWorkers.length)*100) : null
  return <div className="page-content"><div className="welcome-row"><div><div className="eyebrow">WORKFORCE VISIBILITY</div><h1>Workers & zones</h1><p>Review worker status and workplace risk areas.</p></div><span className={`mode-chip ${source==='live'?'connected':'mock'}`}><i/>{source==='live'?'API CONNECTED':'DEMO DATA'}</span></div>
    <div className="incident-summary-grid"><div className="incident-summary"><div className="summary-icon blue"><Users/></div><div><small>Workers detected</small><strong>{summary?.workers ?? sampleWorkers.length}</strong><span>Latest detection frame</span></div></div><div className="incident-summary"><div className="summary-icon green"><ShieldCheck/></div><div><small>PPE compliance</small><strong>{summary?.ppeCompliance ?? (compliant === null ? '—' : `${compliant}%`)}{summary?.ppeCompliance != null?'%':''}</strong><span>Compliant workers</span></div></div><div className="incident-summary"><div className="summary-icon orange"><AlertTriangle/></div><div><small>At-risk workers</small><strong>{atRisk}</strong><span>High or critical risk</span></div></div><div className="incident-summary"><div className="summary-icon purple"><MapPin/></div><div><small>Monitored zones</small><strong>{zones.length}</strong><span>In latest frame</span></div></div></div>
    <section className="panel workers-panel"><div className="panel-heading"><div><h2>Worker status</h2><p>Sample identities are anonymized track IDs</p></div><span className="subtle-count">{list.length} workers</span></div><div className="table-filters"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search workers or zones…"/></div></div><div className="table-wrap"><table className="incident-table"><thead><tr><th>WORKER</th><th>ZONE</th><th>STATUS</th><th>RISK</th><th>LAST SEEN</th></tr></thead><tbody>{list.map(w=><tr key={w.id}><td><div className="incident-name"><div className="avatar small">{w.id.slice(-2)}</div><div><strong>{w.name}</strong><small>{w.id}</small></div></div></td><td>{w.zone}</td><td>{w.status}</td><td><SeverityBadge level={w.risk}/></td><td className="time-cell">{w.lastSeen}</td></tr>)}</tbody></table></div></section>
    <div className="privacy-banner"><div className="privacy-icon"><ShieldCheck size={19}/></div><div><strong>Privacy by design</strong><span>Use anonymous tracking IDs instead of identifying workers by name. Follow your workplace privacy and consent requirements.</span></div></div>
  </div>
}
