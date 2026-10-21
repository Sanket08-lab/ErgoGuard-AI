import { X, Clock3, MapPin, UserRound, ShieldAlert, Activity } from 'lucide-react'
import SeverityBadge from './SeverityBadge'
export default function IncidentDetail({ incident, onClose }) {
  if (!incident) return null
  return <div className="modal-backdrop" onClick={onClose}><section className="detail-panel" onClick={e => e.stopPropagation()}>
    <div className="detail-head"><div><span className="eyebrow">INCIDENT DETAILS</span><h2>{incident.type}</h2><small>{incident.id}</small></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="detail-score"><div><span>Risk score</span><strong>{Number.isFinite(incident.score) ? <>{incident.score}<small>/100</small></> : 'Not provided'}</strong></div><SeverityBadge level={incident.severity}/>{Number.isFinite(incident.score) && <div className="detail-score-track"><i style={{width:`${incident.score}%`}}/></div>}</div>
    <h3>Incident information</h3>
    <div className="detail-list"><div><UserRound/><span>Worker</span><strong>{incident.worker}</strong></div><div><MapPin/><span>Zone</span><strong>{incident.zone}</strong></div><div><Clock3/><span>Detected at</span><strong>{incident.time}</strong></div><div><Activity/><span>Duration</span><strong>{incident.duration}</strong></div><div><ShieldAlert/><span>Status</span><strong>{incident.status}</strong></div></div>
    <div className="evidence-box"><div className="evidence-title"><ShieldAlert size={17}/> Detection evidence</div><p>{incident.message || 'Event reported by the latest detection frame.'}</p><div className="evidence-metrics"><span>Camera<strong>{incident.id?.split('-')[0] || '—'}</strong></span><span>Track ID<strong>{incident.trackId == null ? '—' : `WK-${String(incident.trackId).padStart(3, '0')}`}</strong></span></div></div>
    <button className="primary-btn full-width" onClick={onClose}>Close incident details</button>
  </section></div>
}
