/**
 * RentMaikar Dedicated Backend Administration & Bridge Portal
 * 
 * Self-contained Single Page Application rendered and served directly by the
 * Express backend (staging.rentmaikar.com). Requires no external CDN dependencies
 * or build tools, guaranteeing offline and container resilience.
 */

export function renderPortalHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RentMaikar Backend Portal | Admin & Platform Bridge</title>
  <style>
    :root {
      --bg: #0b0f17;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.15);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.15);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.15);
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
    }

    /* Container */
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 16px;
      width: 100%;
    }

    /* Header */
    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-badge {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      font-weight: 700;
      font-size: 14px;
      padding: 6px 12px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    .brand-title {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }

    .brand-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      font-family: monospace;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    /* Live Bridge Badge in Header */
    .bridge-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .bridge-pill.active {
      background: var(--success-bg);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .bridge-pill.disabled {
      background: var(--danger-bg);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #1f2937;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
    }
    .role-badge {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: #374151;
      color: #93c5fd;
    }
    .role-badge.admin {
      background: #1e3a8a;
      color: #bfdbfe;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s;
      background: transparent;
      color: var(--text);
    }
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-outline {
      border-color: var(--card-border);
      background: #1f2937;
    }
    .btn-outline:hover {
      background: #374151;
    }
    .btn-danger {
      background: var(--danger);
      color: white;
    }
    .btn-danger:hover {
      background: #dc2626;
    }
    .btn-success {
      background: var(--success);
      color: white;
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      overflow-x: auto;
    }
    .tab-btn {
      padding: 12px 18px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      color: var(--text);
    }
    .tab-btn.active {
      color: #60a5fa;
      border-bottom-color: #60a5fa;
    }

    /* Cards */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
      color: #fff;
    }
    .card-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }

    /* Master Switch Box */
    .switch-hero {
      background: linear-gradient(180deg, #131d2e 0%, #0d1522 100%);
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 28px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .switch-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .switch-title-wrap h2 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .switch-title-wrap p {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .master-toggle {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .toggle-slider {
      position: relative;
      width: 68px;
      height: 36px;
      background: #374151;
      border-radius: 20px;
      cursor: pointer;
      transition: background 0.3s;
    }
    .toggle-slider.active {
      background: #10b981;
    }
    .toggle-circle {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 28px;
      height: 28px;
      background: white;
      border-radius: 50%;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .toggle-slider.active .toggle-circle {
      transform: translateX(32px);
    }

    /* Topology visualizer */
    .topology-box {
      display: flex;
      align-items: center;
      justify-content: space-around;
      background: #0b111e;
      border: 1px solid #1f293d;
      border-radius: 8px;
      padding: 20px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .node-box {
      text-align: center;
      padding: 12px 20px;
      background: #162032;
      border-radius: 8px;
      border: 1px solid #233148;
      min-width: 220px;
    }
    .node-label {
      font-size: 11px;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .node-domain {
      font-family: monospace;
      font-size: 14px;
      font-weight: 600;
      color: #93c5fd;
    }
    .bridge-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      color: var(--text-muted);
      font-size: 12px;
    }
    .bridge-link-line {
      width: 100px;
      height: 4px;
      border-radius: 2px;
      background: #374151;
      position: relative;
    }
    .bridge-link-line.active {
      background: linear-gradient(90deg, #10b981, #3b82f6, #10b981);
      background-size: 200% 100%;
      animation: pulseLine 2s infinite linear;
    }
    @keyframes pulseLine {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    /* Grid layout */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }

    /* Status Subsystems Cards */
    .subsystem-card {
      background: #131b2a;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .subsystem-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .subsystem-name {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
    }
    .subsystem-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-healthy {
      background: var(--success-bg);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-degraded {
      background: var(--warning-bg);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge-down {
      background: var(--danger-bg);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .badge-unconfigured {
      background: rgba(156, 163, 175, 0.15);
      color: #9ca3af;
      border: 1px solid rgba(156, 163, 175, 0.3);
    }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      background: #162032;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
      font-weight: 600;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #1f2937;
      color: #e5e7eb;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Forms */
    .form-group {
      margin-bottom: 16px;
    }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
      color: #d1d5db;
    }
    .form-input, .form-select, .form-textarea {
      width: 100%;
      padding: 10px 12px;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 6px;
      color: white;
      font-size: 14px;
      outline: none;
    }
    .form-input:focus, .form-select:focus, .form-textarea:focus {
      border-color: #3b82f6;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 16px;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      max-width: 500px;
      width: 100%;
      padding: 24px;
      max-height: 90vh;
      overflow-y: auto;
    }

    /* Login Box */
    #auth-view {
      max-width: 440px;
      margin: 80px auto;
      width: 100%;
      padding: 16px;
    }
    .auth-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }

    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1f2937;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid #374151;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
      font-size: 14px;
      z-index: 200;
      display: none;
    }
    .toast.show { display: block; }

    .score-circle {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      border: 4px solid var(--success);
      color: var(--success);
      background: rgba(16, 185, 129, 0.05);
    }
    .score-circle.degraded {
      border-color: var(--warning);
      color: var(--warning);
    }
    .score-circle.down {
      border-color: var(--danger);
      color: var(--danger);
    }
  </style>
</head>
<body>

  <!-- Toast Notification -->
  <div id="toast" class="toast"></div>

  <!-- Authentication View (Shown when not logged in) -->
  <div id="auth-view" style="display: none;">
    <div class="auth-card">
      <div style="text-align: center; margin-bottom: 24px;">
        <span class="brand-badge">RentMaikar Backend</span>
        <h1 style="font-size: 22px; font-weight: 700; margin-top: 12px;">Admin & Platform Portal</h1>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">staging.rentmaikar.com</p>
      </div>

      <!-- Auth Switcher -->
      <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid #374151;">
        <button id="tab-login" class="tab-btn active" onclick="switchAuthTab('login')">Sign In</button>
        <button id="tab-invite" class="tab-btn" onclick="switchAuthTab('invite')">Accept Invite</button>
      </div>

      <!-- Sign In Form -->
      <form id="form-login" onsubmit="handleLogin(event)">
        <div class="form-group">
          <label class="form-label">Email or Master Key</label>
          <input type="text" id="login-email" class="form-input" placeholder="admin@rentmaikar.com or Master Key" required>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" id="login-password" class="form-input" placeholder="••••••••••••">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">
          Authenticate to Backend Portal
        </button>
        <p style="font-size: 12px; color: var(--text-muted); text-align: center; margin-top: 16px;">
          Directly domiciled in RentMaikar backend microservices. Restricted to Administrators & invited operators.
        </p>
      </form>

      <!-- Accept Invite Form -->
      <form id="form-invite" style="display: none;" onsubmit="handleAcceptInvite(event)">
        <div class="form-group">
          <label class="form-label">Invitation Token</label>
          <input type="text" id="invite-token" class="form-input" placeholder="inv_..." required>
        </div>
        <div class="form-group">
          <label class="form-label">Your Full Name</label>
          <input type="text" id="invite-name" class="form-input" placeholder="Alex Morgan" required>
        </div>
        <div class="form-group">
          <label class="form-label">Choose a Password (Optional)</label>
          <input type="password" id="invite-password" class="form-input" placeholder="At least 8 characters">
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">
          Accept Invitation & Enter
        </button>
      </form>
    </div>
  </div>

  <!-- Authenticated Portal View -->
  <div id="portal-view" style="display: none;">
    <!-- Navigation Header -->
    <header>
      <div class="brand-group">
        <span class="brand-badge">staging.rentmaikar.com</span>
        <div>
          <div class="brand-title">RentMaikar Backend Portal</div>
          <div class="brand-subtitle">Platform Health & Gateway Connection Bridge</div>
        </div>
      </div>

      <div class="header-actions">
        <!-- Live Bridge Switch Indicator -->
        <div id="header-bridge-pill" class="bridge-pill active" onclick="switchTab('bridge')">
          <span class="status-dot"></span>
          <span id="header-bridge-text">Direct Link: ACTIVE</span>
        </div>

        <!-- User Profile Pill -->
        <div class="user-pill">
          <span id="user-name" style="font-weight: 500;">Admin</span>
          <span id="user-role" class="role-badge admin">ADMIN</span>
        </div>

        <button class="btn btn-outline btn-sm" onclick="handleLogout()">Sign Out</button>
      </div>
    </header>

    <div class="container">
      <!-- Main Tabs -->
      <nav class="tabs">
        <button class="tab-btn active" onclick="switchTab('bridge')">Direct Connection Bridge</button>
        <button class="tab-btn" onclick="switchTab('health')">Platform Health Monitoring</button>
        <button class="tab-btn" onclick="switchTab('diagnostics')">Diagnostics & Reports</button>
        <button id="tab-users-nav" class="tab-btn" onclick="switchTab('users')">Users & Invitations</button>
      </nav>

      <!-- TAB 1: Direct Connection Bridge -->
      <section id="tab-bridge" class="tab-content">
        <!-- The Master Switch Hero -->
        <div class="switch-hero">
          <div class="switch-header">
            <div class="switch-title-wrap">
              <h2>
                Frontend-Backend Direct Connection Bridge
                <span id="hero-badge" class="subsystem-badge badge-healthy">ENABLED</span>
              </h2>
              <p>
                Controls whether <strong>staging.rentmaikar.com</strong> listens to and responds directly to requests originating from <strong>rentmaikar.com</strong>.
              </p>
            </div>

            <!-- Master Toggle Switch -->
            <div class="master-toggle">
              <span id="toggle-label" style="font-weight: 600; font-size: 15px;">Active</span>
              <div id="master-switch" class="toggle-slider active" onclick="toggleDirectConnection()">
                <div class="toggle-circle"></div>
              </div>
            </div>
          </div>

          <!-- Topology Box -->
          <div class="topology-box">
            <div class="node-box">
              <div class="node-label">Frontend Application</div>
              <div class="node-domain">https://rentmaikar.com</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Client SPA (Port 3000 / Web)</div>
            </div>

            <div class="bridge-link">
              <div id="topology-link-line" class="bridge-link-line active"></div>
              <span id="topology-link-status" style="font-weight: 600; color: #34d399;">CORS & API Allowed</span>
            </div>

            <div class="node-box">
              <div class="node-label">Backend API Gateway</div>
              <div class="node-domain">https://staging.rentmaikar.com</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Express Microservices (Port 5000)</div>
            </div>
          </div>

          <!-- Actions Row -->
          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
            <div style="font-size: 13px; color: var(--text-muted);">
              Last changed: <strong id="bridge-last-changed">-</strong> by <span id="bridge-last-by">-</span>
            </div>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-primary" onclick="testBridgeHandshake()">
                ⚡ Test Bridge Handshake Now
              </button>
              <button class="btn btn-outline" onclick="openOriginsModal()">
                ⚙️ Configure Allowed Origins
              </button>
            </div>
          </div>

          <!-- Handshake Output Box -->
          <div id="handshake-result" style="display: none; background: #0b101b; border: 1px solid #1f293d; border-radius: 8px; padding: 14px; font-size: 13px;">
          </div>
        </div>

        <!-- Auto-Disconnect Switch on Frontend Traffic Card -->
        <div class="card" style="background: linear-gradient(180deg, #101c30 0%, #0a111e 100%); border: 1px solid #1e3a5f; margin-bottom: 24px; padding: 24px; border-radius: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">
            <div style="flex: 1; min-width: 280px;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                <h3 style="font-size: 18px; font-weight: 700; color: #fff;">
                  ⚡ Auto-Disconnect Switch on rentmaikar.com Calls
                </h3>
                <span id="auto-disconnect-badge" class="subsystem-badge badge-healthy">ARMED</span>
              </div>
              <p style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">
                When enabled, the backend automatically monitors all incoming traffic.
                <strong>Immediately when calls are detected from the rentmaikar.com front end</strong>,
                the backend files instantly disconnect direct contact with the front files,
                <strong>activating the fallback bridge</strong> so traffic seamlessly switches to resilient bridge communications.
              </p>
            </div>

            <div style="display: flex; align-items: center; gap: 14px; background: #070d18; padding: 10px 18px; border-radius: 8px; border: 1px solid #1e293d;">
              <span id="auto-toggle-label" style="font-size: 14px; font-weight: 600; color: #34d399;">Armed (Enabled)</span>
              <div id="auto-disconnect-switch" class="toggle-slider active" onclick="toggleAutoDisconnect()">
                <div class="toggle-circle"></div>
              </div>
            </div>
          </div>

          <!-- Telemetry status box -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; background: #080f1b; padding: 14px; border-radius: 8px; border: 1px solid #1c2b42; font-size: 13px;">
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Detection Policy</span>
              <strong id="auto-policy-status" style="color: #60a5fa;">Disconnect & Activate Bridge</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Calls Intercepted</span>
              <strong id="auto-trigger-count" style="color: #f3f4f6;">0 calls detected</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Active Bridge Fallback</span>
              <strong id="auto-bridge-status" style="color: #34d399;">Ready on staging.rentmaikar.com</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); display: block; font-size: 11px; text-transform: uppercase;">Last Trigger Event</span>
              <span id="auto-last-trigger" style="color: var(--text-muted); font-size: 12px;">No calls intercepted yet</span>
            </div>
          </div>

          <!-- Quick Actions -->
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <button class="btn btn-primary btn-sm" onclick="simulateFrontendCall()">
              🚀 Simulate Call from rentmaikar.com Frontend
            </button>
            <button class="btn btn-outline btn-sm" onclick="reconnectDirectLink()">
              🔄 Reconnect Direct Link (Reset to Active)
            </button>
            <span style="font-size: 12px; color: var(--text-muted); margin-left: 6px;">
              *Simulating a call verifies immediate severance and bridge fallback.
            </span>
          </div>
          
          <div id="simulate-result-box" style="display: none; margin-top: 14px; background: #081220; border: 1px solid #1b3152; border-radius: 6px; padding: 12px; font-size: 12px; font-family: monospace; color: #a5b4fc;">
          </div>
        </div>

        <!-- Connection Audit Log -->
        <div class="card">
          <div class="card-title">Bridge Connection Event History</div>
          <div class="card-desc">Audit trail of all administrative toggle actions and connection state changes.</div>
          <div style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Previous State</th>
                  <th>New State</th>
                  <th>Toggled By</th>
                  <th>Reason / Context</th>
                </tr>
              </thead>
              <tbody id="bridge-history-body">
                <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading history...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 2: Platform Health Monitoring -->
      <section id="tab-health" class="tab-content" style="display: none;">
        <!-- Top Metrics Overview -->
        <div class="grid-2" style="margin-bottom: 20px;">
          <div class="card" style="display: flex; align-items: center; gap: 24px;">
            <div id="overall-score-circle" class="score-circle">
              <span id="overall-score-num" style="font-size: 28px;">100</span>
              <span style="font-size: 10px; text-transform: uppercase;">Score</span>
            </div>
            <div>
              <div class="card-title" style="margin: 0;">Overall Platform Health</div>
              <div id="overall-health-summary" style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
                All platform subsystems operational.
              </div>
              <div style="margin-top: 12px;">
                <button class="btn btn-primary btn-sm" onclick="runFreshHealthCheck()">
                  🔄 Run Fresh Health Diagnostics
                </button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Backend Server Telemetry</div>
            <div class="grid-2" style="font-size: 13px; margin-top: 8px;">
              <div><strong>Uptime:</strong> <span id="metric-uptime">-</span></div>
              <div><strong>Node.js:</strong> <span id="metric-node">-</span></div>
              <div><strong>Memory (RSS):</strong> <span id="metric-memory">-</span></div>
              <div><strong>System Load:</strong> <span id="metric-load">-</span></div>
            </div>
          </div>
        </div>

        <!-- Subsystems Grid -->
        <div class="card">
          <div class="card-title">Monitored Platform Subsystems</div>
          <div class="card-desc">Real-time status probes across API Gateway, Frontend reachability, Database, CPaaS, and IoT microservices.</div>
          <div id="subsystems-grid" class="grid-3">
            <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-muted);">
              Loading subsystem statuses...
            </div>
          </div>
        </div>
      </section>

      <!-- TAB 3: Diagnostics & Reports -->
      <section id="tab-diagnostics" class="tab-content" style="display: none;">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
            <div>
              <div class="card-title" style="margin: 0;">General Platform Health Report</div>
              <div class="card-desc" style="margin: 4px 0 0 0;">Comprehensive downloadable system audit and telemetry report.</div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-outline btn-sm" onclick="exportReport('json')">📥 Export JSON Report</button>
              <button class="btn btn-outline btn-sm" onclick="exportReport('markdown')">📄 Export Markdown</button>
            </div>
          </div>

          <div style="background: #0d131f; border: 1px solid #1f2937; border-radius: 8px; padding: 16px;">
            <pre id="raw-report-pre" style="font-family: monospace; font-size: 12px; color: #a5b4fc; max-height: 400px; overflow: auto; white-space: pre-wrap;">
Loading latest diagnostic report...
            </pre>
          </div>
        </div>
      </section>

      <!-- TAB 4: Users & Invitations (Admin only) -->
      <section id="tab-users" class="tab-content" style="display: none;">
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div>
              <div class="card-title" style="margin: 0;">Platform Portal Members & Invitations</div>
              <div class="card-desc" style="margin: 4px 0 0 0;">Manage administrators and invited platform operators with access to this backend portal.</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openInviteModal()">
              ➕ Invite New User
            </button>
          </div>

          <!-- Pending Invitations -->
          <h3 style="font-size: 14px; font-weight: 600; margin: 16px 0 8px 0; color: #93c5fd;">Active Invitations</h3>
          <div style="overflow-x: auto; margin-bottom: 24px;">
            <table>
              <thead>
                <tr>
                  <th>Recipient Email</th>
                  <th>Assigned Role</th>
                  <th>Created At</th>
                  <th>Expires At</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="invites-table-body">
                <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No pending invitations</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Active Users -->
          <h3 style="font-size: 14px; font-weight: 600; margin: 16px 0 8px 0; color: #34d399;">Active Portal Users</h3>
          <div style="overflow-x: auto;">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Account Created</th>
                  <th>Last Login</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading users...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- Modal: Invite New User -->
  <div id="modal-invite" class="modal-overlay">
    <div class="modal-box">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 18px; font-weight: 600;">Invite User to Backend Portal</h3>
        <button class="btn btn-outline btn-sm" onclick="closeModal('modal-invite')">✕</button>
      </div>

      <form onsubmit="handleCreateInvite(event)">
        <div class="form-group">
          <label class="form-label">Invitee Email Address</label>
          <input type="email" id="invite-input-email" class="form-input" placeholder="colleague@rentmaikar.com" required>
        </div>

        <div class="form-group">
          <label class="form-label">Portal Authorization Role</label>
          <select id="invite-input-role" class="form-select">
            <option value="invited_user">Invited User (Monitor Health & View Telemetry)</option>
            <option value="admin">Administrator (Full Access & Switch Toggling)</option>
            <option value="auditor">Auditor (Read-Only Health Reports)</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Link Validity</label>
          <select id="invite-input-expiry" class="form-select">
            <option value="24">24 Hours</option>
            <option value="168" selected>7 Days</option>
            <option value="720">30 Days</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Administrative Note (Optional)</label>
          <input type="text" id="invite-input-note" class="form-input" placeholder="e.g. Platform Operations Lead">
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="btn btn-outline" onclick="closeModal('modal-invite')">Cancel</button>
          <button type="submit" class="btn btn-primary">Generate Invitation</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal: Allowed Origins -->
  <div id="modal-origins" class="modal-overlay">
    <div class="modal-box">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 18px; font-weight: 600;">Allowed Frontend Origins (CORS)</h3>
        <button class="btn btn-outline btn-sm" onclick="closeModal('modal-origins')">✕</button>
      </div>

      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
        When the direct connection switch is ENABLED, requests with Origin headers matching these domains will be welcomed by <strong>staging.rentmaikar.com</strong>.
      </p>

      <div class="form-group">
        <label class="form-label">Allowed Origins (One per line)</label>
        <textarea id="origins-textarea" class="form-textarea" rows="6" style="font-family: monospace;"></textarea>
      </div>

      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
        <button type="button" class="btn btn-outline" onclick="closeModal('modal-origins')">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="handleSaveOrigins()">Save Allowed Origins</button>
      </div>
    </div>
  </div>

  <script>
    // State management
    let state = {
      token: localStorage.getItem("rm_portal_token") || "",
      user: null,
      bridge: null,
      health: null,
      currentTab: "bridge"
    };

    function showToast(msg, duration = 3000) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), duration);
    }

    function openModal(id) {
      document.getElementById(id).classList.add("active");
    }
    function closeModal(id) {
      document.getElementById(id).classList.remove("active");
    }

    async function apiFetch(endpoint, options = {}) {
      const headers = {
        "Content-Type": "application/json",
        ...(state.token ? { "Authorization": "Bearer " + state.token } : {}),
        ...(options.headers || {})
      };

      const res = await fetch("/api/portal" + endpoint, {
        ...options,
        headers
      });

      if (res.status === 401) {
        state.token = "";
        localStorage.removeItem("rm_portal_token");
        renderAuthView();
        throw new Error("Session expired. Please sign in.");
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Request failed");
      }
      return data;
    }

    // Auth flows
    function switchAuthTab(tab) {
      document.getElementById("tab-login").classList.toggle("active", tab === "login");
      document.getElementById("tab-invite").classList.toggle("active", tab === "invite");
      document.getElementById("form-login").style.display = tab === "login" ? "block" : "none";
      document.getElementById("form-invite").style.display = tab === "invite" ? "block" : "none";
    }

    async function handleLogin(e) {
      e.preventDefault();
      const emailOrKey = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      try {
        const data = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: emailOrKey, password, masterKey: emailOrKey })
        });
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem("rm_portal_token", data.token);
        showToast("Authenticated successfully. Welcome " + data.user.name);
        initPortal();
      } catch (err) {
        alert("Login failed: " + err.message);
      }
    }

    async function handleAcceptInvite(e) {
      e.preventDefault();
      const token = document.getElementById("invite-token").value.trim();
      const name = document.getElementById("invite-name").value.trim();
      const password = document.getElementById("invite-password").value;

      try {
        const data = await apiFetch("/auth/accept-invite", {
          method: "POST",
          body: JSON.stringify({ token, name, password })
        });
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem("rm_portal_token", data.token);
        showToast("Invitation accepted! Welcome to the portal.");
        initPortal();
      } catch (err) {
        alert("Could not accept invitation: " + err.message);
      }
    }

    function handleLogout() {
      state.token = "";
      state.user = null;
      localStorage.removeItem("rm_portal_token");
      renderAuthView();
      showToast("Signed out.");
    }

    function renderAuthView() {
      document.getElementById("auth-view").style.display = "block";
      document.getElementById("portal-view").style.display = "none";

      // Check if URL has ?invite=TOKEN
      const urlParams = new URLSearchParams(window.location.search);
      const inviteToken = urlParams.get("invite");
      if (inviteToken) {
        switchAuthTab("invite");
        document.getElementById("invite-token").value = inviteToken;
      }
    }

    function switchTab(tab) {
      state.currentTab = tab;
      const tabBtns = document.querySelectorAll("nav.tabs .tab-btn");
      tabBtns.forEach(b => b.classList.remove("active"));
      
      const contents = document.querySelectorAll(".tab-content");
      contents.forEach(c => c.style.display = "none");

      const target = document.getElementById("tab-" + tab);
      if (target) target.style.display = "block";

      const navBtn = Array.from(tabBtns).find(b => b.textContent.toLowerCase().includes(tab));
      if (navBtn) navBtn.classList.add("active");

      if (tab === "health") loadHealth();
      if (tab === "bridge") loadBridge();
      if (tab === "diagnostics") loadDiagnostics();
      if (tab === "users") loadUsers();
    }

    // Bridge Logic
    async function loadBridge() {
      try {
        const data = await apiFetch("/bridge");
        state.bridge = data.bridge;
        renderBridgeUI();
      } catch (err) {
        console.error("Failed to load bridge config:", err);
      }
    }

    function renderBridgeUI() {
      if (!state.bridge) return;
      const b = state.bridge;

      // Header Pill
      const headerPill = document.getElementById("header-bridge-pill");
      const headerText = document.getElementById("header-bridge-text");
      headerPill.className = "bridge-pill " + (b.enabled ? "active" : "disabled");
      headerText.textContent = b.enabled ? "Direct Link: ACTIVE" : "Direct Link: DISABLED";

      // Hero
      const heroBadge = document.getElementById("hero-badge");
      heroBadge.className = "subsystem-badge " + (b.enabled ? "badge-healthy" : "badge-down");
      heroBadge.textContent = b.enabled ? "ENABLED" : "DISABLED";

      // Switch
      const toggleSlider = document.getElementById("master-switch");
      const toggleLabel = document.getElementById("toggle-label");
      toggleSlider.className = "toggle-slider " + (b.enabled ? "active" : "");
      toggleLabel.textContent = b.enabled ? "Direct Connection Active" : "Direct Connection Severed";

      // Topology Link
      const topLink = document.getElementById("topology-link-line");
      const topStatus = document.getElementById("topology-link-status");
      topLink.className = "bridge-link-line " + (b.enabled ? "active" : "");
      topStatus.textContent = b.enabled ? "CORS & Handshake Allowed" : "Traffic Rejected (503 Blocked)";
      topStatus.style.color = b.enabled ? "#34d399" : "#f87171";

      // Meta
      document.getElementById("bridge-last-changed").textContent = new Date(b.lastToggledAt).toLocaleString();
      document.getElementById("bridge-last-by").textContent = b.lastToggledBy;

      // Auto-Disconnect Switch & Info
      const autoBadge = document.getElementById("auto-disconnect-badge");
      const autoSwitch = document.getElementById("auto-disconnect-switch");
      const autoToggleLabel = document.getElementById("auto-toggle-label");
      const autoTriggerCount = document.getElementById("auto-trigger-count");
      const autoBridgeStatus = document.getElementById("auto-bridge-status");
      const autoLastTrigger = document.getElementById("auto-last-trigger");

      const isAutoArmed = b.autoDisconnectOnFrontendTraffic !== false;
      if (autoBadge) {
        autoBadge.className = "subsystem-badge " + (isAutoArmed ? "badge-healthy" : "badge-down");
        autoBadge.textContent = isAutoArmed ? "ARMED" : "DISABLED";
      }
      if (autoSwitch) {
        autoSwitch.className = "toggle-slider " + (isAutoArmed ? "active" : "");
      }
      if (autoToggleLabel) {
        autoToggleLabel.textContent = isAutoArmed ? "Armed (Auto-Disconnect Active)" : "Disarmed (Disabled)";
        autoToggleLabel.style.color = isAutoArmed ? "#34d399" : "#f87171";
      }
      if (autoTriggerCount) {
        autoTriggerCount.textContent = (b.autoDisconnectTriggerCount || 0) + " calls intercepted";
      }
      if (autoBridgeStatus) {
        autoBridgeStatus.textContent = !b.enabled ? "ACTIVE (Serving via Staging Bridge)" : "ARMED (Waiting for Frontend Call)";
        autoBridgeStatus.style.color = !b.enabled ? "#34d399" : "#60a5fa";
      }
      if (autoLastTrigger) {
        if (b.lastAutoDisconnectTrigger) {
          const t = b.lastAutoDisconnectTrigger;
          autoLastTrigger.innerHTML = '<span style="color: #93c5fd;">' + (t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '') + '</span> from <code>' + (t.origin || 'rentmaikar.com') + '</code> (' + (t.method || 'GET') + ' ' + (t.path || '/') + ')';
        } else {
          autoLastTrigger.textContent = "No calls intercepted yet";
        }
      }

      // History
      const tbody = document.getElementById("bridge-history-body");
      if (b.history && b.history.length > 0) {
        tbody.innerHTML = b.history.map(evt => \`
          <tr>
            <td style="white-space: nowrap;">\${new Date(evt.timestamp).toLocaleString()}</td>
            <td><strong>\${evt.newState ? "ENABLE" : "DISABLE"}</strong></td>
            <td><span class="subsystem-badge \${evt.previousState ? "badge-healthy" : "badge-down"}">\${evt.previousState ? "Active" : "Disabled"}</span></td>
            <td><span class="subsystem-badge \${evt.newState ? "badge-healthy" : "badge-down"}">\${evt.newState ? "Active" : "Disabled"}</span></td>
            <td>\${evt.toggledBy}</td>
            <td style="color: var(--text-muted);">\${evt.reason}</td>
          </tr>
        \`).join("");
      } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No history records</td></tr>';
      }
    }

    async function toggleDirectConnection() {
      if (!state.bridge) return;
      const targetState = !state.bridge.enabled;

      if (!confirm(\`Are you sure you want to \${targetState ? "ENABLE" : "DISABLE"} the direct connection between rentmaikar.com and staging.rentmaikar.com?\`)) {
        return;
      }

      try {
        const res = await apiFetch("/bridge/toggle", {
          method: "POST",
          body: JSON.stringify({
            enabled: targetState,
            reason: \`Manual switch toggle from Backend Portal by \${state.user?.name || "Admin"}\`
          })
        });
        state.bridge = res.bridge;
        renderBridgeUI();
        showToast(res.message);
      } catch (err) {
        alert("Toggle failed: " + err.message);
      }
    }

    async function toggleAutoDisconnect() {
      if (!state.bridge) return;
      const targetState = !(state.bridge.autoDisconnectOnFrontendTraffic !== false);
      try {
        const res = await apiFetch("/bridge/auto-disconnect", {
          method: "POST",
          body: JSON.stringify({ enabled: targetState })
        });
        showToast(res.message);
        await loadBridge();
      } catch (err) {
        alert("Could not update auto-disconnect switch: " + err.message);
      }
    }

    async function simulateFrontendCall() {
      const box = document.getElementById("simulate-result-box");
      box.style.display = "block";
      box.innerHTML = "📡 Emitting simulated call from <strong>https://rentmaikar.com</strong> frontend to backend files...";

      try {
        const res = await apiFetch("/bridge/simulate-call", {
          method: "POST",
          body: JSON.stringify({
            origin: "https://rentmaikar.com",
            path: "/api/vehicles",
            method: "GET"
          })
        });
        box.innerHTML = \`
<div style="color: #34d399; font-weight: bold; margin-bottom: 4px;">✓ Front files disconnected from backend files immediately upon call detection!</div>
<div>• Origin Detected: <strong style="color: #fff;">\${res.origin}</strong> (\${res.method} \${res.path})</div>
<div>• Action Executed: <strong style="color: #f87171;">\${res.action}</strong></div>
<div>• Direct Connection: <strong style="color: #f87171;">DISCONNECTED</strong></div>
<div>• Bridge Status: <strong style="color: #34d399;">\${res.bridge_active ? "ACTIVE" : "STANDBY"}</strong></div>
<div>• Fallback URL: <code>\${res.fallback_url}</code></div>
<div>• Interception Count: \${res.trigger_count}</div>
<div style="margin-top: 6px; color: #9ca3af;">\${res.message}</div>
        \`;
        showToast("⚡ Front files disconnected! Bridge is now ACTIVE.");
        await loadBridge();
      } catch (err) {
        box.innerHTML = \`<span style="color: #f87171;">Simulation failed: \${err.message}</span>\`;
      }
    }

    async function reconnectDirectLink() {
      try {
        const res = await apiFetch("/bridge/toggle", {
          method: "POST",
          body: JSON.stringify({
            enabled: true,
            reason: "Admin reconnected direct link from Backend Portal",
            mode: "active"
          })
        });
        showToast("Direct connection reconnected. Auto-disconnect is re-armed.");
        await loadBridge();
      } catch (err) {
        alert("Reconnect failed: " + err.message);
      }
    }

    async function testBridgeHandshake() {
      const box = document.getElementById("handshake-result");
      box.style.display = "block";
      box.innerHTML = "⏳ Performing live bidirectional bridge handshake test between <strong>staging.rentmaikar.com</strong> and <strong>rentmaikar.com</strong>...";

      try {
        const res = await apiFetch("/bridge/test", { method: "POST" });
        const h = res.handshake;
        box.innerHTML = \`
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="color: \${h.success ? "#34d399" : "#f87171"}; font-size: 14px;">
              \${h.success ? "✓ Handshake Succeeded" : "✕ Handshake Blocked / Warning"}
            </strong>
            <span style="color: var(--text-muted);">Round-trip: <strong>\${h.latencyMs}ms</strong></span>
          </div>
          <div>\${h.details}</div>
          <div style="margin-top: 6px; font-family: monospace; font-size: 11px; color: var(--text-muted);">
            HTTP Status: \${h.httpStatus} | Bridge Enabled: \${h.bridgeEnabled} | CORS Permitted: \${h.corsAllowed}
          </div>
        \`;
      } catch (err) {
        box.innerHTML = '<span style="color: #f87171;">✕ Handshake probe failed: ' + err.message + '</span>';
      }
    }

    function openOriginsModal() {
      if (!state.bridge) return;
      document.getElementById("origins-textarea").value = state.bridge.allowedOrigins.join("\\n");
      openModal("modal-origins");
    }

    async function handleSaveOrigins() {
      const text = document.getElementById("origins-textarea").value;
      const origins = text.split("\\n").map(s => s.trim()).filter(Boolean);

      try {
        const res = await apiFetch("/bridge/origins", {
          method: "POST",
          body: JSON.stringify({ origins })
        });
        state.bridge = res.bridge;
        closeModal("modal-origins");
        renderBridgeUI();
        showToast("Allowed origins updated.");
      } catch (err) {
        alert("Failed to save origins: " + err.message);
      }
    }

    // Health Logic
    async function loadHealth(fresh = false) {
      try {
        const data = await apiFetch("/health" + (fresh ? "?fresh=true" : ""));
        state.health = data.report;
        renderHealthUI();
      } catch (err) {
        console.error("Health probe failed:", err);
      }
    }

    async function runFreshHealthCheck() {
      showToast("Running multi-dimensional health probe...");
      await loadHealth(true);
      showToast("Health diagnostics updated.");
    }

    function renderHealthUI() {
      if (!state.health) return;
      const h = state.health;

      // Score
      const circle = document.getElementById("overall-score-circle");
      circle.className = "score-circle " + h.overallStatus;
      document.getElementById("overall-score-num").textContent = h.overallScore;
      document.getElementById("overall-health-summary").textContent = h.summary;

      // Telemetry
      document.getElementById("metric-uptime").textContent = h.serverMetrics.uptimeHuman;
      document.getElementById("metric-node").textContent = h.serverMetrics.nodeVersion;
      document.getElementById("metric-memory").textContent = h.serverMetrics.memory.rssMb + " MB";
      document.getElementById("metric-load").textContent = h.serverMetrics.loadAverage.map(n => n.toFixed(2)).join(", ");

      // Subsystems
      const grid = document.getElementById("subsystems-grid");
      grid.innerHTML = h.subsystems.map(s => \`
        <div class="subsystem-card">
          <div class="subsystem-header">
            <div class="subsystem-name">\${s.name}</div>
            <span class="subsystem-badge badge-\${s.status}">\${s.status}</span>
          </div>
          <div style="font-size: 12px; color: var(--text-muted);">
            Category: \${s.category.toUpperCase()} \${s.latencyMs !== undefined ? '• Latency: ' + s.latencyMs + 'ms' : ''}
          </div>
          \${s.error ? '<div style="font-size: 11px; color: #f87171;">⚠️ ' + s.error + '</div>' : ''}
          <div style="font-size: 11px; font-family: monospace; background: #0b111e; padding: 6px; border-radius: 4px; margin-top: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            \${JSON.stringify(s.details)}
          </div>
        </div>
      \`).join("");
    }

    async function loadDiagnostics() {
      try {
        const data = await apiFetch("/health");
        document.getElementById("raw-report-pre").textContent = JSON.stringify(data.report, null, 2);
      } catch (err) {
        document.getElementById("raw-report-pre").textContent = "Error loading report: " + err.message;
      }
    }

    function exportReport(format) {
      window.open("/api/portal/health/export?format=" + format + "&token=" + state.token, "_blank");
    }

    // Users Logic
    async function loadUsers() {
      try {
        const data = await apiFetch("/users");
        renderUsersUI(data.users, data.invitations);
      } catch (err) {
        console.error("Could not load users:", err);
      }
    }

    function renderUsersUI(users, invitations) {
      const iBody = document.getElementById("invites-table-body");
      if (invitations && invitations.length > 0) {
        iBody.innerHTML = invitations.map(inv => \`
          <tr>
            <td><strong>\${inv.email}</strong></td>
            <td><span class="role-badge \${inv.role}">\${inv.role}</span></td>
            <td>\${new Date(inv.createdAt).toLocaleDateString()}</td>
            <td>\${new Date(inv.expiresAt).toLocaleDateString()}</td>
            <td>\${inv.isUsed ? '<span style="color:#34d399;">Accepted</span>' : '<span style="color:#fbbf24;">Pending</span>'}</td>
            <td>
              \${!inv.isUsed ? \`<button class="btn btn-danger btn-sm" onclick="revokeInvite('\${inv.token}')">Revoke</button>\` : '-'}
            </td>
          </tr>
        \`).join("");
      } else {
        iBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No pending invitations</td></tr>';
      }

      const uBody = document.getElementById("users-table-body");
      if (users && users.length > 0) {
        uBody.innerHTML = users.map(u => \`
          <tr>
            <td><strong>\${u.name}</strong></td>
            <td>\${u.email}</td>
            <td><span class="role-badge \${u.role}">\${u.role}</span></td>
            <td>\${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>\${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
            <td>\${u.isActive ? '<span style="color:#34d399;">Active</span>' : '<span style="color:#f87171;">Inactive</span>'}</td>
          </tr>
        \`).join("");
      } else {
        uBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No users found</td></tr>';
      }
    }

    function openInviteModal() {
      openModal("modal-invite");
    }

    async function handleCreateInvite(e) {
      e.preventDefault();
      const email = document.getElementById("invite-input-email").value.trim();
      const role = document.getElementById("invite-input-role").value;
      const expiresInHours = document.getElementById("invite-input-expiry").value;
      const note = document.getElementById("invite-input-note").value.trim();

      try {
        const res = await apiFetch("/users/invite", {
          method: "POST",
          body: JSON.stringify({ email, role, expiresInHours, note })
        });
        closeModal("modal-invite");
        loadUsers();
        prompt("Invitation generated! Copy this direct link for the invitee:", res.inviteLink);
        showToast("Invitation generated for " + email);
      } catch (err) {
        alert("Invite failed: " + err.message);
      }
    }

    async function revokeInvite(token) {
      if (!confirm("Revoke this invitation?")) return;
      try {
        await apiFetch("/users/invite/" + token, { method: "DELETE" });
        showToast("Invitation revoked");
        loadUsers();
      } catch (err) {
        alert("Revoke failed: " + err.message);
      }
    }

    // Initialization
    async function initPortal() {
      if (!state.token) {
        renderAuthView();
        return;
      }

      try {
        const data = await apiFetch("/auth/session");
        state.user = data.session;

        document.getElementById("auth-view").style.display = "none";
        document.getElementById("portal-view").style.display = "block";
        document.getElementById("user-name").textContent = state.user.name;
        document.getElementById("user-role").textContent = state.user.role.toUpperCase();
        document.getElementById("user-role").className = "role-badge " + state.user.role;

        // Hide users tab for non-admin
        if (state.user.role !== "admin") {
          document.getElementById("tab-users-nav").style.display = "none";
        }

        loadBridge();
        loadHealth();
      } catch (err) {
        renderAuthView();
      }
    }

    // Start on page load
    initPortal();
  </script>
</body>
</html>`;
}
