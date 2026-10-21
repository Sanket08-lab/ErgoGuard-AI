import { ArrowUpRight, MoreHorizontal, ShieldAlert } from 'lucide-react'
import SeverityBadge from './SeverityBadge'

export default function IncidentTable({ incidents, compact = false, onSelect }) {
  const rows = compact ? incidents.slice(0, 5) : incidents
  return <div className="table-wrap"><table className="incident-table">
    <thead><tr><th>INCIDENT</th><th>LOCATION</th><th>SEVERITY</th><th>RISK SCORE</th><th>TIME DETECTED</th><th>STATUS</th><th></th></tr></thead>
    <tbody>{rows.map(item => <tr key={item.id} onClick={() => onSelect?.(item)} className="clickable-row">
      <td><div className="incident-name"><div className={`incident-type-icon ${(item.severity || '').toLowerCase()}`}><ShieldAlert size={16}/></div><div><strong>{item.type}</strong><small>{item.id} · {item.worker}</small></div></div></td>
      <td><span className="location-cell">{item.zone}</span></td>
      <td><SeverityBadge level={item.severity}/></td>
      <td><div className="score-cell">{Number.isFinite(item.score) ? <><span>{item.score}</span><div className="mini-track"><i style={{width: `${item.score}%`}}/></div></> : <span className="muted-cell">—</span>}</div></td>
      <td className="time-cell">{item.time}</td>
      <td><span className={`status-pill ${(item.status || '').toLowerCase()}`}><i/>{item.status}</span></td>
      <td><button className="icon-button" aria-label="Incident details" onClick={(e) => {e.stopPropagation(); onSelect?.(item)}}><ArrowUpRight size={16}/></button></td>
    </tr>)}</tbody>
  </table>{!rows.length && <div className="empty-state">No incidents match these filters.</div>}</div>
}
