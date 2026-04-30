import { useNavigate } from "react-router-dom";

const hospitals = [
  {
    id: "A",
    name: "Hospital Alpha",
    org: "Org1",
    location: "North District",
    color: "#1a73e8",
    accent: "#e8f0fe",
    icon: "🏥",
    beds: 320,
    speciality: "General & Cardiology",
  },
  {
    id: "B",
    name: "Hospital Beta",
    org: "Org2",
    location: "South District",
    color: "#0f9d58",
    accent: "#e6f4ea",
    icon: "🏨",
    beds: 210,
    speciality: "Neurology & Oncology",
  },
  {
    id: "C",
    name: "Hospital Gamma",
    org: "Org3",
    location: "East District",
    color: "#f9a825",
    accent: "#fff8e1",
    icon: "🏥",
    beds: 180,
    speciality: "Orthopedics",
  },
  {
    id: "D",
    name: "Hospital Delta",
    org: "Org4",
    location: "West District",
    color: "#e53935",
    accent: "#ffebee",
    icon: "🏨",
    beds: 150,
    speciality: "Pediatrics & ENT",
  },
];

export default function Hospital() {
  const nav = useNavigate();

  const select = (hospital) => {
    localStorage.setItem("hospital", hospital.id);
    localStorage.setItem("hospitalName", hospital.name);
    localStorage.setItem("org", hospital.org);
    nav("/login");
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>⛓️</div>
          <h1 style={styles.title}>EHRChain</h1>
          <p style={styles.subtitle}>
            Decentralized Electronic Health Records
          </p>
          <p style={styles.instruction}>
            Select your hospital to continue
          </p>
        </div>

        {/* Hospital Cards */}
        <div style={styles.grid}>
          {hospitals.map((h) => (
            <button
              key={h.id}
              onClick={() => select(h)}
              style={styles.card}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-6px)";
                e.currentTarget.style.boxShadow = `0 16px 40px ${h.color}33`;
                e.currentTarget.style.borderColor = h.color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
                e.currentTarget.style.borderColor = "#e0e0e0";
              }}
            >
              <div style={{ ...styles.iconBox, background: h.accent }}>
                <span style={{ fontSize: 36 }}>{h.icon}</span>
              </div>

              <div style={styles.cardBody}>
                <div style={{ ...styles.orgBadge, background: h.color }}>
                  {h.org}
                </div>
                <h2 style={{ ...styles.hospitalName, color: h.color }}>
                  {h.name}
                </h2>
                <p style={styles.location}>📍 {h.location}</p>

                <div style={styles.divider} />

                <div style={styles.stats}>
                  <div style={styles.stat}>
                    <span style={styles.statNum}>{h.beds}</span>
                    <span style={styles.statLabel}>Beds</span>
                  </div>
                  <div style={styles.statDivider} />
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Speciality</span>
                    <span style={{ ...styles.statNum, fontSize: 12 }}>
                      {h.speciality}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ ...styles.selectBtn, background: h.color }}>
                Enter as this Hospital →
              </div>
            </button>
          ))}
        </div>

        <p style={styles.footer}>
          Powered by Hyperledger Fabric + IPFS
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Segoe UI', sans-serif",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 900,
  },
  header: {
    textAlign: "center",
    marginBottom: 40,
  },
  logo: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: 800,
    color: "#1a1a2e",
    margin: "0 0 8px",
    letterSpacing: "-1px",
  },
  subtitle: {
    color: "#5f6368",
    fontSize: 15,
    margin: "0 0 6px",
  },
  instruction: {
    color: "#888",
    fontSize: 13,
    margin: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 24,
    marginBottom: 32,
  },
  card: {
    background: "#fff",
    border: "2px solid #e0e0e0",
    borderRadius: 20,
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.25s ease",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  iconBox: {
    padding: "24px 24px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: "0 24px 16px",
    flex: 1,
  },
  orgBadge: {
    display: "inline-block",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 20,
    marginBottom: 10,
    letterSpacing: "0.5px",
  },
  hospitalName: {
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 6px",
  },
  location: {
    color: "#666",
    fontSize: 13,
    margin: 0,
  },
  divider: {
    borderTop: "1px solid #f0f0f0",
    margin: "14px 0",
  },
  stats: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  stat: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  statNum: {
    fontWeight: 700,
    fontSize: 15,
    color: "#1a1a2e",
  },
  statLabel: {
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  statDivider: {
    width: 1,
    height: 30,
    background: "#eee",
  },
  selectBtn: {
    padding: "14px 24px",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    textAlign: "center",
    letterSpacing: "0.3px",
  },
  footer: {
    textAlign: "center",
    color: "#aaa",
    fontSize: 12,
  },
};