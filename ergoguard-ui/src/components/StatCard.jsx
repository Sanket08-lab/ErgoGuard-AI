import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
export default function StatCard({ label, value, suffix = '', change, positive = true, icon: Icon, tone = 'blue', note }) {
  return <div className="stat-card">
    <div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon size={19}/></div></div>
    <div className="stat-value">{value}<small>{suffix}</small></div>
    <div className="stat-bottom">{change !== undefined && <span className={`trend ${positive ? 'good' : 'bad'}`}>{positive ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {change}%</span>}<span>{note || 'vs. previous shift'}</span></div>
  </div>
}