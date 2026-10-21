import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, HardHat, ShieldCheck, Users, Video, WifiOff, MapPin, Clock3, Maximize2, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api, isDemoMode } from '../services/api';
import MetricCard from '../components/MetricCard';
import SectionHeader from '../components/SectionHeader';
import SeverityBadge from '../components/SeverityBadge';

export default function Dashboard({ onViewIncidents }) {
  const [summary, setSummary] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [zones, setZones] = useState([]);
  const [trend, setTrend] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getDashboardSummary(), api.getIncidents(), api.getZones(), api.getSafetyTrend()])
      .then(([s, i, z, t]) => { setSummary(s); setIncidents(i); setZones(z); setTrend(t); })
      .catch(() => setError('Could not load dashboard data. Check the API connection.'));
  }, []);

  if (!summary) return <div className="loading-panel">{error || 'Loading safety overview...'}</div>;

  return (
    <div className="dashboard-stack">
      {isDemoMode && <div className="demo-notice"><span className="notice-mark">i</span><div><strong>Sample data is being displayed</strong><span>Metrics and incidents below are fixtures for interface development, not live site measurements.</span></div><span className="demo-notice-tag">DEVELOPMENT</span></div>}
      <div className="metric-grid">
        <MetricCard label="Safety score" value={summary.safetyScore} suffix="/100" note="vs previous period" change={summary.scoreChange} icon={ShieldCheck} tone="green"/>
        <MetricCard label="Workers on site" value={summary.workersOnSite} note="Detected in current shift" icon={Users} tone="blue"/>
        <MetricCard label="Active alerts" value={summary.activeAlerts} note="Require review" icon={AlertTriangle} tone="red"/>
        <MetricCard label="PPE compliance" value={summary.ppeCompliance} suffix="%" note="vs previous period" change={summary.complianceChange} icon={HardHat} tone="amber"/>
      </div>

      <div className="primary-grid">
        <section className="panel camera-panel">
          <SectionHeader title="Camera monitoring" subtitle="Assembly line · Camera 01" action={<span className="camera-status"><i/> SOURCE PREVIEW</span>}/>
          <div className="camera-view">
            <div className="camera-grid-lines"/>
            <div className="camera-placeholder">
              <div className="camera-placeholder-icon"><Video size={30}/></div>
              <strong>Camera feed not connected</strong>
              <span>Connect a camera source or load a test clip to display video here.</span>
              <button className="button button-secondary" onClick={() => window.alert('Camera input will be connected when the AI pipeline endpoint is ready.')}>Configure source</button>
            </div>
            <div className="camera-overlay camera-label"><span className="record-dot"/> CAMERA 01 <b>PREVIEW</b></div>
            <div className="camera-overlay camera-time"><Clock3 size={13}/> Awaiting feed</div>
            <div className="camera-bottom-label"><MapPin size={13}/> Assembly line / Zone A</div>
          </div>
          <div className="camera-footer"><span><span className="status-square neutral"/> Input unavailable</span><span><WifiOff size={14}/> No stream connected</span><button className="text-button" onClick={() => window.alert('The live stream requires an available camera or video-processing endpoint.')}>Connection details <ArrowRight size={14}/></button></div>
        </section>

        <section className="panel trend-panel">
          <SectionHeader title="Safety score trend" subtitle="Last 7 days · Sample data"/>
          <div className="chart-summary"><strong>{summary.safetyScore}<small>/100</small></strong><span className="trend-caption"><span className="trend-key"/> Safety score</span></div>
          <div className="trend-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 12, right: 4, left: -22, bottom: 0 }}>
                <defs><linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16856a" stopOpacity={0.18}/><stop offset="100%" stopColor="#16856a" stopOpacity={0.01}/></linearGradient></defs>
                <CartesianGrid stroke="#e8edf0" strokeDasharray="3 4" vertical={false}/>
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#77838d', fontSize: 11 }}/>
                <YAxis domain={[70, 100]} tickLine={false} axisLine={false} tick={{ fill: '#77838d', fontSize: 11 }}/>
                <Tooltip contentStyle={{ border: '1px solid #dce3e7', borderRadius: 4, fontSize: 12 }} />
                <Area type="monotone" dataKey="score" name="Safety score" stroke="#16856a" strokeWidth={2.2} fill="url(#scoreFill)" activeDot={{ r: 4, fill: '#16856a' }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-footnote"><span className="chart-footnote-dot"/> Trend values are illustrative</div>
        </section>
      </div>

      <div className="secondary-grid">
        <section className="panel violations-panel">
          <SectionHeader title="Current violations" subtitle="Most recent detected events" action={<button className="text-button" onClick={onViewIncidents}>View all <ArrowRight size={14}/></button>}/>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>EVENT</th><th>LOCATION</th><th>TIME</th><th>SEVERITY</th></tr></thead>
              <tbody>{incidents.slice(0, 4).map((item) => <tr key={item.id}><td><strong className="event-title">{item.type}</strong><span className="event-id">{item.id}</span></td><td>{item.location}</td><td className="time-cell">{item.time}</td><td><SeverityBadge severity={item.severity}/></td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="panel zones-panel">
          <SectionHeader title="Worker & zone status" subtitle="Configured workplace areas"/>
          <div className="zone-list">{zones.map((zone) => <div className="zone-row" key={zone.code}>
            <div className="zone-symbol"><Activity size={17}/></div>
            <div className="zone-info"><strong>{zone.zone}</strong><small>{zone.code} <span>·</span> {zone.workers} workers</small><div className="risk-track"><span style={{ width: `${zone.risk}%` }} className={zone.risk >= 70 ? 'risk-high' : zone.risk >= 35 ? 'risk-medium' : 'risk-low'}/></div></div>
            <span className={`zone-state ${zone.status.toLowerCase().replace(/\s+/g, '-')}`}>{zone.status}</span>
          </div>)}</div>
          <div className="zone-note"><AlertTriangle size={14}/><span>Zone risk values are sample configuration data.</span></div>
        </section>
      </div>
      <div className="dashboard-last-note"><CheckCircle2 size={15}/><span>Interface components are prepared for API integration.</span><button className="text-button" onClick={() => window.location.reload()}><RefreshCw size={13}/> Refresh view</button></div>
    </div>
  );
}