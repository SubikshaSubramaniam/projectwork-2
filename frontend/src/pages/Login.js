import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../api/api";

export default function Login() {
  const nav = useNavigate();
  const hospital = localStorage.getItem("hospital") || "A";
  const hospitalName = localStorage.getItem("hospitalName") || "Hospital A";
  
  const [step, setStep] = useState("form"); // form | otp
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!email || !role) return alert("Fill email and role");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("email", email);
      await API.post("/auth/request-otp", form);
      setStep("otp");
    } catch (err) {
      alert("Failed to send OTP: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!otp) return alert("Enter OTP");
    setLoading(true);
    try {
      const form = new FormData();
      form.append("email", email);
      form.append("otp", otp);
      await API.post("/auth/verify-otp", form);

      if (isRegister) {
        const regForm = new FormData();
        regForm.append("email", email);
        regForm.append("role", role);
        const res = await API.post("/auth/register", regForm);
        const pid = res.data.patient_id;
        alert(
          role === "patient"
            ? `Registered! Your Patient ID is: ${pid}\nSave this — you'll need it.`
            : "Registered successfully!"
        );
      } else {
        const loginForm = new FormData();
        loginForm.append("email", email);
        loginForm.append("role", role);
        await API.post("/auth/login", loginForm);
      }

      localStorage.setItem("email", email);
      localStorage.setItem("role", role);
      nav("/" + role);
    } catch (err) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Back to hospital selection */}
        <button onClick={() => nav("/")} style={s.backBtn}>
          ← Change Hospital
        </button>

        {/* Hospital badge at top */}
        <div style={s.hospitalBadge}>
          🏥 {hospitalName}
        </div>

        <h2 style={s.title}>
          {isRegister ? "Create Account" : "Sign In"}
        </h2>

        {step === "form" && (
          <>
            <div style={s.field}>
              <label style={s.label}>Role</label>
              <select
                style={s.input}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">Select your role</option>
                <option value="patient">Patient</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input
                style={s.input}
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={isRegister}
                onChange={(e) => setIsRegister(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              New user? Register
            </label>

            <button
              style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
              onClick={sendOtp}
              disabled={loading}
            >
              {loading ? "Sending OTP..." : "Send OTP →"}
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <p style={s.otpInfo}>
              OTP sent to <strong>{email}</strong>
            </p>
            <div style={s.field}>
              <label style={s.label}>Enter OTP</label>
              <input
                style={{ ...s.input, letterSpacing: 8, fontSize: 22, textAlign: "center" }}
                maxLength={6}
                placeholder="------"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
            <button
              style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
              onClick={verify}
              disabled={loading}
            >
              {loading ? "Verifying..." : isRegister ? "Register" : "Login"}
            </button>
            <button style={s.ghostBtn} onClick={() => setStep("form")}>
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#f5f7ff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    background: "#fff",
    padding: 30,
    borderRadius: 12,
    width: 350,
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  },
  title: {
    textAlign: "center",
    marginBottom: 20,
  },
  field: {
    marginBottom: 15,
  },
  label: {
    display: "block",
    marginBottom: 5,
    fontWeight: "bold",
  },
  input: {
    width: "100%",
    padding: 8,
    borderRadius: 6,
    border: "1px solid #ccc",
  },
  btn: {
    width: "100%",
    padding: 10,
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    marginTop: 10,
  },
  checkLabel: {
    fontSize: 14,
    marginBottom: 10,
    display: "block",
  },
  otpInfo: {
    fontSize: 14,
    marginBottom: 10,
  },
  hospitalBadge: {
    background: "#e3f2fd",
    padding: "5px 10px",
    borderRadius: 6,
    marginBottom: 10,
    textAlign: "center",
  }
};