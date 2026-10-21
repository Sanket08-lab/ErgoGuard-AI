import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, HardHat, ShieldCheck, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { api } from '../services/api';
import SectionHeader from '../components/SectionHeader';

export default function Analytics() {
  const [safety, setSafety] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  useEffect(() => {
    Promise.all([api.getSafetyTrend(), api.getIncidentTrend(), api.getViolationBreakdown()])
      .then(([s, i, b]) => { setSafety(s); setIncidents(i); setBreakdown(b); }).catch(console.error);
  }, []);

  return <div className="dashboard-stack">
    <div className="demo-notice"><span className="notice-mark">i</span><div><strong>Analytics use sample data</strong><span>Replace the demo fixtures with validated incident records before using these charts for operational decisions.</span></div><span className="demo-notice-tag">DEVELOPMENT</span></div>
    <div className="analytics-kpis">
      <div className="analytics-kpi"><div><span>Current safety score</span><ShieldCheck size={18}/></div><strong>92 <small>/100</small></strong><span className="kpi-foot"><ArrowUpRight size={14}/> Sample trend: +2.1%</span></div>
      <div className="analytics-kpi"><div><span>PPE compliance</span><HardHat size={18}/></div><strong>96.4<small>%</small></strong><span className="kpi-foot"><ArrowUpRight size={14}/> Sample trend: +1.3%</span></div>
      <div className="analytics-kpi"><div><span>Incident categories</span><AlertTriangle size={18}/></div><strong>{breakdown.length}<small> types</small></strong><span className="kpi-foot muted-kpi">Illustrative breakdown</span></div>
      <div className="analytics-kpi"><div><span>Reporting period</span><TrendingUp size={18}/></div><strong>7 <small>days</small></strong><span className="kpi-foot muted-kpi">Demo reporting window</span></div>
    </div>
    <div className="analytics-grid">
      <section className="panel analytics-chart-panel"><SectionHeader title="Safety score and compliance" subtitle="Daily trend, sample values"/><div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={safety} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#e8edf0" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#77838d', fontSize: 11 }}/><YAxis domain={[70,100]} tickLine={false} axisLine={false} tick={{ fill: '#77838d', fontSize: 11 }}/><Tooltip contentStyle={{ border: '1px solid #dce3e7', borderRadius: 4, fontSize: 12 }}/><Legend/><Area type="monotone" dataKey="score" name="Safety score" stroke="#16856a" fill="#16856a" fillOpacity={0.08} strokeWidth={2}/><Area type="monotone" dataKey="compliance" name="PPE compliance" stroke="#326b9a" fill="#326b9a" fillOpacity={0.04} strokeWidth={2}/></AreaChart></ResponsiveContainer></div></section>
      <section className="panel analytics-chart-panel"><SectionHeader title="Incidents over time" subtitle="Grouped by severity, sample values"/><div className="analytics-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={incidents} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid stroke="#e8edf0" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#77838d', fontSize: 11 }}/><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#77838d', fontSize: 11 }}/><Tooltip contentStyle={{ border: '1px solid #dce3e7', borderRadius: 4, fontSize: 12 }}/><Legend/><Bar dataKey="critical" name="Critical" fill="#b63c35" radius={[2,2,0,0]}/><Bar dataKey="high" name="High" fill="#c87927" radius={[2,2,0,0]}/><Bar dataKey="medium" name="Medium" fill="#326b9a" radius={[2,2,0,0]}/></BarChart></ResponsiveContainer></div></section>
    </div>
    <section className="panel breakdown-panel"><SectionHeader title="Violation category breakdown" subtitle="Illustrative distribution, not live site measurements"/><div className="breakdown-list">{breakdown.map(item => <div className="breakdown-row" key={item.name}><span>{item.name}</span><div className="breakdown-track"><span style={{width: `${item.value}%`}}/></div><strong>{item.value}%</strong></div>)}</div></section>
  </div>;
}