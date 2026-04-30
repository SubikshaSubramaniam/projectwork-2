import sqlite3

def init_db():
    conn = sqlite3.connect("auth.db")
    cur = conn.cursor()

    # ================= USERS =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            role TEXT CHECK(role IN ('patient','doctor','admin')) NOT NULL,
            patient_id TEXT UNIQUE,
            verified INTEGER DEFAULT 0,
            created_at INTEGER
        )
    """)

    # ================= OTP =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS otp (
            email TEXT,
            code TEXT,
            expires INTEGER
        )
    """)

    # ================= PENDING RECORDS =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL,
            cid TEXT NOT NULL,
            record_id TEXT NOT NULL,
            file_hash TEXT,
            hospital TEXT DEFAULT 'A',
            status TEXT DEFAULT 'pending',
            created_at INTEGER,
            admin_email TEXT
        )
    """)

    # ================= ACCESS LOG =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL,
            record_id TEXT NOT NULL,
            doctor_email TEXT NOT NULL,
            doctor_name TEXT,
            doctor_id TEXT,
            hospital TEXT,
            token TEXT,
            expires_at INTEGER,
            requested_at INTEGER
        )
    """)

    # ================= ACCESS TOKENS =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS access_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            doctor_email TEXT NOT NULL,
            record_id TEXT NOT NULL,
            created_at INTEGER,
            expires_at INTEGER
        )
    """)

    # ================= EHR HISTORY =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ehr_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL,
            record_id TEXT NOT NULL,
            old_cid TEXT,
            new_cid TEXT NOT NULL,
            ch_hash TEXT,
            updated_by TEXT,
            updated_at INTEGER,
            version INTEGER DEFAULT 1
        )
    """)

    # ================= ACCESS REQUESTS =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS access_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT UNIQUE NOT NULL,
            patient_id TEXT NOT NULL,
            doctor_email TEXT NOT NULL,
            doctor_name TEXT,
            doctor_id TEXT,
            hospital TEXT,
            status TEXT DEFAULT 'pending',
            token TEXT,
            expires_at INTEGER,
            requested_at INTEGER,
            responded_at INTEGER
        )
    """)

    # ================= 🔥 NEW: UPDATE REQUESTS =================
    cur.execute("""
        CREATE TABLE IF NOT EXISTS update_requests (
            request_id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            cid TEXT NOT NULL,
            requested_by TEXT NOT NULL,
            leader TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER
        )
    """)

    # ================= SAFE UPGRADES =================
    upgrades = [
        ("pending_records", "admin_email", "TEXT"),
        ("access_log", "doctor_name", "TEXT"),
        ("access_log", "doctor_id", "TEXT"),
        ("access_log", "token", "TEXT"),
    ]

    for table, col, typ in upgrades:
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
        except Exception:
            pass

    conn.commit()
    conn.close()

    print("✅ DB ready (with update_requests)")