import React, { useState } from 'react';
import { 
  Users, AlertTriangle, ShieldCheck, Activity, Video, 
  Maximize2, ChevronDown, Bell, TrendingUp, AlertCircle,
  Clock, RotateCcw, Trash2, CheckCircle2, HardHat, MapPin 
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  PieChart, Pie, Cell 
} from 'recharts';
import { 
  departmentList, departmentData, recentAlertsList, 
  safetyViolationTrends, violationTypesDonut 
} from '../data/demoData';

// Tracked Worker State dictionary (NONE exactly matches user's screenshot)
const workerStateMap = {
  'NONE': {
    id: 'NONE',
    name: 'Unassigned State',
    hardhat: { status: 'Unverified', stateClass: 'unverified' },
    vest: { status: 'Unverified', stateClass: 'unverified' },
    posture: { status: 'SAFE', stateClass: 'safe' },
    geofence: { status: 'Safe Zone', stateClass: 'safe' },
    riskScore: 0,
  },
  'W1': {
    id: 'W1',
    name: 'Worker #1 (Safe)',
    hardhat: { status: 'Verified', stateClass: 'safe' },
    vest: { status: 'Verified', stateClass: 'safe' },
    posture: { status: 'SAFE', stateClass: 'safe' },
    geofence: { status: 'Safe Zone', stateClass: 'safe' },
    riskScore: 6,
  },
  'W2': {
    id: 'W2',
    name: 'Worker #2 (Posture Warning)',
    hardhat: { status: 'Verified', stateClass: 'safe' },
    vest: { status: 'Unverified', stateClass: 'unverified' },
    posture: { status: 'FATIGUE', stateClass: 'warning' },
    geofence: { status: 'Safe Zone', stateClass: 'safe' },
    riskScore: 48,
  },
  'W3': {
    id: 'W3',
    name: 'Worker #3 (Danger Zone Violation)',
    hardhat: { status: 'Missing', stateClass: 'alert' },
    vest: { status: 'Missing', stateClass: 'alert' },
    posture: { status: 'UNSAFE', stateClass: 'alert' },
    geofence: { status: 'Restricted', stateClass: 'alert' },
    riskScore: 88,
  },
  'W4': {
    id: 'W4',
    name: 'Worker #4 (Standard)',
    hardhat: { status: 'Verified', stateClass: 'safe' },
    vest: { status: 'Verified', stateClass: 'safe' },
    posture: { status: 'SAFE', stateClass: 'safe' },
    geofence: { status: 'Safe Zone', stateClass: 'safe' },
    riskScore: 12,
  },
  'W5': {
    id: 'W5',
    name: 'Worker #5 (Buffer Edge)',
    hardhat: { status: 'Unverified', stateClass: 'unverified' },
    vest: { status: 'Verified', stateClass: 'safe' },
    posture: { status: 'SAFE', stateClass: 'safe' },
    geofence: { status: 'Buffer Edge', stateClass: 'warning' },
    riskScore: 32,
  }
};

export default function Dashboard({ 
  activeDepartment = 'All Zones', 
  setActiveDepartment, 
  onViewIncidents,
  videoSource,
  setVideoSource,
  onOpenHistory
}) {
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [trendTimeRange, setTrendTimeRange] = useState('Last 7 Days');
  const [alertsList, setAlertsList] = useState(recentAlertsList);
  const [isResettingEngine, setIsResettingEngine] = useState(false);
  const [engineNotification, setEngineNotification] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('NONE');
  const [workerMenuOpen, setWorkerMenuOpen] = useState(false);

  const currentDept = departmentData[activeDepartment] || departmentData['All Zones'];
  const activeWorker = workerStateMap[selectedWorkerId] || workerStateMap['NONE'];

  const handleSelectDepartment = (dept) => {
    setActiveDepartment(dept);
    if (setVideoSource) setVideoSource('cctv');
    setDeptDropdownOpen(false);
  };

  const handleResetEngine = () => {
    setIsResettingEngine(true);
    setTimeout(() => {
      setIsResettingEngine(false);
      setEngineNotification('AI Inference Engine successfully re-initialized with local models.');
      setTimeout(() => setEngineNotification(''), 4000);
    }, 850);
  };

  const handleClearAlerts = () => {
    const confirmed = window.confirm('Are you sure you want to clear all recent alerts? This action will remove the active alerts list.');
    if (confirmed) {
      setAlertsList([]);
    }
  };

  return (
    <div className="dashboard-body">
      {/* 1. COMPACT SYSTEM STATUS BAR (MATCHING REQUIREMENT 2) */}
      <section className="system-status-bar" aria-label="System Pipeline Status">
        <div className="status-items-group">
          <div className="status-indicator-item">
            <span className="status-green-dot" />
            <span>Pose Lite: <strong>Ready (Local)</strong></span>
          </div>
          <div className="status-indicator-item">
            <span className="status-green-dot" />
            <span>PPE: <strong>Ready (YOLOv8 Nexus)</strong></span>
          </div>
          <div className="status-indicator-item">
            <span className="status-green-dot" />
            <span>IndexedDB: <strong>Ready</strong></span>
          </div>
          <div className="status-indicator-item">
            <span className="status-green-dot" />
            <span>Offline: <strong>Ready</strong></span>
          </div>
          <div className="on-device-badge">
            <ShieldCheck size={13} />
            <span>100% On-Device</span>
          </div>
        </div>

        <div className="status-actions-group">
          <button 
            className="status-btn" 
            onClick={onOpenHistory || onViewIncidents}
            title="Open detection and incident history"
          >
            <Clock size={13} />
            <span>History</span>
          </button>
          <button 
            className={`status-btn reset-btn ${isResettingEngine ? 'resetting' : ''}`} 
            onClick={handleResetEngine}
            disabled={isResettingEngine}
            title="Reset on-device AI inference engine"
          >
            <RotateCcw size={13} className={isResettingEngine ? 'spin' : ''} />
            <span>{isResettingEngine ? 'Resetting...' : 'Reset Engine'}</span>
          </button>
        </div>
      </section>

      {/* Engine Reset Feedback Toast */}
      {engineNotification && (
        <div className="engine-toast-banner">
          <CheckCircle2 size={15} />
          <span>{engineNotification}</span>
        </div>
      )}

      {/* 2. COMPACT TOP 4 METRIC CARDS (MATCHING REQUIREMENT 1) */}
      <section className="metrics-quad-grid" aria-label="Key Safety Metrics">
        {/* Total Workers Detected */}
        <div className="metric-quad-card">
          <div className="metric-icon-circle workers">
            <Users size={18} strokeWidth={2.4} />
          </div>
          <div className="metric-quad-content">
            <span className="metric-quad-label">Total Workers Detected</span>
            <div className="metric-quad-val-row">
              <span className="metric-quad-val">{currentDept.workersCount}</span>
              <span className="metric-quad-change positive">↑ {currentDept.workersChange}</span>
            </div>
            <span className="metric-quad-sub">Live on site</span>
          </div>
        </div>

        {/* Safety Violations (Warm Amber Card) */}
        <div className="metric-quad-card violations-card">
          <div className="metric-icon-circle violations">
            <AlertTriangle size={18} strokeWidth={2.4} />
          </div>
          <div className="metric-quad-content">
            <span className="metric-quad-label">Safety Violations</span>
            <div className="metric-quad-val-row">
              <span className="metric-quad-val">{currentDept.violationsCount}</span>
              <span className="metric-quad-change negative">↑ {currentDept.violationsChange}</span>
            </div>
            <span className="metric-quad-sub">In last 1 hour</span>
          </div>
        </div>

        {/* PPE Compliance */}
        <div className="metric-quad-card">
          <div className="metric-icon-circle ppe">
            <ShieldCheck size={18} strokeWidth={2.4} />
          </div>
          <div className="metric-quad-content">
            <span className="metric-quad-label">PPE Compliance</span>
            <div className="metric-quad-val-row">
              <span className="metric-quad-val">{currentDept.ppeRate}%</span>
              <span className="metric-quad-change positive">↑ {currentDept.ppeChange}</span>
            </div>
            <span className="metric-quad-sub">Workers with proper PPE</span>
          </div>
        </div>

        {/* Fatigue / Unsafe Posture */}
        <div className="metric-quad-card">
          <div className="metric-icon-circle posture">
            <Activity size={18} strokeWidth={2.4} />
          </div>
          <div className="metric-quad-content">
            <span className="metric-quad-label">Fatigue / Unsafe Posture</span>
            <div className="metric-quad-val-row">
              <span className="metric-quad-val">{currentDept.postureAlerts}</span>
              <span className="metric-quad-change negative">↑ {currentDept.postureChange}</span>
            </div>
            <span className="metric-quad-sub">Detected today</span>
          </div>
        </div>
      </section>

      {/* 3. MIDDLE ROW: LIVE MONITORING (MAX 900x400) & RECENT ALERTS */}
      <section className="middle-dashboard-grid">
        {/* Live Monitoring Card */}
        <div className="cctv-monitor-card">
          <div className="cctv-card-header">
            <div className="cctv-card-title">
              <Video size={17} color="#0F172A" />
              <span>Live Monitoring</span>
            </div>

            {/* Department Switching Dropdown (All Zones, Warehouse, Manufacturing, Packaging, Loading Zone) */}
            <div className="dept-selector-wrapper">
              <button 
                className="dept-dropdown-btn"
                onClick={() => setDeptDropdownOpen(!deptDropdownOpen)}
                aria-expanded={deptDropdownOpen}
              >
                <span>{activeDepartment === 'All Zones' ? 'All Cameras' : activeDepartment}</span>
                <ChevronDown size={14} />
              </button>

              {deptDropdownOpen && (
                <div className="dept-dropdown-menu">
                  {departmentList.map((dept) => (
                    <button
                      key={dept}
                      className={`dept-menu-item ${activeDepartment === dept ? 'active' : ''}`}
                      onClick={() => handleSelectDepartment(dept)}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CCTV Video Viewport: 900px x 400px preserving 16:9 aspect ratio */}
          <div className="cctv-viewport">
            <img 
              src={currentDept.image} 
              alt={`${currentDept.name} live CCTV monitoring`}
              className="cctv-img-frame"
            />

            {/* Top Left LIVE Tag */}
            <div className="cctv-live-tag">
              <span className="cctv-red-dot" />
              <span>LIVE</span>
            </div>

            {/* AI Bounding Boxes on Workers with Clean Pill Headers */}
            {currentDept.workers.map((worker) => (
              <div 
                key={worker.id}
                className={`worker-bbox ${worker.status} ${selectedWorkerId === worker.id ? 'active-tracked' : ''}`}
                style={{
                  left: `${worker.x}%`,
                  top: `${worker.y}%`,
                  width: `${worker.w}%`,
                  height: `${worker.h}%`,
                  cursor: 'pointer',
                  pointerEvents: 'auto'
                }}
                onClick={() => setSelectedWorkerId(worker.id)}
                title={`Click to track state of ${worker.tag}`}
              >
                <div className="bbox-pill-header">
                  {worker.tag}
                </div>
              </div>
            ))}

            {/* Bottom Left Camera / Zone Name Tag */}
            <div className="cctv-camera-tag">
              {currentDept.cameraTag}
            </div>

            {/* Bottom Right Fullscreen Button */}
            <button 
              className="cctv-fullscreen-btn"
              title="Toggle Fullscreen"
              onClick={() => {
                const elem = document.querySelector('.cctv-viewport');
                if (elem?.requestFullscreen) elem.requestFullscreen();
              }}
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Right Column: Tracked Worker State + Active Alerts Feed */}
        <div className="monitoring-right-column">
          {/* 1. Tracked Worker State Card (Matches Reference Screenshot) */}
          <div className="tracked-worker-card">
            <div className="tracked-worker-header">
              <span className="tracked-worker-title">TRACKED WORKER STATE</span>
              <div className="tracked-worker-selector">
                <button 
                  className="worker-badge-pill"
                  onClick={() => setWorkerMenuOpen(!workerMenuOpen)}
                  title="Switch tracked worker state"
                  aria-expanded={workerMenuOpen}
                >
                  <span>{activeWorker.id}</span>
                  <ChevronDown size={11} />
                </button>

                {workerMenuOpen && (
                  <div className="worker-picker-dropdown">
                    {Object.keys(workerStateMap).map((wId) => (
                      <button
                        key={wId}
                        className={`worker-picker-item ${selectedWorkerId === wId ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedWorkerId(wId);
                          setWorkerMenuOpen(false);
                        }}
                      >
                        <strong>{wId}</strong>
                        <span>{workerStateMap[wId].name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 4 Tracked State Capsules */}
            <div className="tracked-states-list">
              {/* Capsule 1: Safety Hardhat */}
              <div className="tracked-state-capsule">
                <div className="state-label-group">
                  <span className="state-icon-wrap">
                    <HardHat size={16} strokeWidth={2} />
                  </span>
                  <span>Safety Hardhat</span>
                </div>
                <span className={`state-val-status ${activeWorker.hardhat.stateClass}`}>
                  {activeWorker.hardhat.status}
                </span>
              </div>

              {/* Capsule 2: Hi-Vis Safety Vest */}
              <div className="tracked-state-capsule">
                <div className="state-label-group">
                  <span className="state-icon-wrap">
                    <ShieldCheck size={16} strokeWidth={2} />
                  </span>
                  <span>Hi-Vis Safety Vest</span>
                </div>
                <span className={`state-val-status ${activeWorker.vest.stateClass}`}>
                  {activeWorker.vest.status}
                </span>
              </div>

              {/* Capsule 3: Ergonomic Posture */}
              <div className="tracked-state-capsule">
                <div className="state-label-group">
                  <span className="state-icon-wrap">
                    <Activity size={16} strokeWidth={2} />
                  </span>
                  <span>Ergonomic Posture</span>
                </div>
                <span className={`state-val-status ${activeWorker.posture.stateClass}`}>
                  {activeWorker.posture.status}
                </span>
              </div>

              {/* Capsule 4: Geofence Boundary */}
              <div className="tracked-state-capsule">
                <div className="state-label-group">
                  <span className="state-icon-wrap">
                    <MapPin size={16} strokeWidth={2} />
                  </span>
                  <span>Geofence Boundary</span>
                </div>
                <span className={`state-val-status ${activeWorker.geofence.stateClass}`}>
                  {activeWorker.geofence.status}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="tracked-risk-divider" />

            {/* Authoritative Risk Score Footer */}
            <div className="tracked-risk-footer">
              <div className="risk-footer-labels">
                <span>Authoritative Risk Score</span>
                <span className="risk-footer-val">{activeWorker.riskScore}/100</span>
              </div>
              <div className="risk-track-bar">
                <div 
                  className="risk-fill-bar"
                  style={{
                    width: `${Math.max(activeWorker.riskScore, 4)}%`,
                    background: activeWorker.riskScore > 75 
                      ? '#EF4444' 
                      : activeWorker.riskScore > 40 
                      ? '#EAAA00' 
                      : '#10B981',
                    boxShadow: activeWorker.riskScore > 75 
                      ? '0 0 8px rgba(239, 68, 68, 0.6)' 
                      : activeWorker.riskScore > 40 
                      ? '0 0 8px rgba(234, 170, 0, 0.5)' 
                      : '0 0 8px rgba(16, 185, 129, 0.5)'
                  }}
                />
              </div>
            </div>
          </div>

          {/* 2. Active Alerts Feed Card (Directly Below Tracked Worker State) */}
          <div className="active-alerts-feed-card">
            <div className="active-alerts-header">
              <div className="active-alerts-title-group">
                <AlertTriangle size={17} color="#F43F5E" strokeWidth={2.4} />
                <span className="active-alerts-title">Active Alerts Feed</span>
                {alertsList.length > 0 && (
                  <span className="alerts-count-badge">{alertsList.length}</span>
                )}
              </div>

              <div className="alerts-header-actions">
                <button 
                  className="dark-clear-btn" 
                  onClick={handleClearAlerts}
                  title="Clear all active alerts"
                  disabled={alertsList.length === 0}
                >
                  <Trash2 size={12} />
                  <span>Clear Alerts</span>
                </button>
                <button className="dark-view-btn" onClick={onViewIncidents}>
                  <span>View All</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            <div className="alerts-scroll-list dark-scroll-list">
              {alertsList.length > 0 ? (
                alertsList.map((alert) => (
                  <div key={alert.id} className="alert-item-card dark-alert-item">
                    <img 
                      src={alert.image} 
                      alt={alert.title} 
                      className="alert-thumb-img" 
                    />
                    <div className="alert-info-col">
                      <span className="alert-main-title dark-text-title">{alert.title}</span>
                      <span className="alert-location-time dark-text-sub">{alert.location} • {alert.time}</span>
                    </div>
                    <span className={`alert-severity-badge dark-badge ${alert.severity.toLowerCase()}`}>
                      {alert.severity}
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-alerts-notice dark-empty-notice">
                  <CheckCircle2 size={18} color="#10B981" />
                  <div>
                    <strong>All Alerts Cleared</strong>
                    <p style={{ margin: '2px 0 0', color: '#94A3B8', fontSize: '11px' }}>
                      Zero active safety violations reported in monitored zones.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. BOTTOM ROW: SAFETY VIOLATION TRENDS & VIOLATION TYPES */}
      <section className="bottom-dashboard-grid">
        {/* Safety Violation Trends Line Chart */}
        <div className="bottom-chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">
              <TrendingUp size={18} color="#3A0F34" />
              <span>Safety Violation Trends</span>
            </div>
            <select 
              className="chart-filter-select"
              value={trendTimeRange}
              onChange={(e) => setTrendTimeRange(e.target.value)}
            >
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>This Quarter</option>
            </select>
          </div>

          <div className="trends-line-chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={safetyViolationTrends} margin={{ top: 12, right: 15, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendsPlumGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#800020" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#800020" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  tickLine={false} 
                  axisLine={{ stroke: '#E2E8F0' }} 
                  tick={{ fill: '#64748B', fontSize: 11 }} 
                />
                <YAxis 
                  domain={[0, 20]} 
                  ticks={[0, 5, 10, 15, 20]} 
                  tickLine={false} 
                  axisLine={{ stroke: '#E2E8F0' }} 
                  tick={{ fill: '#64748B', fontSize: 11 }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#FFFFFF', 
                    border: '1px solid #CBD5E1', 
                    borderRadius: 8, 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: 12,
                    color: '#0F172A' 
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#7A1336" 
                  strokeWidth={2.4} 
                  fill="url(#trendsPlumGradient)" 
                  dot={{ r: 4, fill: '#7A1336', stroke: '#FFFFFF', strokeWidth: 1.5 }}
                  activeDot={{ r: 6, fill: '#EAAA00', stroke: '#7A1336', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Violation Types Donut Chart */}
        <div className="bottom-chart-card">
          <div className="chart-card-header">
            <div className="chart-card-title">
              <AlertCircle size={18} color="#3A0F34" />
              <span>Violation Types</span>
            </div>
          </div>

          <div className="donut-types-layout">
            <div className="donut-graphic-box">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={violationTypesDonut}
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                  >
                    {violationTypesDonut.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-inner-stats">
                <span className="donut-stat-number">32</span>
                <span className="donut-stat-label">Total Alerts</span>
              </div>
            </div>

            <div className="donut-types-legend">
              {violationTypesDonut.map((item) => (
                <div key={item.name} className="donut-legend-row">
                  <div className="donut-legend-info">
                    <span className="donut-color-dot" style={{ backgroundColor: item.color }} />
                    <span>{item.name}</span>
                  </div>
                  <span className="donut-pct-text">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}