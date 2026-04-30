import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

export default function Admin() {
  const nav = useNavigate();
  const hospital = localStorage.getItem("hospital") || "A";
  const hospitalName = localStorage.getItem("hospitalName") || "Hospital A";
  const email = localStorage.getItem("email");

  // Active nav section
  const [activeNav, setActiveNav] = useState("upload");

  // Step 1 — upload state
  const [patientId, setPatientId] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [requestingSent, setRequestingSent] = useState(false);

  // Records table
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [storingId, setStoringId] = useState(null);

  // Update Record state
  const [updatePatientId, setUpdatePatientId] = useState("");
  const [updateFile, setUpdateFile] = useState(null);
  const [leader, setLeader] = useState(null);
  const [electing, setElecting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);

  const logout = () => {
    localStorage.clear();
    nav("/");
  };

  const orgMSP = { A: "Org1MSP", B: "Org2MSP", C: "Org3MSP", D: "Org4MSP" }[hospital] || "Org1MSP";

  const loadRecords = async () => {
    setLoadingRecords(true);
    try {
      const res = await API.get("/admin/pending");
      setRecords(res.data);
    } catch (err) {
      console.error("Failed to load records", err);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadRecords();
    const interval = setInterval(loadRecords, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── UPLOAD FLOW ──
  const doUpload = async () => {
    if (!file) return alert("Select a PDF file first");
    if (!patientId.trim()) return alert("Enter a Patient ID");
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append("patient_id", patientId.trim());
      form.append("file", file);
      const res = await API.post("/admin/upload-record", form, {
        headers: {
          hospital: localStorage.getItem("hospital") || "A",
          "x-admin-email": email || "",   // ← sends admin identity to backend
        },
      });
      setUploadResult(res.data);
    } catch (err) {
      alert("Upload failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  const requestApproval = async () => {
    if (!uploadResult) return;
    setRequestingSent(true);
    try {
      const form = new FormData();
      form.append("record_id", uploadResult.record_id);
      await API.post("/admin/request-approval", form, {
        headers: { hospital: localStorage.getItem("hospital") || "A" },
      });
      alert("Approval notification sent to patient!");
      setUploadResult(null);
      setPatientId("");
      setFile(null);
      setRequestingSent(false);
      loadRecords();
    } catch (err) {
      alert("Failed to notify: " + (err.response?.data?.detail || err.message));
      setRequestingSent(false);
    }
  };

  const storeOnChain = async (record_id) => {
    setStoringId(record_id);
    try {
      const form = new FormData();
      form.append("record_id", record_id);
      await API.post("/admin/store-on-chain", form, {
        headers: { hospital: localStorage.getItem("hospital") || "A" },
      });
      alert("✅ Stored on blockchain!");
      loadRecords();
    } catch (err) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setStoringId(null);
    }
  };

  // ── UPDATE FLOW ──
  const electLeader = async () => {
    setElecting(true);
    setLeader(null);
    setUpdateResult(null);
    try {
      const res = await API.post("/admin/elect-leader", null, {
        headers: { hospital: localStorage.getItem("hospital") || "A" },
      });
      setLeader(res.data);
    } catch (err) {
      alert("Election failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setElecting(false);
    }
  };

  const checkCurrentLeader = async () => {
    try {
      const res = await API.get("/admin/current-leader", {
        headers: { hospital: localStorage.getItem("hospital") || "A" },
      });
      setLeader(res.data);
    } catch (err) {
      alert("Failed to get leader: " + (err.response?.data?.detail || err.message));
    }
  };

  const doUpdate = async () => {
    if (!updatePatientId.trim()) return alert("Enter Patient ID");
    if (!updateFile) return alert("Select new EHR PDF");
    if (!leader?.active) return alert("Run leader election first");
    if (leader.leader !== orgMSP) {
      return alert(`Only ${leader.leader} can update. You are ${orgMSP}.`);
    }
    setUpdating(true);
    setUpdateResult(null);
    try {
      const form = new FormData();
      form.append("patient_id", updatePatientId.trim());
      form.append("file", updateFile);
      const res = await API.post("/admin/update-record", form, {
        headers: { hospital: localStorage.getItem("hospital") || "A" },
      });
      setUpdateResult(res.data);
      if (!res.data.is_leader && res.data.request_id) {
        const poll = setInterval(async () => {
          try {
            const r = await API.get("/admin/pending-update-requests", { headers: { hospital } });
            const found = (r.data || []).find(x => x.request_id === res.data.request_id);
            if (!found) { setUpdateResult(p => ({...p, status: "approved"})); clearInterval(poll); }
          } catch(e) { clearInterval(poll); }
        }, 3000);
      }
    } catch (err) {
      alert("Update failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setUpdating(false);
    }
  };

  const statusColor = (s) =>
    ({ pending: "#cc7a00", notified: "#7b1fa2", approved: "#1a73e8", stored: "#0f9d58" }[s] || "#888");

  const statusLabel = (s) =>
    ({
      pending: "Pending Upload",
      notified: "Waiting Patient Approval",
      approved: "Patient Approved ✓",
      stored: "On Blockchain ✓",
    }[s] || s);

  const isLeader = leader?.active && leader?.leader === orgMSP;

  return (
    <div style={s.page}>
      {/* SIDEBAR */}
      <div style={s.sidebar}>
        <div>
          <div style={s.sidebarLogo}>⛓️ EHRChain</div>
          <div style={s.sidebarHospital}>
            <div style={s.hospitalDot} />
            {hospitalName}
          </div>
          <div style={s.sidebarEmail}>{email}</div>
        </div>

        <nav style={s.nav}>
          {[
            { id: "upload", icon: "📁", label: "Upload EHR" },
            { id: "records", icon: "📋", label: "Records" },
            { id: "update", icon: "✏️", label: "Update Record" },
          ].map((item) => (
            <div
              key={item.id}
              style={{
                ...s.navItem,
                ...(activeNav === item.id ? s.navItemActive : {}),
              }}
              onClick={() => setActiveNav(item.id)}
            >
              {item.icon} {item.label}
            </div>
          ))}
        </nav>

        <button onClick={logout} style={s.logoutBtn}>
          ← Logout
        </button>
      </div>

      {/* MAIN */}
      <div style={s.main}>
        <div style={s.header}>
          <h1 style={s.pageTitle}>Admin Dashboard</h1>
          <span style={s.hospitalPill}>
            🏥 {hospitalName} ({orgMSP})
          </span>
        </div>

        {/* ── UPLOAD SECTION ── */}
        {activeNav === "upload" && (
          <div style={s.card}>
            <h2 style={s.cardTitle}>
              <span style={s.stepNum}>1</span>
              Encrypt & Upload to IPFS
            </h2>
            <p style={s.cardDesc}>
              Upload a patient's EHR PDF. It will be encrypted and sent to IPFS.
              CID and hash are saved in the database temporarily.
            </p>

            <div style={s.formGroup}>
              <label style={s.label}>Patient ID</label>
              <input
                style={s.input}
                placeholder="e.g. PID-XXXXXXXX"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                disabled={!!uploadResult}
              />
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>EHR File (PDF only)</label>
              <div style={s.fileBox}>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setUpdateFile(null) || setFile(e.target.files[0])}
                  disabled={!!uploadResult}
                  style={{ fontSize: 13 }}
                />
                {file && <span style={s.fileName}>📄 {file.name}</span>}
              </div>
            </div>

            {!uploadResult && (
              <button
                style={{ ...s.btn, opacity: uploading ? 0.7 : 1 }}
                onClick={doUpload}
                disabled={uploading}
              >
                {uploading ? "⏳ Encrypting & Uploading..." : "🔒 Encrypt & Upload to IPFS"}
              </button>
            )}

            {uploadResult && (
              <div style={s.resultBox}>
                <div style={s.resultRow}>
                  <span style={s.resultLabel}>Record ID</span>
                  <span style={s.resultVal}>{uploadResult.record_id}</span>
                </div>
                <div style={s.resultRow}>
                  <span style={s.resultLabel}>IPFS CID</span>
                  <span style={{ ...s.resultVal, wordBreak: "break-all", fontSize: 12 }}>
                    {uploadResult.cid}
                  </span>
                </div>
                <div style={s.resultRow}>
                  <span style={s.resultLabel}>SHA-256 Hash</span>
                  <span style={{ ...s.resultVal, wordBreak: "break-all", fontSize: 12 }}>
                    {uploadResult.file_hash}
                  </span>
                </div>
                <div style={s.step2Banner}>
                  <div>
                    <strong style={{ display: "block", marginBottom: 4 }}>
                      ✅ Uploaded to IPFS successfully
                    </strong>
                    <span style={{ fontSize: 13, color: "#555" }}>
                      Send an approval request to the patient. Once they approve,
                      store on the blockchain from the Records tab.
                    </span>
                  </div>
                  <button
                    style={{ ...s.btn, background: "#7b1fa2", marginTop: 12 }}
                    onClick={requestApproval}
                    disabled={requestingSent}
                  >
                    {requestingSent ? "Sending..." : "📨 Request Patient Approval"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RECORDS SECTION ── */}
        {activeNav === "records" && (
          <div style={s.card}>
            <div style={s.tableHeader}>
              <h2 style={{ ...s.cardTitle, margin: 0 }}>
                <span style={s.stepNum}>2</span>
                Records — {hospitalName}
              </h2>
              <button style={s.refreshBtn} onClick={loadRecords} disabled={loadingRecords}>
                {loadingRecords ? "↻ Loading..." : "↻ Refresh"}
              </button>
            </div>

            {records.length === 0 ? (
              <div style={s.empty}>No records yet for this hospital.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr style={s.thead}>
                      <th style={s.th}>Patient ID</th>
                      <th style={s.th}>Uploaded By</th>
                      <th style={s.th}>Hospital</th>
                      <th style={s.th}>CID</th>
                      <th style={s.th}>Hash (short)</th>
                      <th style={s.th}>Status</th>
                      <th style={s.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={i} style={s.tr}>
                        <td style={s.td}>
                          <code style={s.code}>{r.patient_id}</code>
                        </td>
                        <td style={s.td}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {r.admin_email ? r.admin_email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "—"}
                          </div>
                          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                            🆔 {r.admin_id || "—"}
                          </div>
                        </td>
                        <td style={s.td}>
                          <span style={{ background: "#e8f0fe", color: "#1a73e8", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20 }}>
                            🏥 Hospital {r.hospital || hospitalName}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span style={s.cidText}>{r.cid.slice(0, 18)}…</span>
                        </td>
                        <td style={s.td}>
                          <span style={s.cidText}>
                            {r.file_hash ? r.file_hash.slice(0, 14) + "…" : "—"}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span
                            style={{
                              ...s.badge,
                              background: statusColor(r.status) + "18",
                              color: statusColor(r.status),
                            }}
                          >
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td style={s.td}>
                          {r.status === "approved" && (
                            <button
                              style={{
                                ...s.actionBtn,
                                background: "#0f9d58",
                                opacity: storingId === r.record_id ? 0.7 : 1,
                              }}
                              onClick={() => storeOnChain(r.record_id)}
                              disabled={storingId === r.record_id}
                            >
                              {storingId === r.record_id ? "Storing…" : "⛓ Store on Blockchain"}
                            </button>
                          )}
                          {r.status === "stored" && (
                            <span style={{ color: "#0f9d58", fontWeight: 600, fontSize: 13 }}>
                              ✓ On chain
                            </span>
                          )}
                          {r.status === "notified" && (
                            <span style={{ color: "#7b1fa2", fontSize: 13 }}>
                              ⏳ Waiting for patient…
                            </span>
                          )}
                          {r.status === "pending" && (
                            <span style={{ color: "#aaa", fontSize: 13 }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── UPDATE RECORD SECTION ── */}
        {activeNav === "update" && (
          <>
            {/* Step 1 — Leader Election */}
            <div style={s.card}>
              <h2 style={s.cardTitle}>
                <span style={s.stepNum}>1</span>
                Leader Election (Bully Algorithm)
              </h2>
              <p style={s.cardDesc}>
                Only the elected leader can update EHR records. Run election first
                to determine which organisation has authority to update.
              </p>

              <div style={s.leaderRow}>
                <button
                  style={{ ...s.btn, opacity: electing ? 0.7 : 1 }}
                  onClick={electLeader}
                  disabled={electing}
                >
                  {electing ? "⏳ Running Election..." : "⚡ Run Leader Election"}
                </button>
                <button
                  style={{ ...s.btn, background: "#546e7a" }}
                  onClick={checkCurrentLeader}
                >
                  🔍 Check Current Leader
                </button>
              </div>

              {leader && (
                <div
                  style={{
                    ...s.leaderBox,
                    borderColor: leader.active ? "#0f9d58" : "#e53935",
                    background: leader.active ? "#e6f4ea" : "#ffebee",
                  }}
                >
                  <div style={s.leaderBoxRow}>
                    <span style={s.leaderLabel}>Current Leader</span>
                    <span
                      style={{
                        ...s.leaderValue,
                        color: leader.active ? "#0f9d58" : "#e53935",
                      }}
                    >
                      {leader.leader || "None"}
                    </span>
                  </div>
                  <div style={s.leaderBoxRow}>
                    <span style={s.leaderLabel}>Status</span>
                    <span
                      style={{
                        ...s.badge,
                        background: leader.active ? "#0f9d5820" : "#e5393520",
                        color: leader.active ? "#0f9d58" : "#e53935",
                      }}
                    >
                      {leader.active ? "🟢 Active" : "🔴 Inactive"}
                    </span>
                  </div>
                  <div style={s.leaderBoxRow}>
                    <span style={s.leaderLabel}>Your Org</span>
                    <span style={s.leaderValue}>{orgMSP}</span>
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: isLeader ? "#0f9d5810" : "#e5393510",
                      color: isLeader ? "#0f9d58" : "#e53935",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {isLeader
                      ? "✅ You are the leader — you can update records below"
                      : `❌ You are not the leader. Only ${leader.leader} can update.`}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2 — Update Record */}
            <div style={{ ...s.card, opacity: isLeader ? 1 : 0.5 }}>
              <h2 style={s.cardTitle}>
                <span style={{ ...s.stepNum, background: isLeader ? "#1a73e8" : "#aaa" }}>2</span>
                Update EHR Record
                {!isLeader && (
                  <span style={{ fontSize: 12, color: "#e53935", fontWeight: 500, marginLeft: 8 }}>
                    — Leader only
                  </span>
                )}
              </h2>
              <p style={s.cardDesc}>
                Upload the updated EHR PDF. It will be encrypted, uploaded to IPFS,
                and the new CID stored on the blockchain.
              </p>

              <div style={s.formGroup}>
                <label style={s.label}>Patient ID</label>
                <input
                  style={{
                    ...s.input,
                    background: isLeader ? "#fff" : "#f5f5f5",
                    cursor: isLeader ? "text" : "not-allowed",
                  }}
                  placeholder="e.g. PID-XXXXXXXX"
                  value={updatePatientId}
                  onChange={(e) => setUpdatePatientId(e.target.value)}
                  disabled={!isLeader || updating}
                />
              </div>

              <div style={s.formGroup}>
                <label style={s.label}>Updated EHR File (PDF only)</label>
                <div style={s.fileBox}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setUpdateFile(e.target.files[0])}
                    disabled={!isLeader || updating}
                    style={{ fontSize: 13 }}
                  />
                  {updateFile && (
                    <span style={s.fileName}>📄 {updateFile.name}</span>
                  )}
                </div>
              </div>

              <button
                style={{
                  ...s.btn,
                  background: isLeader ? "#e53935" : "#ccc",
                  cursor: isLeader ? "pointer" : "not-allowed",
                  opacity: updating ? 0.7 : 1,
                }}
                onClick={doUpdate}
                disabled={!isLeader || updating}
              >
                {updating ? "⏳ Updating..." : "✏️ Update Record on Blockchain"}
              </button>

              {updateResult && (
                <div style={{ ...s.resultBox, marginTop: 16, borderColor: "#0f9d58" }}>
                  <div style={{ color: "#0f9d58", fontWeight: 700, marginBottom: 12 }}>
                    ✅ Record Updated Successfully
                  </div>
                  <div style={s.resultRow}>
                    <span style={s.resultLabel}>New CID</span>
                    <span style={{ ...s.resultVal, wordBreak: "break-all", fontSize: 12 }}>
                      {updateResult.cid}
                    </span>
                  </div>
                  <div style={s.resultRow}>
                    <span style={s.resultLabel}>New Hash</span>
                    <span style={{ ...s.resultVal, wordBreak: "break-all", fontSize: 12 }}>
                      {updateResult.hash}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "'Segoe UI', sans-serif",
    background: "#f5f7fa",
  },
  sidebar: {
    width: 220,
    background: "#1a1a2e",
    color: "#fff",
    padding: "28px 20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  sidebarLogo: {
    fontSize: 18,
    fontWeight: 800,
    marginBottom: 20,
    letterSpacing: "-0.5px",
  },
  sidebarHospital: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "#b0bec5",
    marginBottom: 4,
  },
  hospitalDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#0f9d58",
    flexShrink: 0,
  },
  sidebarEmail: {
    fontSize: 11,
    color: "#546e7a",
    marginLeft: 16,
    marginBottom: 28,
    wordBreak: "break-all",
  },
  nav: { flex: 1 },
  navItem: {
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 13,
    color: "#90a4ae",
    cursor: "pointer",
    marginBottom: 4,
    transition: "all 0.15s",
  },
  navItemActive: {
    background: "#ffffff14",
    color: "#fff",
    fontWeight: 600,
  },
  logoutBtn: {
    background: "none",
    border: "1px solid #ffffff22",
    color: "#90a4ae",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
    width: "100%",
  },
  main: {
    flex: 1,
    padding: "32px 36px",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: 800,
    color: "#1a1a2e",
    margin: 0,
  },
  hospitalPill: {
    background: "#e8f0fe",
    color: "#1a73e8",
    fontWeight: 700,
    fontSize: 13,
    padding: "6px 16px",
    borderRadius: 20,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    transition: "opacity 0.3s",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 8px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  stepNum: {
    background: "#1a73e8",
    color: "#fff",
    borderRadius: "50%",
    width: 24,
    height: 24,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  },
  cardDesc: {
    color: "#666",
    fontSize: 13,
    margin: "0 0 20px",
    lineHeight: 1.6,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1.5px solid #e0e0e0",
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
    fontFamily: "inherit",
    outline: "none",
  },
  fileBox: {
    border: "1.5px dashed #d0d0d0",
    borderRadius: 8,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#fafafa",
  },
  fileName: {
    fontSize: 13,
    color: "#1a73e8",
    fontWeight: 500,
  },
  btn: {
    padding: "12px 24px",
    background: "#1a73e8",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    marginRight: 12,
    marginBottom: 8,
  },
  resultBox: {
    background: "#f8faff",
    border: "1.5px solid #d0e3ff",
    borderRadius: 10,
    padding: 18,
    marginTop: 16,
  },
  resultRow: {
    display: "flex",
    gap: 12,
    marginBottom: 10,
    alignItems: "flex-start",
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    minWidth: 100,
    paddingTop: 2,
  },
  resultVal: {
    fontSize: 13,
    color: "#1a1a2e",
    fontWeight: 500,
  },
  step2Banner: {
    background: "#fff",
    border: "1.5px solid #ce93d8",
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  refreshBtn: {
    background: "none",
    border: "1.5px solid #e0e0e0",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer",
    color: "#555",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  thead: { background: "#f5f7fa" },
  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "1px solid #eee",
  },
  tr: { borderBottom: "1px solid #f0f0f0" },
  td: { padding: "12px 14px", verticalAlign: "middle" },
  code: {
    background: "#f5f5f5",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "monospace",
  },
  cidText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#888",
  },
  badge: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
  },
  actionBtn: {
    padding: "7px 14px",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  empty: {
    color: "#aaa",
    textAlign: "center",
    padding: "32px 0",
    fontSize: 14,
  },
  // Leader Election styles
  leaderRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  leaderBox: {
    border: "1.5px solid",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  leaderBoxRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  leaderLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  leaderValue: {
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "monospace",
  },
};
