import React, { useState } from 'react';
import { 
  HardHat, LayoutDashboard, Video, Bell, BarChart3, 
  History, Settings, Camera, Globe, Film, Square, 
  Play, Search, ChevronDown 
} from 'lucide-react';
import Dashboard from './pages/Dashboard.jsx';
import Incidents from './pages/Incidents.jsx';
import Analytics from './pages/Analytics.jsx';
import { departmentList } from './data/demoData';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [videoSource, setVideoSource] = useState('cctv'); // Default to CCTV as requested
  const [activeDepartment, setActiveDepartment] = useState('All Zones');
  const [isRecording, setIsRecording] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'monitoring', label: 'Live Monitoring', icon: Video },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: '5' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'history', label: 'Video History', icon: History },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="app-layout">
      {/* 1. SIDEBAR (DEEP PLUM #3A0F34) */}
      <aside className="app-sidebar">
        {/* Brand Logo & Tagline */}
        <div className="sidebar-logo">
          <div className="logo-shield-badge">
            <HardHat size={24} strokeWidth={2.4} />
          </div>
          <div className="logo-copy">
            <span className="logo-title">ErgoGuard AI</span>
            <span className="logo-tagline">SAFE PEOPLE SAFER WORKPLACES</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav" aria-label="Main Navigation">
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              className={`sidebar-nav-item ${currentPage === id ? 'active' : ''}`}
              onClick={() => setCurrentPage(id)}
            >
              <Icon size={18} strokeWidth={currentPage === id ? 2.5 : 2} />
              <span>{label}</span>
              {badge && <span className="sidebar-badge-count">{badge}</span>}
            </button>
          ))}
        </nav>

        {/* Video Source Options */}
        <div className="sidebar-section-title">Video Source</div>
        <div className="video-source-panel">
          {/* Webcam Option */}
          <button 
            className={`video-source-btn ${videoSource === 'webcam' ? 'active' : ''}`}
            onClick={() => setVideoSource('webcam')}
          >
            <Camera size={16} />
            <span>Webcam</span>
          </button>

          {/* IP CCTV Option with Department Switching Options */}
          <button 
            className={`video-source-btn ${videoSource === 'cctv' ? 'active' : ''}`}
            onClick={() => setVideoSource('cctv')}
          >
            <Globe size={16} />
            <span>IP CCTV</span>
          </button>

          {/* When IP CCTV is selected, show the Department switching options */}
          {videoSource === 'cctv' && (
            <div className="sidebar-department-sublist">
              {departmentList.map((dept) => (
                <button
                  key={dept}
                  className={`dept-sub-btn ${activeDepartment === dept ? 'active' : ''}`}
                  onClick={() => setActiveDepartment(dept)}
                >
                  • {dept}
                </button>
              ))}
            </div>
          )}

          {/* Video File Option */}
          <button 
            className={`video-source-btn ${videoSource === 'file' ? 'active' : ''}`}
            onClick={() => setVideoSource('file')}
          >
            <Film size={16} />
            <span>Video File</span>
          </button>

          {/* Stop Recording Button: Located JUST BELOW the Video File option as requested */}
          <button 
            className="stop-recording-btn"
            onClick={() => setIsRecording(!isRecording)}
            style={!isRecording ? { background: 'rgba(16, 185, 129, 0.2)', borderColor: '#10B981', color: '#6ee7b7' } : {}}
          >
            {isRecording ? (
              <>
                <Square size={13} fill="currentColor" />
                <span>Stop Recording</span>
              </>
            ) : (
              <>
                <Play size={13} fill="currentColor" />
                <span>Start Recording</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* 2. MAIN VIEWPORT */}
      <div className="main-content-area">
        {/* Top Header */}
        <header className="main-header">
          {/* Search bar matching reference */}
          <div className="header-search-box">
            <Search size={16} color="#94A3B8" />
            <input 
              type="text" 
              placeholder="Search camera, alerts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Right Header: Alerts & Safety Manager Profile */}
          <div className="header-actions">
            <button 
              className="header-alert-btn" 
              title="Recent Alerts"
              onClick={() => setCurrentPage('alerts')}
            >
              <Bell size={18} />
              <span className="header-alert-dot" />
            </button>

            <div className="header-user-badge" onClick={() => setCurrentPage('settings')}>
              <div className="user-avatar-circle">
                SM
              </div>
              <span className="user-title-text">
                Safety Manager <ChevronDown size={14} color="#64748B" />
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main>
          {(currentPage === 'dashboard' || currentPage === 'monitoring') && (
            <Dashboard 
              activeDepartment={activeDepartment}
              setActiveDepartment={setActiveDepartment}
              onViewIncidents={() => setCurrentPage('alerts')}
              videoSource={videoSource}
              setVideoSource={setVideoSource}
              onOpenHistory={() => setCurrentPage('history')}
            />
          )}

          {currentPage === 'alerts' && (
            <div style={{ padding: '24px 28px' }}>
              <Incidents />
            </div>
          )}

          {currentPage === 'analytics' && (
            <div style={{ padding: '24px 28px' }}>
              <Analytics />
            </div>
          )}

          {currentPage === 'history' && (
            <div style={{ padding: '32px 28px' }}>
              <div style={{ background: '#FFFFFF', padding: 28, borderRadius: 14, border: '1px solid #E2E8F0' }}>
                <h2 style={{ color: '#3A0F34', fontSize: 18, marginBottom: 8 }}>Archived Video History</h2>
                <p style={{ color: '#64748B', fontSize: 13 }}>
                  Recorded safety incidents and full CCTV stream logs for Plant 01 are retained for 90 days.
                </p>
              </div>
            </div>
          )}

          {currentPage === 'settings' && (
            <div style={{ padding: '32px 28px' }}>
              <div style={{ background: '#FFFFFF', padding: 28, borderRadius: 14, border: '1px solid #E2E8F0' }}>
                <h2 style={{ color: '#3A0F34', fontSize: 18, marginBottom: 8 }}>System Configurations</h2>
                <p style={{ color: '#64748B', fontSize: 13 }}>
                  Configure IP CCTV RTSP endpoints, AI threshold sensitivities, and automated alert dispatch webhooks.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}