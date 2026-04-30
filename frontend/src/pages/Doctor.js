import { useState, useEffect, useRef } from "react";
import { API } from "../api/api";

export default function Doctor() {
  const email = localStorage.getItem("email") || "";
  const hospital = localStorage.getItem("hospital") || "A";
  const [patientId, setPatientId] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const pollRefs = useRef({});

  const doctorName = email
    ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Doctor";
  const doctorId = email
    ? "DOC-" + email.split("@")[0].toUpperCase().slice(0, 8)
    : "DOC-UNKNOWN";

  // Poll a pending request every 4s until approved/denied
  const startPolling = (request_id) => {
    if (pollRefs.current[request_id]) return;
    pollRefs.current[request_id] = setInterval(async () => {
      try {
        const res = await API.get(`/doctor/request-status/${request_id}`);
        const { status, token, expires_at, patient_id } = res.data;
        if (status === "approved") {
          clearInterval(pollRefs.current[request_id]);
          delete pollRefs.current[request_id];
          setRecords(prev => prev.map(r =>
            r.request_id === request_id
              ? { ...r, status: "approved", token, expires_at, record_id: patient_id }
              : r
          ));
        } else if (status === "denied") {
          clearInterval(pollRefs.current[request_id]);
          delete pollRefs.current[request_id];
          setRecords(prev => prev.map(r =>
            r.request_id === request_id ? { ...r, status: "denied" } : r
          ));
        }
      } catch (e) {
        console.log("poll error:", e);
      }
    }, 4000);
  };

  useEffect(() => {
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval);
    };
  }, []);

  const requestAccess = async () => {
    if (!patientId.trim()) return alert("Enter Patient ID");
    setLoading(true);
    try {
      const res = await API.post(
        "/access-request",
        { patientId: patientId.trim(), ttl: 3600, doctorEmail: email },
        {
          headers: {
            "Content-Type": "application/json",
            hospital: localStorage.getItem("hospital") || "A",
          },
        }
      );

      const newRecord = {
        patient_id: patientId,
        request_id: res.data.request_id,
        record_id: null,
        token: null,
        expires_at: null,
        doctor_name: res.data.doctor_name || doctorName,
        doctor_id: res.data.doctor_id || doctorId,
        status: "pending"
      };

      setRecords(prev => [...prev, newRecord]);
      startPolling(res.data.request_id);
      setPatientId("");
    } catch (err) {
      const detail = err.response?.data?.detail;
      alert("Error: " + (typeof detail === "string" ? detail : JSON.stringify(detail) || err.message));
    } finally {
      setLoading(false);
    }
  };

  const viewEHR = async (record_id, token, expires_at) => {
    if (Date.now() / 1000 > expires_at) {
      alert("Token expired. Request access again.");
      return;
    }
    try {
      const res = await API.get(`/view/${record_id}`, {
        params: { token: token.trim(), doctor_email: email },
        responseType: "blob"
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      alert("Failed to view: " + (err.response?.data?.detail || err.message));
    }
  };

  const logout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  const statusColor = { approved: "#0f9d58", pending: "#cc7a00", denied: "#e53935" };
  const statusLabel = { approved: "✅ Approved", pending: "⏳ Waiting for patient...", denied: "❌ Denied" };

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 24, fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Doctor Dashboard</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ background: "#e8f0fe", padding: "6px 14px", borderRadius: 20, fontWeight: 600 }}>
            Hospital {hospital}
          </span>
          <button onClick={logout} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}>
            Logout
          </button>
        </div>
      </div>

      {/* Doctor Identity */}
      <div style={{ background: "#f0f7ff", border: "1.5px solid #d0e3ff", borderRadius: 12, padding: 18, marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1a73e8", color: "#fff", fontWeight: 800, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {email ? email[0].toUpperCase() : "D"}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{doctorName}</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{email}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <span style={{ background: "#1a73e8", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>{doctorId}</span>
            <span style={{ background: "#e8f0fe", color: "#1a73e8", fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20 }}>Hospital {hospital}</span>
          </div>
        </div>
      </div>

      {/* How it works banner */}
      <div style={{ background: "#fff8e1", border: "1.5px solid #ffcc02", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#5a3200" }}>
        🔒 <strong>Patient approval required.</strong> When you request access, the patient will be notified and must approve before you can view their EHR.
      </div>

      {/* Request Access */}
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Request EHR Access</h2>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px" }}>
          Your name (<strong>{doctorName}</strong>) and ID (<strong>{doctorId}</strong>) will be sent to the patient.
        </p>
        <input
          placeholder="Enter Patient ID (e.g. PID-XXXXXXXX)"
          value={patientId}
          onChange={e => setPatientId(e.target.value)}
          style={{ width: "100%", padding: 9, marginBottom: 12, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
        />
        <button
          onClick={requestAccess}
          disabled={loading}
          style={{ padding: "10px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
        >
          {loading ? "Sending Request..." : "📤 Send Access Request"}
        </button>
      </div>

      {/* Requests Table */}
      {records.length > 0 && (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>My Access Requests</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f1f3f4" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Patient ID</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Status</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Expires</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "8px 12px" }}>
                    <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>{r.patient_id}</code>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      fontWeight: 600,
                      color: statusColor[r.status] || "#888",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}>
                      {r.status === "pending" && (
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#cc7a00", animation: "pulse 1.5s infinite" }} />
                      )}
                      {statusLabel[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "#888" }}>
                    {r.expires_at ? new Date(r.expires_at * 1000).toLocaleTimeString() : "—"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {r.status === "approved" && r.token && (
                      <button
                        onClick={() => viewEHR(r.record_id, r.token, r.expires_at)}
                        style={{ padding: "6px 14px", background: "#0f9d58", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                      >
                        👁 View EHR
                      </button>
                    )}
                    {r.status === "pending" && (
                      <span style={{ fontSize: 12, color: "#cc7a00" }}>Checking every 4s...</span>
                    )}
                    {r.status === "denied" && (
                      <span style={{ fontSize: 12, color: "#e53935" }}>Request rejected by patient</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}