import { useState, useEffect, useCallback } from "react";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
// Replace these with your actual Supabase project values
// Dashboard → Settings → API
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

// Minimal Supabase client (no SDK dependency)
const supabase = {
  _url: SUPABASE_URL,
  _key: SUPABASE_ANON_KEY,
  _token: null,

  _headers() {
    const h = { "Content-Type": "application/json", "apikey": this._key };
    if (this._token) h["Authorization"] = `Bearer ${this._token}`;
    return h;
  },

  // AUTH
  auth: {
    _parent: null,
    async sendMagicLink(email) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, create_user: true }),
      });
      return res.ok ? { error: null } : { error: await res.json() };
    },
    async getSession() {
      // Check URL hash for magic link token
      const hash = window.location.hash;
      if (hash.includes("access_token")) {
        const params = new URLSearchParams(hash.slice(1));
        const token = params.get("access_token");
        if (token) {
          localStorage.setItem("fc_token", token);
          window.history.replaceState(null, "", window.location.pathname);
          return { session: { access_token: token }, error: null };
        }
      }
      const stored = localStorage.getItem("fc_token");
      return stored ? { session: { access_token: stored }, error: null } : { session: null, error: null };
    },
    async getUser(token) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) return { user: null, error: await res.json() };
      return { user: await res.json(), error: null };
    },
    signOut() {
      localStorage.removeItem("fc_token");
    },
  },

  // DATABASE
  async query(table, options = {}) {
    let url = `${this._url}/rest/v1/${table}`;
    const params = [];
    if (options.select) params.push(`select=${options.select}`);
    if (options.eq) Object.entries(options.eq).forEach(([k, v]) => params.push(`${k}=eq.${v}`));
    if (options.order) params.push(`order=${options.order}`);
    if (params.length) url += "?" + params.join("&");

    const res = await fetch(url, {
      method: options.method || "GET",
      headers: { ...this._headers(), "Prefer": options.method === "POST" ? "return=representation" : "return=representation" },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) return { data: null, error: await res.json() };
    const data = await res.json();
    return { data, error: null };
  },

  // STORAGE upload
  async uploadFile(bucket, path, file) {
    const res = await fetch(`${this._url}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { "apikey": this._key, "Authorization": `Bearer ${this._token}`, "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) return { url: null, error: await res.json() };
    return { url: `${this._url}/storage/v1/object/public/${bucket}/${path}`, error: null };
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  compliant: { label: "Compliant",     color: "#16a34a", bg: "#dcfce7", dot: "#16a34a" },
  issues:    { label: "Issues Found",  color: "#d97706", bg: "#fef3c7", dot: "#d97706" },
  overdue:   { label: "Overdue",       color: "#dc2626", bg: "#fee2e2", dot: "#dc2626" },
};
const SEV_CONFIG = {
  low:    { color: "#16a34a", bg: "#dcfce7" },
  medium: { color: "#d97706", bg: "#fef3c7" },
  high:   { color: "#dc2626", bg: "#fee2e2" },
};
const REPAIR_STATUS = {
  pending:   { color: "#d97706", bg: "#fef3c7", label: "Pending" },
  approved:  { color: "#2563eb", bg: "#dbeafe", label: "Approved" },
  completed: { color: "#16a34a", bg: "#dcfce7", label: "Completed" },
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function daysUntil(d) {
  return Math.ceil((new Date(d) - new Date()) / 86400000);
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Badge({ status, type = "status" }) {
  const cfg = type === "status" ? STATUS_CONFIG[status] : type === "sev" ? SEV_CONFIG[status] : REPAIR_STATUS[status];
  const label = type === "status" ? cfg?.label : type === "sev" ? (status ? status.charAt(0).toUpperCase() + status.slice(1) : "") : cfg?.label;
  if (!cfg) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: cfg.bg, color: cfg.color, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {type === "status" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />}
      {label}
    </span>
  );
}
function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: 14, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #f0f0f0", cursor: onClick ? "pointer" : "default", ...style }}>
      {children}
    </div>
  );
}
function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 10, marginTop: 24 }}>{children}</div>;
}
function Spinner() {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}><div style={{ width: 28, height: 28, border: "3px solid #f0f0f0", borderTop: "3px solid #e74c3c", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /></div>;
}
function EmptyState({ icon, message }) {
  return <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af" }}><div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div><div style={{ fontSize: 14 }}>{message}</div></div>;
}

// ─── MAGIC LINK LOGIN ─────────────────────────────────────────────────────────
function LoginView({ onLogin }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSend = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.sendMagicLink(email.trim());
    setLoading(false);
    if (error) {
      setError("Couldn't send magic link. Check your email and try again.");
    } else {
      setSent(true);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔥</div>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 32, fontWeight: 900, color: "#111", letterSpacing: "-0.03em" }}>FireComply</div>
          <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>Kitchen Exhaust Compliance Records</div>
        </div>

        {!sent ? (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#111", marginBottom: 4 }}>Sign in</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>Enter your email — we'll send a magic link. No password needed.</div>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder="you@restaurant.com"
              style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 12, fontFamily: "inherit" }}
            />
            {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button onClick={handleSend} disabled={loading || !email.trim()} style={{ width: "100%", background: email.trim() ? "#e74c3c" : "#e5e7eb", color: email.trim() ? "#fff" : "#9ca3af", border: "none", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 700, cursor: email.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              {loading ? "Sending..." : "Send Magic Link →"}
            </button>
            <div style={{ marginTop: 16, padding: "12px 14px", background: "#f9fafb", borderRadius: 10, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
              <strong>First time?</strong> Contact your FireComply admin to get your account set up before signing in.
            </div>
          </Card>
        ) : (
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#111", marginBottom: 8 }}>Check your inbox</div>
            <div style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6 }}>
              We sent a sign-in link to <strong>{email}</strong>. Click it to access your compliance dashboard.
            </div>
            <button onClick={() => setSent(false)} style={{ marginTop: 20, background: "none", border: "none", color: "#9ca3af", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Use a different email</button>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── RESTAURANT DASHBOARD ─────────────────────────────────────────────────────
function RestaurantDashboard({ user, profile }) {
  const [locations, setLocations] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [services, setServices] = useState([]);
  const [issues, setIssues] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [tab, setTab] = useState("history");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    setLoading(true);
    const { data } = await supabase.query("locations", {
      select: "*",
      order: "name.asc",
    });
    if (data?.length) {
      setLocations(data);
      setSelectedLoc(data[0]);
      loadLocationData(data[0].id);
    }
    setLoading(false);
  }

  async function loadLocationData(locId) {
    const [svcs, iss, reps] = await Promise.all([
      supabase.query("services", { select: "*,service_photos(*)", eq: { location_id: locId }, order: "service_date.desc" }),
      supabase.query("issues", { select: "*", eq: { location_id: locId }, order: "created_at.desc" }),
      supabase.query("repairs", { select: "*", eq: { location_id: locId }, order: "created_at.desc" }),
    ]);
    setServices(svcs.data || []);
    setIssues(iss.data || []);
    setRepairs(reps.data || []);
  }

  async function approveRepair(repairId) {
    await supabase.query("repairs", {
      method: "PATCH",
      eq: { id: repairId },
      body: { status: "approved", approved_at: new Date().toISOString() },
    });
    if (selectedLoc) loadLocationData(selectedLoc.id);
  }

  if (loading) return <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "sans-serif" }}><Spinner /></div>;

  const loc = selectedLoc;
  if (!loc) return <EmptyState icon="📍" message="No locations assigned to your account." />;

  const sc = STATUS_CONFIG[loc.compliance_status] || STATUS_CONFIG.compliant;
  const days = daysUntil(loc.next_due_date);
  const openIssues = issues.filter(i => i.status === "open");

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ background: "#111", padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 22 }}>🔥</div>
          <div style={{ color: "#fff", fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900, fontSize: 20 }}>FireComply</div>
          <button onClick={() => supabase.auth.signOut() || window.location.reload()} style={{ marginLeft: "auto", background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer" }}>Sign out</button>
        </div>

        {/* Location switcher */}
        {locations.length > 1 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 4 }}>
            {locations.map(l => (
              <button key={l.id} onClick={() => { setSelectedLoc(l); loadLocationData(l.id); }} style={{ background: selectedLoc?.id === l.id ? "#e74c3c" : "#27272a", color: "#fff", border: "none", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                {l.name}
              </button>
            ))}
          </div>
        )}

        {/* Status card */}
        <div style={{ background: "#1c1c1e", borderRadius: "16px 16px 0 0", padding: 20 }}>
          <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{loc.name}</div>
          <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 16, letterSpacing: "-0.02em" }}>{(loc.address || "").split(",")[0]}</div>
          <div style={{ background: sc.bg, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: sc.dot }} />
              <div>
                <div style={{ fontWeight: 800, color: sc.color, fontSize: 16 }}>{sc.label}</div>
                <div style={{ color: sc.color, fontSize: 12, opacity: 0.75 }}>Last: {fmtDate(loc.last_service_date)}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, color: days < 0 ? "#dc2626" : days < 30 ? "#d97706" : "#16a34a", fontSize: 18 }}>{Math.abs(days)}d</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{days < 0 ? "overdue" : "until due"}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1, background: "#27272a", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ color: "#9ca3af", fontSize: 11 }}>Next Service</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{fmtDate(loc.next_due_date)}</div>
            </div>
            <div style={{ flex: 1, background: "#27272a", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ color: "#9ca3af", fontSize: 11 }}>Open Issues</div>
              <div style={{ color: openIssues.length > 0 ? "#f87171" : "#4ade80", fontWeight: 700, fontSize: 14 }}>{openIssues.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #f0f0f0", position: "sticky", top: 0, zIndex: 10 }}>
        {[["history","History"],["issues","Issues"],["repairs","Repairs"],["docs","Docs"]].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, border: "none", background: "none", padding: "14px 0", fontSize: 13, fontWeight: tab === key ? 700 : 500, color: tab === key ? "#e74c3c" : "#6b7280", borderBottom: `2px solid ${tab === key ? "#e74c3c" : "transparent"}`, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "16px 16px 32px" }}>
        {/* HISTORY */}
        {tab === "history" && (
          <div>
            <SectionTitle>Service History</SectionTitle>
            {services.length === 0 && <EmptyState icon="📋" message="No service records yet." />}
            {services.map(svc => {
              const before = (svc.service_photos || []).filter(p => p.phase === "before");
              const after  = (svc.service_photos || []).filter(p => p.phase === "after");
              return (
                <Card key={svc.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#111", fontSize: 15 }}>{fmtDate(svc.service_date)}</div>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>{svc.technician_name}</div>
                    </div>
                    <Badge status={svc.compliance_status} />
                  </div>
                  {svc.notes && <div style={{ color: "#374151", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{svc.notes}</div>}
                  {(before.length > 0 || after.length > 0) && (
                    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                      {before.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>Before</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {before.map((p, i) => <img key={i} src={p.url} alt="before" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />)}
                          </div>
                        </div>
                      )}
                      {after.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 6 }}>After</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {after.map((p, i) => <img key={i} src={p.url} alt="after" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {svc.report_pdf_url && (
                    <a href={svc.report_pdf_url} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: "100%", background: "#f8fafc", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", textAlign: "center", textDecoration: "none" }}>
                      📄 Download Compliance Report
                    </a>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* ISSUES */}
        {tab === "issues" && (
          <div>
            <SectionTitle>Open Issues ({openIssues.length})</SectionTitle>
            {openIssues.length === 0 && <EmptyState icon="✅" message="No open issues." />}
            {openIssues.map(iss => (
              <Card key={iss.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: "#111", fontSize: 15, flex: 1, marginRight: 10 }}>{iss.title}</div>
                  <Badge status={iss.severity} type="sev" />
                </div>
                {iss.description && <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>{iss.description}</div>}
                {iss.photo_url && <img src={iss.photo_url} alt="issue" style={{ width: "100%", borderRadius: 10, maxHeight: 180, objectFit: "cover", marginBottom: 10 }} />}
                <div style={{ color: "#9ca3af", fontSize: 12 }}>Identified {fmtDate(iss.created_at)}</div>
              </Card>
            ))}
            <SectionTitle>Resolved ({issues.filter(i => i.status === "resolved").length})</SectionTitle>
            {issues.filter(i => i.status === "resolved").map(iss => (
              <Card key={iss.id} style={{ marginBottom: 8, opacity: 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 600, color: "#374151", fontSize: 14 }}>{iss.title}</div>
                  <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Resolved</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* REPAIRS */}
        {tab === "repairs" && (
          <div>
            <SectionTitle>Repair Recommendations</SectionTitle>
            {repairs.length === 0 && <EmptyState icon="🔧" message="No repair recommendations." />}
            {repairs.map(rep => (
              <Card key={rep.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: "#111", fontSize: 14, flex: 1, marginRight: 10 }}>{rep.description}</div>
                  <Badge status={rep.status} type="repair" />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "#111" }}>${(rep.estimated_cost || 0).toLocaleString()}</div>
                  {rep.status === "pending" && (
                    <button onClick={() => approveRepair(rep.id)} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Approve</button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* DOCS */}
        {tab === "docs" && (
          <div>
            <SectionTitle>Compliance Documents</SectionTitle>
            {services.filter(s => s.report_pdf_url).length === 0 && <EmptyState icon="📁" message="No reports uploaded yet." />}
            {services.filter(s => s.report_pdf_url).map(svc => (
              <Card key={svc.id} style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#111", fontSize: 14 }}>Compliance Report</div>
                  <div style={{ color: "#9ca3af", fontSize: 12 }}>{fmtDate(svc.service_date)} · {svc.technician_name}</div>
                </div>
                <a href={svc.report_pdf_url} target="_blank" rel="noopener noreferrer" style={{ background: "#f3f4f6", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", textDecoration: "none" }}>↓</a>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TECHNICIAN UPLOAD FLOW ───────────────────────────────────────────────────
function TechnicianView({ user, profile }) {
  const [step, setStep] = useState(1);
  const [locations, setLocations] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [compliance, setCompliance] = useState("compliant");
  const [notes, setNotes] = useState("");
  const [beforeFiles, setBeforeFiles] = useState([]);
  const [afterFiles, setAfterFiles] = useState([]);
  const [pdfFile, setPdfFile] = useState(null);
  const [issues, setIssues] = useState([]);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [issueSev, setIssueSev] = useState("medium");
  const [repairs, setRepairs] = useState([]);
  const [repairDesc, setRepairDesc] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { loadLocations(); }, []);

  async function loadLocations() {
    const { data } = await supabase.query("locations", { select: "*", order: "name.asc" });
    setLocations(data || []);
  }

  function addIssue() {
    if (!issueTitle.trim()) return;
    setIssues(prev => [...prev, { title: issueTitle, description: issueDesc, severity: issueSev }]);
    setIssueTitle(""); setIssueDesc(""); setIssueSev("medium");
  }

  function addRepair() {
    if (!repairDesc.trim()) return;
    setRepairs(prev => [...prev, { description: repairDesc, estimated_cost: parseFloat(repairCost) || 0 }]);
    setRepairDesc(""); setRepairCost("");
  }

  async function handleSubmit() {
    if (!selectedLoc) return;
    setSubmitting(true);

    try {
      // 1. Create service record
      const { data: [svc] } = await supabase.query("services", {
        method: "POST",
        body: {
          location_id: selectedLoc,
          technician_id: user.id,
          technician_name: profile.full_name || profile.email,
          service_date: new Date().toISOString().split("T")[0],
          compliance_status: compliance,
          notes,
        },
      });

      // 2. Upload before photos
      for (const file of beforeFiles) {
        const path = `${selectedLoc}/${svc.id}/before_${file.name}`;
        const { url } = await supabase.uploadFile("service-photos", path, file);
        if (url) await supabase.query("service_photos", { method: "POST", body: { service_id: svc.id, url, phase: "before" } });
      }

      // 3. Upload after photos
      for (const file of afterFiles) {
        const path = `${selectedLoc}/${svc.id}/after_${file.name}`;
        const { url } = await supabase.uploadFile("service-photos", path, file);
        if (url) await supabase.query("service_photos", { method: "POST", body: { service_id: svc.id, url, phase: "after" } });
      }

      // 4. Upload PDF
      let pdfUrl = null;
      if (pdfFile) {
        const path = `${selectedLoc}/${svc.id}/report.pdf`;
        const { url } = await supabase.uploadFile("compliance-reports", path, pdfFile);
        pdfUrl = url;
        if (pdfUrl) await supabase.query("services", { method: "PATCH", eq: { id: svc.id }, body: { report_pdf_url: pdfUrl } });
      }

      // 5. Create issues
      for (const iss of issues) {
        const { data: [issRecord] } = await supabase.query("issues", {
          method: "POST",
          body: { service_id: svc.id, location_id: selectedLoc, title: iss.title, description: iss.description, severity: iss.severity, status: "open" },
        });
        // 6. Create repairs for issues
        const matchingRepairs = repairs.filter((_, ri) => ri < repairs.length);
        // (In production you'd link repair to specific issue; here we create all repairs linked to first issue or location)
      }

      // Create repairs (location-level for simplicity)
      for (const rep of repairs) {
        await supabase.query("repairs", {
          method: "POST",
          body: { location_id: selectedLoc, description: rep.description, estimated_cost: rep.estimated_cost, status: "pending" },
        });
      }

      setDone(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
      <div style={{ fontWeight: 800, fontSize: 22, color: "#111", marginBottom: 8 }}>Service Submitted!</div>
      <div style={{ color: "#6b7280", fontSize: 14, textAlign: "center", marginBottom: 32 }}>Record created. Location compliance status updated.</div>
      <button onClick={() => { setStep(1); setSelectedLoc(null); setNotes(""); setBeforeFiles([]); setAfterFiles([]); setPdfFile(null); setIssues([]); setRepairs([]); setDone(false); }} style={{ background: "#e74c3c", color: "#fff", border: "none", borderRadius: 12, padding: "15px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Start New Service</button>
    </div>
  );

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: "#111", padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 22 }}>🔥</div>
          <div style={{ color: "#fff", fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900, fontSize: 20 }}>FireComply</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ background: "#27272a", color: "#9ca3af", borderRadius: 8, padding: "4px 12px", fontSize: 12 }}>Tech</div>
            <button onClick={() => supabase.auth.signOut() || window.location.reload()} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer" }}>Sign out</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {["Location","Photos","Details","Submit"].map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? "#e74c3c" : "#3f3f46" }} />
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px 40px" }}>
        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: "#111", marginBottom: 6 }}>Select Location</div>
            <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>Which restaurant are you servicing today?</div>
            {locations.map(loc => (
              <Card key={loc.id} onClick={() => setSelectedLoc(loc.id)} style={{ marginBottom: 10, border: selectedLoc === loc.id ? "2px solid #e74c3c" : "1.5px solid #f0f0f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#111", fontSize: 15 }}>{loc.name}</div>
                    <div style={{ color: "#9ca3af", fontSize: 13 }}>{(loc.address || "").split(",")[0]}</div>
                  </div>
                  <Badge status={loc.compliance_status} />
                </div>
              </Card>
            ))}
            <button disabled={!selectedLoc} onClick={() => setStep(2)} style={{ width: "100%", background: selectedLoc ? "#e74c3c" : "#e5e7eb", color: selectedLoc ? "#fff" : "#9ca3af", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 700, cursor: selectedLoc ? "pointer" : "not-allowed", marginTop: 8 }}>Continue →</button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: "#111", marginBottom: 6 }}>Upload Photos</div>
            <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>Document conditions before and after service.</div>

            {[["Before Service", beforeFiles, setBeforeFiles], ["After Service", afterFiles, setAfterFiles]].map(([label, files, setFiles]) => (
              <Card key={label} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: "#374151", marginBottom: 12 }}>{label}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={URL.createObjectURL(f)} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: "1px solid #e5e7eb" }} />
                      <button onClick={() => setFiles(prev => prev.filter((_, fi) => fi !== i))} style={{ position: "absolute", top: -6, right: -6, background: "#dc2626", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  ))}
                </div>
                <label style={{ display: "block", background: "#f3f4f6", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer", textAlign: "center" }}>
                  + Add Photos
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                </label>
              </Card>
            ))}

            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: "#374151", marginBottom: 12 }}>Compliance Report PDF</div>
              {pdfFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: 12 }}>
                  <span style={{ fontSize: 24 }}>📄</span>
                  <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600, flex: 1 }}>{pdfFile.name}</span>
                  <button onClick={() => setPdfFile(null)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16 }}>✕</button>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, height: 72, background: "#f9fafb", borderRadius: 12, border: "2px dashed #e5e7eb", cursor: "pointer" }}>
                  <span style={{ fontSize: 24 }}>📄</span>
                  <span style={{ color: "#9ca3af", fontSize: 14 }}>Tap to upload PDF</span>
                  <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => setPdfFile(e.target.files[0])} />
                </label>
              )}
            </Card>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, background: "#f3f4f6", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 600, color: "#374151", cursor: "pointer" }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ flex: 2, background: "#e74c3c", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Continue →</button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, color: "#111", marginBottom: 6 }}>Service Details</div>
            <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>Notes, compliance status, deficiencies, repairs.</div>

            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: "#374151", marginBottom: 10 }}>Compliance Status</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["compliant","issues","overdue"].map(s => (
                  <button key={s} onClick={() => setCompliance(s)} style={{ flex: 1, border: `2px solid ${compliance === s ? STATUS_CONFIG[s].dot : "#e5e7eb"}`, background: compliance === s ? STATUS_CONFIG[s].bg : "#fff", color: compliance === s ? STATUS_CONFIG[s].color : "#6b7280", borderRadius: 10, padding: "10px 4px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{STATUS_CONFIG[s].label}</button>
                ))}
              </div>
            </Card>

            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: "#374151", marginBottom: 10 }}>Service Notes</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe conditions, work performed, anything notable..." style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 12, fontSize: 14, minHeight: 100, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
            </Card>

            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: "#374151", marginBottom: 10 }}>Deficiencies / Issues</div>
              {issues.map((iss, i) => (
                <div key={i} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>{iss.title}</div>
                    <Badge status={iss.severity} type="sev" />
                  </div>
                  <button onClick={() => setIssues(prev => prev.filter((_, fi) => fi !== i))} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer" }}>✕</button>
                </div>
              ))}
              <input value={issueTitle} onChange={e => setIssueTitle(e.target.value)} placeholder="Issue title" style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }} />
              <input value={issueDesc} onChange={e => setIssueDesc(e.target.value)} placeholder="Description (optional)" style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {["low","medium","high"].map(s => (
                  <button key={s} onClick={() => setIssueSev(s)} style={{ flex: 1, border: `2px solid ${issueSev === s ? SEV_CONFIG[s].color : "#e5e7eb"}`, background: issueSev === s ? SEV_CONFIG[s].bg : "#fff", color: issueSev === s ? SEV_CONFIG[s].color : "#6b7280", borderRadius: 8, padding: "8px 4px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{s}</button>
                ))}
              </div>
              <button onClick={addIssue} style={{ width: "100%", background: "#f3f4f6", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer" }}>+ Add Issue</button>
            </Card>

            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: "#374151", marginBottom: 10 }}>Repair Recommendations</div>
              {repairs.map((rep, i) => (
                <div key={i} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>{rep.description}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>${rep.estimated_cost.toLocaleString()}</div>
                  </div>
                  <button onClick={() => setRepairs(prev => prev.filter((_, fi) => fi !== i))} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer" }}>✕</button>
                </div>
              ))}
              <input value={repairDesc} onChange={e => setRepairDesc(e.target.value)} placeholder="Repair description" style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }} />
              <input value={repairCost} onChange={e => setRepairCost(e.target.value)} placeholder="Estimated cost ($)" type="number" style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8, fontFamily: "inherit" }} />
              <button onClick={addRepair} style={{ width: "100%", background: "#f3f4f6", border: "none", borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer" }}>+ Add Repair</button>
            </Card>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, background: "#f3f4f6", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 600, color: "#374151", cursor: "pointer" }}>← Back</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 2, background: submitting ? "#e5e7eb" : "#e74c3c", color: submitting ? "#9ca3af" : "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}>
                {submitting ? "Submitting..." : "Submit Service ✓"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ user, profile }) {
  const [tab, setTab] = useState("locations");
  const [locations, setLocations] = useState([]);
  const [allIssues, setAllIssues] = useState([]);
  const [allRepairs, setAllRepairs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [locs, iss, reps, profs] = await Promise.all([
      supabase.query("locations", { select: "*", order: "name.asc" }),
      supabase.query("issues", { select: "*,locations(name)", order: "created_at.desc" }),
      supabase.query("repairs", { select: "*,locations(name)", order: "created_at.desc" }),
      supabase.query("profiles", { select: "*", order: "created_at.desc" }),
    ]);
    setLocations(locs.data || []);
    setAllIssues(iss.data || []);
    setAllRepairs(reps.data || []);
    setProfiles(profs.data || []);
    setLoading(false);
  }

  async function handleRepairAction(repairId, newStatus) {
    const body = { status: newStatus };
    if (newStatus === "approved") body.approved_at = new Date().toISOString();
    if (newStatus === "completed") body.completed_at = new Date().toISOString();
    await supabase.query("repairs", { method: "PATCH", eq: { id: repairId }, body });
    loadAll();
  }

  const openIssues = allIssues.filter(i => i.status === "open");
  const pendingRepairs = allRepairs.filter(r => r.status === "pending");

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: "#111", padding: "20px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 22 }}>🔥</div>
          <div style={{ color: "#fff", fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900, fontSize: 20 }}>FireComply</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ background: "#27272a", color: "#9ca3af", borderRadius: 8, padding: "4px 12px", fontSize: 12 }}>Admin</div>
            <button onClick={() => supabase.auth.signOut() || window.location.reload()} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 12, cursor: "pointer" }}>Sign out</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Locations", value: locations.length, color: "#60a5fa" },
            { label: "Open Issues", value: openIssues.length, color: "#f87171" },
            { label: "Pending Repairs", value: pendingRepairs.length, color: "#fbbf24" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: "#1c1c1e", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ color: s.color, fontWeight: 800, fontSize: 22 }}>{s.value}</div>
              <div style={{ color: "#6b7280", fontSize: 11 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          {[["locations","Locations"],["issues","Issues"],["repairs","Repairs"],["users","Users"]].map(([key,label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, border: "none", background: "none", padding: "12px 0", fontSize: 13, fontWeight: tab === key ? 700 : 500, color: tab === key ? "#fff" : "#6b7280", borderBottom: `2px solid ${tab === key ? "#e74c3c" : "transparent"}`, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 32px" }}>
        {loading && <Spinner />}

        {!loading && tab === "locations" && (
          <div>
            <SectionTitle>All Locations ({locations.length})</SectionTitle>
            {locations.map(loc => (
              <Card key={loc.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#111", fontSize: 15 }}>{loc.name}</div>
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>{loc.address}</div>
                  </div>
                  <Badge status={loc.compliance_status} />
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ fontSize: 12 }}><span style={{ color: "#9ca3af" }}>Last: </span><span style={{ fontWeight: 600, color: "#374151" }}>{fmtDate(loc.last_service_date)}</span></div>
                  <div style={{ fontSize: 12 }}><span style={{ color: "#9ca3af" }}>Next: </span><span style={{ fontWeight: 600, color: "#374151" }}>{fmtDate(loc.next_due_date)}</span></div>
                  <div style={{ fontSize: 12 }}><span style={{ color: "#9ca3af" }}>Issues: </span><span style={{ fontWeight: 600, color: loc.open_issues_count > 0 ? "#dc2626" : "#16a34a" }}>{loc.open_issues_count}</span></div>
                </div>
                {loc.contact_name && <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>📞 {loc.contact_name} · {loc.contact_email}</div>}
              </Card>
            ))}
          </div>
        )}

        {!loading && tab === "issues" && (
          <div>
            <SectionTitle>Open Issues ({openIssues.length})</SectionTitle>
            {openIssues.length === 0 && <EmptyState icon="✅" message="No open issues." />}
            {openIssues.map(iss => (
              <Card key={iss.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, color: "#111", fontSize: 14, flex: 1, marginRight: 10 }}>{iss.title}</div>
                  <Badge status={iss.severity} type="sev" />
                </div>
                <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 6 }}>{iss.locations?.name}</div>
                {iss.description && <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>{iss.description}</div>}
                <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 8 }}>{fmtDate(iss.created_at)}</div>
              </Card>
            ))}
          </div>
        )}

        {!loading && tab === "repairs" && (
          <div>
            <SectionTitle>Pending Approval ({pendingRepairs.length})</SectionTitle>
            {pendingRepairs.length === 0 && <EmptyState icon="✅" message="No pending repairs." />}
            {pendingRepairs.map(rep => (
              <Card key={rep.id} style={{ marginBottom: 10 }}>
                <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 4 }}>{rep.locations?.name}</div>
                <div style={{ fontWeight: 700, color: "#111", fontSize: 14, marginBottom: 10 }}>{rep.description}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "#111" }}>${(rep.estimated_cost || 0).toLocaleString()}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleRepairAction(rep.id, "completed")} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Deny</button>
                    <button onClick={() => handleRepairAction(rep.id, "approved")} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Approve</button>
                  </div>
                </div>
              </Card>
            ))}
            <SectionTitle>All Repairs ({allRepairs.length})</SectionTitle>
            {allRepairs.map(rep => (
              <Card key={rep.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, marginRight: 10 }}>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{rep.locations?.name}</div>
                    <div style={{ fontWeight: 600, color: "#111", fontSize: 13 }}>{rep.description}</div>
                    <div style={{ color: "#374151", fontSize: 13, fontWeight: 700 }}>${(rep.estimated_cost || 0).toLocaleString()}</div>
                  </div>
                  <Badge status={rep.status} type="repair" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {!loading && tab === "users" && (
          <div>
            <SectionTitle>All Users ({profiles.length})</SectionTitle>
            {profiles.map(p => (
              <Card key={p.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, background: p.role === "admin" ? "#fef3c7" : p.role === "technician" ? "#fee2e2" : "#dbeafe", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: p.role === "admin" ? "#d97706" : p.role === "technician" ? "#dc2626" : "#2563eb", fontSize: 15 }}>
                  {(p.full_name || p.email || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#111" }}>{p.full_name || "—"}</div>
                  <div style={{ color: "#9ca3af", fontSize: 12 }}>{p.email}</div>
                </div>
                <div style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{p.role}</div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function FireComply() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    // Check for magic link token in URL or localStorage
    supabase.auth.getSession().then(async ({ session: s }) => {
      if (s?.access_token) {
        supabase._token = s.access_token;
        const { user } = await supabase.auth.getUser(s.access_token);
        if (user) {
          // Load profile
          const { data } = await supabase.query("profiles", { select: "*", eq: { id: user.id } });
          setProfile(data?.[0] || { id: user.id, email: user.email, role: "restaurant" });
          setSession(s);
          return;
        }
      }
      setSession(null);
    });
  }, []);

  // Loading
  if (session === undefined) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: 36 }}>🔥</div>
      <div style={{ width: 32, height: 32, border: "3px solid #f0f0f0", borderTop: "3px solid #e74c3c", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  if (!session) return <LoginView onLogin={() => {}} />;

  const role = profile?.role || "restaurant";
  const user = { id: profile?.id };

  if (role === "technician") return <TechnicianView user={user} profile={profile} />;
  if (role === "admin") return <AdminDashboard user={user} profile={profile} />;
  return <RestaurantDashboard user={user} profile={profile} />;
}
