import { useEffect, useMemo, useState } from 'react';
import { Download, Search, Filter, ClipboardList, AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { api } from '../services/api';
import SectionHeader from '../components/SectionHeader';
import SeverityBadge from '../components/SeverityBadge';

export default function Incidents() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('All severities');
  const [status, setStatus] = useState('All statuses');

  useEffect(() => { api.getIncidents().then(setItems).catch(console.error); }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const q = query.toLowerCase();
    return `${item.id} ${item.type} ${item.location} ${item.worker}`.toLowerCase().includes(q)
      && (severity === 'All severities' || item.severity === severity)
      && (status === 'All statuses' || item.status === status);
  }), [items, query, severity, status]);

  function exportCsv() {
    const headers = ['ID', 'Type', 'Location', 'Time', 'Severity', 'Status', 'Worker'];
    const rows = filtered.map(i => [i.id, i.type, i.location, i.time, i.severity, i.status, i.worker]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'ergoguard-incidents.csv'; link.click(); URL.revokeObjectURL(url);
  }

  const openCount = items.filter(i => i.status === 'Open').length;
  const reviewCount = items.filter(i => i.status === 'Review').length;
  const resolvedCount = items.filter(i => i.status === 'Resolved').length;

  return <div className="dashboard-stack">
    <div className="incident-summary-grid">
      <div className="mini-stat"><span className="mini-stat-icon red"><AlertTriangle size={18}/></span><div><small>Open incidents</small><strong>{openCount}</strong></div></div>
      <div className="mini-stat"><span className="mini-stat-icon amber"><Clock3 size={18}/></span><div><small>Under review</small><strong>{reviewCount}</strong></div></div>
      <div className="mini-stat"><span className="mini-stat-icon green"><CheckCircle2 size={18}/></span><div><small>Resolved</small><strong>{resolvedCount}</strong></div></div>
      <div className="mini-stat"><span className="mini-stat-icon blue"><ClipboardList size={18}/></span><div><small>Total records</small><strong>{items.length}</strong></div></div>
    </div>
    <section className="panel incident-table-panel">
      <SectionHeader title="Incident register" subtitle="Review the incident records currently available in the selected data source." action={<button className="button button-secondary" onClick={exportCsv}><Download size={15}/> Export CSV</button>}/>
      <div className="table-toolbar">
        <label className="search-field"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search incidents, zones, workers..." /></label>
        <label className="select-field"><Filter size={15}/><select value={severity} onChange={e => setSeverity(e.target.value)}><option>All severities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
        <label className="select-field"><select value={status} onChange={e => setStatus(e.target.value)}><option>All statuses</option><option>Open</option><option>Review</option><option>Resolved</option></select></label>
      </div>
      <div className="table-wrap">
        <table className="data-table incidents-table"><thead><tr><th>INCIDENT</th><th>LOCATION</th><th>WORKER REF.</th><th>TIME</th><th>SEVERITY</th><th>STATUS</th></tr></thead>
          <tbody>{filtered.map(item => <tr key={item.id}><td><strong className="event-title">{item.type}</strong><span className="event-id">{item.id}</span></td><td>{item.location}</td><td>{item.worker}</td><td className="time-cell">{item.time}</td><td><SeverityBadge severity={item.severity}/></td><td><span className={`status-text status-${item.status.toLowerCase()}`}>{item.status}</span></td></tr>)}
          {filtered.length === 0 && <tr><td colSpan="6" className="empty-state">No incidents match these filters.</td></tr>}</tbody>
        </table>
      </div>
      <div className="table-bottom"><span>Showing <strong>{filtered.length}</strong> of <strong>{items.length}</strong> records</span><span>Sample incident data</span></div>
    </section>
  </div>;
}