import { useEffect, useMemo, useState } from 'react'
import { Download, Search, SlidersHorizontal, FileWarning, ArrowDownToLine } from 'lucide-react'
import { api } from '../services/api'
import IncidentTable from '../components/IncidentTable'

export default function Incidents({ onSelectIncident }) {
  const [incidents, setIncidents] = useState([])
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('All severities')
  const [status, setStatus] = useState('All statuses')
  useEffect(() => { api.getIncidents().then(setIncidents).catch(console.error) }, [])
  const filtered = useMemo(() => incidents.filter(i => `${i.id} ${i.type} ${i.worker} ${i.zone}`.toLowerCase().includes(query.toLowerCase()) && (severity === 'All severities' || i.severity === severity) && (status === 'All statuses' || i.status === status)), [incidents,query,severity,status])
  const exportCsv = () => {
    const cols = ['id','type','worker','zone','severity','score','time','status','duration']
    const csv = [cols.join(','), ...filtered.map(row => cols.map(c => `"${String(row[c] ?? '').replaceAll('"','""')}"`).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
    const a = document.createElement('a'); a.href=url; a.download='ergoguard-incidents.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const active = incidents.filter(i=>i.status==='Active').length
  return <div className="page-content"><div className="welcome-row"><div><div className="eyebrow">SAFETY EVENT MANAGEMENT</div><h1>Incidents</h1><p>Review, filter and investigate detected safety events.</p></div><button className="secondary-btn" onClick={exportCsv}><Download size={16}/> Export CSV</button></div>
    <div className="incident-summary-grid"><div className="incident-summary"><div className="summary-icon red"><FileWarning/></div><div><small>Detected events</small><strong>{incidents.length}</strong><span>Current detection feed</span></div></div><div className="incident-summary"><div className="summary-icon orange"><SlidersHorizontal/></div><div><small>Active events</small><strong>{active}</strong><span>In latest frame</span></div></div><div className="incident-summary"><div className="summary-icon purple"><FileWarning/></div><div><small>Critical events</small><strong>{incidents.filter(i=>i.severity==='Critical').length}</strong><span>Highest severity</span></div></div><div className="incident-summary"><div className="summary-icon green"><ArrowDownToLine/></div><div><small>Resolved</small><strong>{incidents.filter(i=>i.status==='Resolved').length}</strong><span>Not tracked in latest frame</span></div></div></div>
    <section className="panel incidents-page-panel"><div className="panel-heading"><div><h2>Incident log</h2><p>{filtered.length} records found</p></div><span className="subtle-count">Auto-refresh ready</span></div><div className="table-filters"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search incidents, workers, zones…"/></div><select value={severity} onChange={e=>setSeverity(e.target.value)}><option>All severities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option><option>Active</option><option>Resolved</option></select></div><IncidentTable incidents={filtered} onSelect={onSelectIncident}/></section>
  </div>
}
