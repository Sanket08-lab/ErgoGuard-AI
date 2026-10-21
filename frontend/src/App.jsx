import { useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Bell, Camera, ChevronDown, CircleHelp, ClipboardList, HardHat, LayoutDashboard, Menu, Search, Settings, ShieldCheck, Users, X } from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Incidents from './pages/Incidents.jsx';
import Analytics from './pages/Analytics.jsx';

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'incidents', label: 'Incidents', icon: ClipboardList, count: '3' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);

  const titles = {
    dashboard: ['Safety overview', 'Monitor current site conditions and active safety events.'],
    incidents: ['Incident management', 'Review, prioritize, and track reported safety events.'],
    analytics: ['Safety analytics', 'Review trends across the selected demo reporting period.'],
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={22} strokeWidth={2.1} /></div>
          <div className="brand-copy"><strong>ErgoGuard<span> AI</span></strong><small>WORKPLACE SAFETY</small></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button>
        </div>
        <div className="site-selector">
          <div className="site-dot" />
          <div><small>ACTIVE SITE</small><strong>Plant 01 · Assembly</strong></div>
          <ChevronDown size={16} className="muted-icon" />
        </div>
        <div className="nav-label">MONITORING</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMobileNav(false); }}>
              <Icon size={18} strokeWidth={1.8}/><span>{label}</span>{count && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label secondary-label">SYSTEM</div>
        <button className="nav-item" onClick={() => window.alert('Camera settings will be available when the camera API is connected.')}><Camera size={18}/><span>Camera sources</span></button>
        <button className="nav-item" onClick={() => window.alert('Settings will be available in a later build.')}><Settings size={18}/><span>Settings</span></button>
        <div className="sidebar-bottom">
          <div className="connection-card"><span className="connection-indicator" /><div><strong>Demo environment</strong><small>Using sample JSON data</small></div></div>
          <div className="sidebar-footer"><CircleHelp size={15}/><span>Help & documentation</span></div>
          <div className="user-card"><div className="user-avatar">SO</div><div className="user-details"><strong>Safety Operator</strong><small>Site monitoring</small></div><button className="icon-button" aria-label="User options" onClick={() => window.alert('User account integration is not configured yet.')}><ChevronDown size={16}/></button></div>
        </div>
      </aside>

      {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button>
          <div className="breadcrumb"><span>Operations</span><span className="breadcrumb-slash">/</span><strong>{titles[page][0]}</strong></div>
          <div className="topbar-actions">
            <div className="demo-badge"><span /> DEMO DATA</div>
            <button className="icon-button top-search" aria-label="Search" onClick={() => window.alert('Search will be enabled after API integration.')}><Search size={18}/></button>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setPage('incidents')}><Bell size={18}/><i /></button>
          </div>
        </header>
        <section className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow">SAFETY OPERATIONS <span className="eyebrow-line" /></div><h1>{titles[page][0]}</h1><p>{titles[page][1]}</p></div>
            <div className="heading-meta"><span className="live-dot" /> Sample environment <span className="meta-divider" /> <span>Plant 01</span></div>
          </div>
          {page === 'dashboard' && <Dashboard onViewIncidents={() => setPage('incidents')} />}
          {page === 'incidents' && <Incidents />}
          {page === 'analytics' && <Analytics />}
          <footer className="page-footer"><span>ErgoGuard AI <b>·</b> Workplace safety monitoring</span><span>Prototype interface <b>·</b> Sample data only</span></footer>
        </section>
      </main>
    </div>
  );
}