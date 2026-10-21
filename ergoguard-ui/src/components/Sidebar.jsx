import { ShieldCheck, LayoutDashboard, Video, ClipboardList, ChartNoAxesCombined, Users, Settings, ChevronLeft, Activity } from 'lucide-react'

const links = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'monitoring', label: 'Live monitoring', icon: Video, badge: 'LIVE' },
  { id: 'incidents', label: 'Incidents', icon: ClipboardList },
  { id: 'analytics', label: 'Analytics & reports', icon: ChartNoAxesCombined },
  { id: 'workers', label: 'Workers & zones', icon: Users },
]

export default function Sidebar({ page, setPage, open, setOpen }) {
  return <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
    <div className="brand">
      <div className="brand-mark"><ShieldCheck size={23} strokeWidth={2.5} /></div>
      <div><div className="brand-name">ErgoGuard<span>AI</span></div><div className="brand-sub">SAFETY INTELLIGENCE</div></div>
      <button className="collapse-btn" onClick={() => setOpen(false)} aria-label="Close menu"><ChevronLeft size={18}/></button>
    </div>
    <div className="site-select"><div className="site-dot"/><div><small>WORKSPACE</small><strong>Plant 01 · Main floor</strong></div><span className="site-chevron">⌄</span></div>
    <div className="nav-label">WORKSPACE</div>
    <nav>{links.map(({ id, label, icon: Icon, badge }) => <button key={id} onClick={() => {setPage(id); setOpen(false)}} className={`nav-item ${page === id ? 'active' : ''}`}><Icon size={18}/><span>{label}</span>{badge && <b className={badge === 'LIVE' ? 'live-badge' : 'nav-count'}>{badge}</b>}</button>)}</nav>
    <div className="sidebar-bottom">
      <div className="system-card"><div className="system-icon"><Activity size={16}/></div><div><strong>Dashboard ready</strong><small>API or demo data</small></div><i/></div>
      <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings size={18}/><span>Settings</span></button>
      <div className="profile"><div className="avatar">OS</div><div className="profile-text"><strong>Safety Admin</strong><small>Administrator</small></div><span className="more">···</span></div>
    </div>
  </aside>
}
