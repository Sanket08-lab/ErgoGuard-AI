import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export default function MetricCard({ label, value, suffix, note, change, icon: Icon, tone = 'blue' }) {
  const positive = Number(change) >= 0;
  return (
    <article className="metric-card">
      <div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.9}/></span></div>
      <div className="metric-value">{value}<small>{suffix}</small></div>
      <div className="metric-bottom">
        {change !== undefined && <span className={`metric-change ${positive ? 'positive' : 'negative'}`}>{positive ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {Math.abs(change)}%</span>}
        <span className="metric-note">{note}</span>
      </div>
    </article>
  );
}