import { useState } from "react";
import { API } from "../api/api";

export default function Doctor() {
  const email = localStorage.getItem("email") || "";
  const hospital = localStorage.getItem("hospital") || "A";
  const [patientId, setPatientId] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const doctorName = email
    ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "Doctor";
  const doctorId = email
    ? "DOC-" + email.split("@")[0].toUpperCase().slice(0, 8)
    : "DOC-UNKNOWN";

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
      setRecords(prev => [...prev, {
        patient_id: patientId,
        record_id: res.data.record_id,
        token: res.data.token,
        expires_at: res.data.expires_at,
        doctor_name: res.data.doctor_name || doctorName,
        doctor_id: res.data.doctor_id || doctorId,
        status: "approved"
      }]);
      alert("Access granted!");
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
      setRecords(prev => prev.map(r => r.token === token ? { ...r, status: "expired" } : r));
      return;
    }
    try {
      const res = await API.get(`/view/${record_id}`, {
        params: { token: token.trim() },
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

      {/* Doctor Identity Card */}
      <div style={{ background: "#f0f7ff", border: "1.5px solid #d0e3ff", borderRadius: 12, padding: 18, marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1a73e8", color: "#fff", fontWeight: 800, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {email ? email[0].toUpperCase() : "D"}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{doctorName}</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{email}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <span style={{ background: "#1a73e8", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
              {doctorId}
            </span>
            <span style={{ background: "#e8f0fe", color: "#1a73e8", fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20 }}>
              Hospital {hospital}
            </span>
          </div>
        </div>
      </div>

      {/* Request Access */}
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Request EHR Access</h2>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px" }}>
          Your name (<strong>{doctorName}</strong>) and ID (<strong>{doctorId}</strong>) will be sent with this request.
        </p>
        <input
          placeholder="Enter Patient ID"
          value={patientId}
          onChange={e => setPatientId(e.target.value)}
          style={{ width: "100%", padding: 9, marginBottom: 12, boxSizing: "border-box", borderRadius: 6, border: "1px solid #ccc" }}
        />
        <button
          onClick={requestAccess}
          disabled={loading}
          style={{ padding: "10px 24px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
        >
          {loading ? "Requesting..." : "Request Access"}
        </button>
      </div>

      {/* Access Granted Table */}
      {records.length > 0 && (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>Access Granted</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f1f3f4" }}>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Patient ID</th>
                <th style={{ padding: "8px 12px", textAlign: "left" }}>Requested By</th>
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
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.doctor_name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{r.doctor_id}</div>
                  </td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: r.status === "approved" ? "#21a021" : "#cc0000" }}>
                    {r.status}
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "#888" }}>
                    {r.expires_at ? new Date(r.expires_at * 1000).toLocaleTimeString() : "-"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {r.status === "approved" && (
                      <button
                        onClick={() => viewEHR(r.record_id, r.token, r.expires_at)}
                        style={{ padding: "6px 14px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                      >
                        View EHR
                      </button>
                    )}
                    {r.status === "expired" && <span style={{ color: "#cc0000" }}>Expired</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
