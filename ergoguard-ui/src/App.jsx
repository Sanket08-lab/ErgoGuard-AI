import { lazy, Suspense, useEffect, useState } from 'react'
import { Bell, Search, Menu, ChevronDown, CircleHelp, Command } from 'lucide-react'
import Sidebar from './components/Sidebar'
import IncidentDetail from './components/IncidentDetail'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Monitoring = lazy(() => import('./pages/Monitoring'))
const Incidents = lazy(() => import('./pages/Incidents'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Workers = lazy(() => import('./pages/Workers'))
const Settings = lazy(() => import('./pages/Settings'))

const pageTitles = { dashboard:'Overview', monitoring:'Live monitoring', incidents:'Incidents', analytics:'Analytics & reports', workers:'Workers & zones', settings:'Settings' }

export default function App() {
  const [page,setPage] = useState('dashboard')
  const [sidebarOpen,setSidebarOpen] = useState(false)
  const [selectedIncident,setSelectedIncident] = useState(null)
  const [searchOpen,setSearchOpen] = useState(false)
  useEffect(()=>{const fn=e=>setPage(e.detail);window.addEventListener('ergoguard:navigate',fn);return()=>window.removeEventListener('ergoguard:navigate',fn)},[])
  useEffect(()=>{document.title=`${pageTitles[page] || 'Overview'} | ErgoGuard AI`},[page])
  const pageNode = {
    dashboard:<Dashboard onSelectIncident={setSelectedIncident} setPage={setPage}/>,
    monitoring:<Monitoring/>,
    incidents:<Incidents onSelectIncident={setSelectedIncident}/>,
    analytics:<Analytics/>,
    workers:<Workers/>,
    settings:<Settings/>
  }[page] || <Dashboard onSelectIncident={setSelectedIncident} setPage={setPage}/>
  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" onClick={()=>setSidebarOpen(false)} aria-label="Close navigation"/>}
    <Sidebar page={page} setPage={setPage} open={sidebarOpen} setOpen={setSidebarOpen}/>
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={()=>setSidebarOpen(true)}><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{pageTitles[page]}</strong></div></div><div className="topbar-right"><div className={`global-search ${searchOpen?'search-open':''}`}><Search size={16}/><input placeholder="Search anything…" onFocus={()=>setSearchOpen(true)} onBlur={()=>setTimeout(()=>setSearchOpen(false),180)} onKeyDown={e=>{if(e.key==='Enter'){const q=e.target.value.toLowerCase();setPage(q.includes('worker')||q.includes('zone')?'workers':q.includes('analytic')?'analytics':'incidents')}}}/><kbd><Command size={10}/> K</kbd></div><button className="top-icon" aria-label="Help" title="Help"><CircleHelp size={18}/></button><button className="notification-btn" aria-label="Notifications" onClick={()=>setPage('incidents')}><Bell size={18}/><i/></button><div className="top-divider"/><div className="top-user"><div className="avatar">SA</div><ChevronDown size={14}/></div></div></header><Suspense fallback={<div className="page-loading" role="status">Loading workspace…</div>}>{pageNode}</Suspense><footer className="app-footer"><span>© 2026 ErgoGuard AI <b>·</b> Workplace Safety Intelligence</span><span><i className="live-dot"/> Detection feed status is shown on each page <b>·</b> v1.0.0</span></footer></main>
    <IncidentDetail incident={selectedIncident} onClose={()=>setSelectedIncident(null)}/>
  </div>
}
