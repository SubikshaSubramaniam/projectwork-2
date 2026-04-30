import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

export default function Patient() {
  const nav = useNavigate();
  const email = localStorage.getItem("email");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [accessLog, setAccessLog] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [respondingId, setRespondingId] = useState(null);

  const load = async () => {
    try {
      const res = await API.get(`/patient-profile?email=${email}`);
      setData(res.data);
      if (res.data?.patient_id) {
        // Load access log
        try {
          const logRes = await API.get(`/patient/access-log?patient_id=${res.data.patient_id}`);
          setAccessLog(logRes.data || []);
        } catch (e) { console.log("access log error:", e); }
        // Load pending doctor requests
        try {
          const reqRes = await API.get(`/patient/access-requests?patient_id=${res.data.patient_id}`);
          setAccessRequests(reqRes.data || []);
        } catch (e) { console.log("access requests error:", e); }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, []);

  const approve = async () => {
    setApproving(true);
    try {
      const form = new FormData();
      form.append("record_id", data.record_id);
      await API.post("/patient/approve", form);
      alert("Approved! The hospital admin will now store your EHR on the blockchain.");
      load();
    } catch (err) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setApproving(false);
    }
  };

  const approveDoctor = async (request_id) => {
    setRespondingId(request_id);
    try {
      const form = new FormData();
      form.append("request_id", request_id);
      form.append("patient_id", data.patient_id);
      await API.post("/patient/approve-access", form);
      alert("✅ Doctor access approved!");
      load();
    } catch (err) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setRespondingId(null);
    }
  };

  const denyDoctor = async (request_id) => {
    setRespondingId(request_id);
    try {
      const form = new FormData();
      form.append("request_id", request_id);
      form.append("patient_id", data.patient_id);
      await API.post("/patient/deny-access", form);
      alert("❌ Doctor access denied.");
      load();
    } catch (err) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setRespondingId(null);
    }
  };

  const toggleConsent = async () => {
    setToggling(true);
    try {
      const form = new FormData();
      form.append("record_id", data.record_id);
      form.append("active", !data.consent);
      await API.post("/toggle-consent", form);
      load();
    } catch (err) {
      alert("Failed to update consent");
    } finally {
      setToggling(false);
    }
  };

  const viewEHR = async () => {
    try {
      const res = await fetch(`http://localhost:8000/ehr/download/${data.cid}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      alert("Failed to download: " + err.message);
    }
  };

  const viewHistory = async () => {
    try {
      const res = await API.get(`/patient/ehr-history?patient_id=${data.patient_id}`);
      setHistory(res.data.history || []);
      setShowHistory(true);
    } catch (err) {
      alert("Failed to load history: " + err.message);
    }
  };

  const logout = () => { localStorage.clear(); nav("/"); };
  const formatTime = (ts) => ts ? new Date(ts * 1000).toLocaleString() : "—";

  const hospitalName = (h) => ({
    A: "Hospital Alpha", B: "Hospital Beta",
    C: "Hospital Gamma", D: "Hospital Delta"
  })[h?.toUpperCase()] || `Hospital ${h}`;

  if (loading) {
    return (
      <div style={s.loadingPage}>
        <div style={s.spinner} />
        <p style={{ color: "#888", marginTop: 16 }}>Loading your health record...</p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* TOPBAR */}
      <div style={s.topbar}>
        <div style={s.topbarLeft}>
          <span style={s.logo}>⛓️ EHRChain</span>
          <span style={s.topbarRole}>Patient Portal</span>
        </div>
        <div style={s.topbarRight}>
          <span style={s.topbarEmail}>{email}</span>
          <button onClick={logout} style={s.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={s.body}>

        {/* ── EHR UPLOAD APPROVAL BANNER ── */}
        {data?.pending && (
          <div style={s.notifBanner}>
            <div style={s.notifIcon}>🔔</div>
            <div style={s.notifContent}>
              <strong style={{ display: "block", fontSize: 15, marginBottom: 4 }}>
                EHR Upload Approval Needed
              </strong>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#5a3200", lineHeight: 1.6 }}>
                <strong>{data.hospital_name || "Your Hospital"}</strong> has uploaded your
                Electronic Health Record to IPFS and is waiting for your consent to store
                it on the blockchain.
                <br /><br />
                <span style={{ fontWeight: 600 }}>📋 Record ID: {data.record_id}</span><br />
                <span style={{ fontWeight: 600 }}>🏥 Hospital: {data.hospital_name || "—"}</span><br />
                <span style={{ fontWeight: 600 }}>👤 Admin: {data.admin_name || "Hospital Admin"}</span>
                {data.admin_email && (
                  <span style={{ color: "#888", fontSize: 12 }}> ({data.admin_email})</span>
                )}
              </p>
              <button
                style={{ ...s.approveBtn, opacity: approving ? 0.7 : 1 }}
                onClick={approve}
                disabled={approving}
              >
                {approving ? "Approving..." : "✅ Approve & Allow Blockchain Storage"}
              </button>
            </div>
          </div>
        )}

        {/* ── DOCTOR ACCESS REQUEST BANNERS ── */}
        {accessRequests.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {accessRequests.map((req) => (
              <div key={req.request_id} style={s.doctorRequestBanner}>
                <div style={s.doctorRequestIcon}>👨‍⚕️</div>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
                    Doctor Access Request
                  </strong>
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: "#1a3a5a", lineHeight: 1.6 }}>
                    <strong>{req.doctor_name}</strong> ({req.doctor_email})<br />
                    <span style={{ fontSize: 11, color: "#666" }}>
                      🆔 {req.doctor_id} &nbsp;|&nbsp; 🏥 {hospitalName(req.hospital)}
                    </span><br />
                    <span style={{ fontSize: 11, color: "#888" }}>
                      Requested: {formatTime(req.requested_at)}
                    </span>
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      style={{
                        ...s.approveBtn,
                        background: "#0f9d58",
                        opacity: respondingId === req.request_id ? 0.7 : 1
                      }}
                      onClick={() => approveDoctor(req.request_id)}
                      disabled={respondingId === req.request_id}
                    >
                      ✅ Approve Access
                    </button>
                    <button
                      style={{
                        ...s.approveBtn,
                        background: "#e53935",
                        opacity: respondingId === req.request_id ? 0.7 : 1
                      }}
                      onClick={() => denyDoctor(req.request_id)}
                      disabled={respondingId === req.request_id}
                    >
                      ❌ Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={s.grid}>
          {/* PROFILE CARD */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>My Profile</h2>
            <div style={s.profileRow}>
              <div style={s.avatar}>{email ? email[0].toUpperCase() : "P"}</div>
              <div>
                <p style={s.profileEmail}>{email}</p>
                <div style={s.pidBadge}>🆔 {data?.patient_id || "N/A"}</div>
              </div>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>Patient ID</span>
              <code style={s.infoCode}>{data?.patient_id}</code>
            </div>
            <div style={s.infoItem}>
              <span style={s.infoLabel}>Record Status</span>
              <span style={{
                ...s.statusBadge,
                background: data?.on_chain ? "#e6f4ea" : data?.pending ? "#fff3e0" : "#f5f5f5",
                color: data?.on_chain ? "#0f9d58" : data?.pending ? "#cc7a00" : "#888",
              }}>
                {data?.on_chain ? "✓ On Blockchain" : data?.pending ? "⏳ Pending Approval" : "No Record Yet"}
              </span>
            </div>
            {accessRequests.length > 0 && (
              <div style={s.infoItem}>
                <span style={s.infoLabel}>Pending Requests</span>
                <span style={{ background: "#ffebee", color: "#e53935", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                  🔔 {accessRequests.length} doctor request{accessRequests.length > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {/* EHR CARD */}
          {data?.on_chain && (
            <div style={s.card}>
              <h2 style={s.cardTitle}>My EHR</h2>
              <div style={s.consentRow}>
                <div>
                  <span style={s.consentLabel}>Doctor Access Consent</span>
                  <p style={s.consentDesc}>
                    {data.consent
                      ? "Doctors can request access to your EHR (you approve each request)."
                      : "Doctors cannot access your EHR until you enable consent."}
                  </p>
                </div>
                <label style={s.toggle}>
                  <input
                    type="checkbox"
                    checked={!!data.consent}
                    onChange={toggleConsent}
                    disabled={toggling}
                    style={{ display: "none" }}
                  />
                  <div style={{ ...s.toggleTrack, background: data.consent ? "#0f9d58" : "#ccc" }}>
                    <div style={{ ...s.toggleThumb, left: data.consent ? 24 : 3 }} />
                  </div>
                </label>
              </div>
              <div style={{
                ...s.consentStatus,
                color: data.consent ? "#0f9d58" : "#cc0000",
                background: data.consent ? "#e6f4ea" : "#fce8e8",
              }}>
                {data.consent ? "🟢 Consent Active — You approve each doctor individually" : "🔴 Consent Inactive — No doctor access"}
              </div>
              <button onClick={viewEHR} style={s.viewBtn}>📄 View My EHR (PDF)</button>
              <button
                onClick={showHistory ? () => setShowHistory(false) : viewHistory}
                style={{ ...s.viewBtn, background: "#546e7a", marginTop: 8 }}
              >
                {showHistory ? "▲ Hide History" : "📜 View Version History"}
              </button>

              {showHistory && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>EHR Version History</h3>
                  {history.length === 0 && <p style={{ fontSize: 13, color: "#aaa" }}>No history yet.</p>}
                  {history.map((h, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid #f0f0f0" }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{h.version}</span>
                        <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{h.cid?.slice(0, 20)}...</div>
                        <div style={{ fontSize: 11, color: "#888" }}>By: {h.updated_by}</div>
                      </div>
                      <button
                        onClick={() => window.open(`http://localhost:8000/ehr/download/${h.cid}`, "_blank")}
                        style={{ padding: "6px 14px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer" }}
                      >
                        👁 View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NO RECORD */}
          {!data?.pending && !data?.on_chain && (
            <div style={{ ...s.card, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#aaa", gap: 12 }}>
              <span style={{ fontSize: 40 }}>📂</span>
              <p style={{ margin: 0, fontSize: 14, textAlign: "center" }}>
                No EHR uploaded yet.<br />Please wait for your hospital to upload your record.
              </p>
            </div>
          )}
        </div>

        {/* WHO ACCESSED MY EHR */}
        <div style={{ ...s.card, marginTop: 24 }}>
          <h2 style={{ ...s.cardTitle, marginBottom: 6 }}>🔍 Who Accessed My EHR</h2>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 16, marginTop: 0 }}>
            Doctors you approved appear here.
          </p>
          {accessLog.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 0", color: "#aaa" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
              <p style={{ margin: 0, fontSize: 13 }}>No doctor has accessed your EHR yet.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8f9fa" }}>
                    <th style={s.th}>Doctor</th>
                    <th style={s.th}>Doctor ID</th>
                    <th style={s.th}>Hospital</th>
                    <th style={s.th}>Requested At</th>
                    <th style={s.th}>Expires</th>
                    <th style={s.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accessLog.map((row, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{row.doctor_name || "Unknown"}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{row.doctor_email}</div>
                      </td>
                      <td style={s.td}>
                        <span style={{ background: "#e8f0fe", color: "#1a73e8", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                          {row.doctor_id || "—"}
                        </span>
                      </td>
                      <td style={s.td}>
                        <span style={{ background: "#f1f3f4", color: "#555", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>
                          🏥 {hospitalName(row.hospital)}
                        </span>
                      </td>
                      <td style={{ ...s.td, fontSize: 12, color: "#666" }}>{formatTime(row.requested_at)}</td>
                      <td style={{ ...s.td, fontSize: 12, color: "#666" }}>{formatTime(row.expires_at)}</td>
                      <td style={s.td}>
                        {row.active ? (
                          <span style={{ background: "#e6f4ea", color: "#0f9d58", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>🟢 Active</span>
                        ) : (
                          <span style={{ background: "#f5f5f5", color: "#999", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>⚫ Expired</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const s = {
  loadingPage: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" },
  spinner: { width: 36, height: 36, border: "3px solid #e0e0e0", borderTopColor: "#1a73e8", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  page: { minHeight: "100vh", background: "#f5f7fa", fontFamily: "'Segoe UI', sans-serif" },
  topbar: { background: "#fff", borderBottom: "1px solid #eee", padding: "0 32px", height: 60, display: "flex", justifyContent: "space-between", alignItems: "center" },
  topbarLeft: { display: "flex", alignItems: "center", gap: 14 },
  logo: { fontWeight: 800, fontSize: 18, color: "#1a1a2e" },
  topbarRole: { background: "#e8f0fe", color: "#1a73e8", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 },
  topbarRight: { display: "flex", alignItems: "center", gap: 14 },
  topbarEmail: { fontSize: 13, color: "#666" },
  logoutBtn: { background: "none", border: "1.5px solid #ddd", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: "#555" },
  body: { maxWidth: 900, margin: "0 auto", padding: "32px 24px" },
  notifBanner: { background: "#fff8e1", border: "2px solid #ffcc02", borderRadius: 14, padding: 20, marginBottom: 20, display: "flex", gap: 16, alignItems: "flex-start" },
  notifIcon: { fontSize: 28, flexShrink: 0 },
  notifContent: { flex: 1 },
  approveBtn: { padding: "10px 20px", background: "#cc7a00", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" },
  doctorRequestBanner: { background: "#e8f4fd", border: "2px solid #1a73e8", borderRadius: 14, padding: 20, marginBottom: 12, display: "flex", gap: 16, alignItems: "flex-start" },
  doctorRequestIcon: { fontSize: 28, flexShrink: 0 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 },
  card: { background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
  cardTitle: { fontSize: 16, fontWeight: 700, color: "#1a1a2e", margin: "0 0 18px" },
  profileRow: { display: "flex", gap: 14, alignItems: "center", marginBottom: 20 },
  avatar: { width: 44, height: 44, borderRadius: "50%", background: "#1a73e8", color: "#fff", fontWeight: 800, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  profileEmail: { margin: "0 0 6px", fontSize: 14, fontWeight: 500, color: "#333" },
  pidBadge: { background: "#f5f5f5", fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 600, color: "#555", display: "inline-block" },
  infoItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid #f5f5f5" },
  infoLabel: { fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" },
  infoCode: { fontFamily: "monospace", fontSize: 12, background: "#f5f5f5", padding: "3px 8px", borderRadius: 4 },
  statusBadge: { fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20 },
  consentRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 },
  consentLabel: { fontSize: 14, fontWeight: 600, color: "#333", display: "block", marginBottom: 4 },
  consentDesc: { margin: 0, fontSize: 12, color: "#888", lineHeight: 1.5 },
  toggle: { cursor: "pointer", flexShrink: 0 },
  toggleTrack: { width: 46, height: 26, borderRadius: 13, position: "relative", transition: "background 0.3s" },
  toggleThumb: { width: 20, height: 20, background: "#fff", borderRadius: "50%", position: "absolute", top: 3, transition: "left 0.3s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" },
  consentStatus: { padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 16 },
  viewBtn: { width: "100%", padding: "11px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  th: { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" },
  td: { padding: "10px 12px", verticalAlign: "middle" },
};