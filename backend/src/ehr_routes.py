import requests
import hashlib
import uuid
import time
import sqlite3
import random
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, UploadFile, Form, HTTPException, Request
from fastapi.responses import Response
from dotenv import load_dotenv
import os

from ipfs.ipfs_helper import upload_to_ipfs_bytes, download_from_ipfs_bytes
from ipfs.aes_gcm import encrypt_bytes

from fabric_utils import (
    store_record_fabric,
    get_record_by_patient_fabric,
    toggle_consent_fabric,
    request_access_fabric,
    check_token_fabric,
    get_record_fabric,
    elect_leader_fabric,
    get_current_leader_fabric,
    update_record_fabric
)

load_dotenv()

EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("EMAIL_PASSWORD")
router = APIRouter(prefix="/ehr")


def get_db():
    conn = sqlite3.connect("auth.db", check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


# ─────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────
@router.post("/auth/request-otp")
def request_otp(email: str = Form(...)):
    code = str(random.randint(100000, 999999))
    expires = int(time.time()) + 300
    db = get_db()
    db.execute("DELETE FROM otp WHERE email=?", (email,))
    db.execute("INSERT INTO otp VALUES (?,?,?)", (email, code, expires))
    db.commit()
    try:
        msg = EmailMessage()
        msg.set_content(f"Your OTP is {code}")
        msg["Subject"] = "EHR Login OTP"
        msg["From"] = EMAIL
        msg["To"] = email
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls()
            s.login(EMAIL, PASSWORD)
            s.send_message(msg)
    except Exception as e:
        print("Email error:", e)
    return {"message": "OTP sent"}


@router.post("/auth/verify-otp")
def verify_otp(email: str = Form(...), otp: str = Form(...)):
    db = get_db()
    row = db.execute("SELECT code, expires FROM otp WHERE email=?", (email,)).fetchone()
    if not row or row[0] != otp or row[1] < time.time():
        raise HTTPException(401, "Invalid OTP")
    return {"message": "Verified"}


@router.post("/auth/register")
def register(email: str = Form(...), role: str = Form(...)):
    db = get_db()
    patient_id = None
    if role == "patient":
        patient_id = "PID-" + uuid.uuid4().hex[:10].upper()
    db.execute("""
        INSERT INTO users (email, role, patient_id, verified, created_at)
        VALUES (?,?,?,1,?)
    """, (email, role, patient_id, int(time.time())))
    db.commit()
    return {"patient_id": patient_id, "role": role}


@router.post("/auth/login")
def login(email: str = Form(...), role: str = Form(...)):
    db = get_db()
    user = db.execute(
        "SELECT role, patient_id FROM users WHERE email=?", (email,)
    ).fetchone()
    if not user:
        raise HTTPException(401, "User not found")
    if user[0] != role:
        raise HTTPException(400, "Role mismatch")
    return {"role": user[0], "patient_id": user[1]}


# ─────────────────────────────────────────
# ADMIN — Step 1: Encrypt + Upload to IPFS
# ─────────────────────────────────────────
@router.post("/admin/upload-record")
async def upload_record(
    request: Request,
    patient_id: str = Form(...),
    file: UploadFile = None
):
    hospital = request.headers.get("hospital", "A")
    db = get_db()

    row = db.execute(
        "SELECT patient_id FROM users WHERE patient_id=? AND role='patient'",
        (patient_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Patient not found")

    file_bytes = await file.read()
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    encrypted = encrypt_bytes(file_bytes)
    cid = upload_to_ipfs_bytes(encrypted)
    record_id = uuid.uuid4().hex
    admin_email = request.headers.get("x-admin-email", "")

    # Generate chameleon hash for this patient
    ch_hash_value = file_hash
    ch_r_hex = ""
    ch_pubkey_hex = ""
    ch_privkey_hex = ""
    try:
        from chameleon_hash.ch_secp256k1 import encode_message, ch_hash, _rand_scalar, SECP256K1_N
        import secrets
        from coincurve import PrivateKey
        # Generate keypair (trapdoor)
        priv_scalar = _rand_scalar()
        priv_key = PrivateKey(priv_scalar.to_bytes(32, "big"))
        pub_key = priv_key.public_key
        # Generate random r
        r = _rand_scalar()
        # Encode message
        msg = encode_message(cid, True, patient_id.encode())
        # Compute chameleon hash
        ch_hash_value, _ = ch_hash(msg, r, pub_key.format(compressed=True))
        ch_r_hex = hex(r)
        ch_pubkey_hex = pub_key.format(compressed=True).hex()
        ch_privkey_hex = hex(priv_scalar)
    except Exception as e:
        print(f"⚠️ Chameleon hash error: {e}")

    db.execute("""
        INSERT INTO pending_records
        (patient_id, cid, record_id, file_hash, hospital, created_at, status, admin_email, ch_r, ch_pubkey, ch_privkey, ch_hash)
        VALUES (?,?,?,?,?,?,'pending',?,?,?,?,?)
    """, (patient_id, cid, record_id, file_hash, hospital, int(time.time()), admin_email, ch_r_hex, ch_pubkey_hex, ch_privkey_hex, ch_hash_value))
    db.commit()

    return {
        "message": "Uploaded to IPFS. Waiting for patient approval.",
        "record_id": record_id,
        "cid": cid,
        "file_hash": file_hash,
        "status": "pending"
    }


# ─────────────────────────────────────────
# ADMIN — Request patient approval
# ─────────────────────────────────────────
@router.post("/admin/request-approval")
def request_approval(record_id: str = Form(...)):
    db = get_db()
    row = db.execute(
        "SELECT patient_id FROM pending_records WHERE record_id=?",
        (record_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Record not found")
    db.execute(
        "UPDATE pending_records SET status='notified' WHERE record_id=?",
        (record_id,)
    )
    db.commit()
    return {"message": "Patient notified"}


# ─────────────────────────────────────────
# ADMIN — Store on blockchain (after patient approves)
# ─────────────────────────────────────────
@router.post("/admin/store-on-chain")
def store_on_chain(request: Request, record_id: str = Form(...)):
    db = get_db()
    row = db.execute("""
        SELECT patient_id, cid, hospital, status
        FROM pending_records WHERE record_id=?
    """, (record_id,)).fetchone()

    if not row:
        raise HTTPException(404, "Record not found")

    patient_id, cid, db_hospital, status = row

    if status != "approved":
        raise HTTPException(400, "Patient has not approved yet")

    hospital = request.headers.get("hospital")
    if not hospital or hospital == "undefined":
        hospital = db_hospital or "A"
    hospital = hospital.strip().upper()

    if hospital not in ["A", "B", "C", "D"]:
        raise HTTPException(400, "invalid hospital")

    result = store_record_fabric(record_id, patient_id, cid, hospital)
    if "error" in result:
        raise HTTPException(500, f"Blockchain error: {result['error']}")

    db.execute(
        "UPDATE pending_records SET status='stored' WHERE record_id=?",
        (record_id,)
    )
    db.commit()
    return {"message": "Stored on blockchain", "record_id": record_id}


# ─────────────────────────────────────────
# ADMIN — Get pending records
# ─────────────────────────────────────────
@router.get("/admin/pending")
def admin_pending(request: Request):
    hospital = request.headers.get("hospital", "A")
    db = get_db()
    rows = db.execute("""
        SELECT record_id, patient_id, cid, file_hash, status, created_at, admin_email
        FROM pending_records
        WHERE hospital=?
        ORDER BY created_at DESC
    """, (hospital,)).fetchall()
    return [
        {
            "record_id": r[0],
            "patient_id": r[1],
            "cid": r[2],
            "file_hash": r[3],
            "status": r[4],
            "created_at": r[5],
            "admin_email": r[6] or "",
            "admin_id": ("ADM-" + (r[6] or "unknown").split("@")[0].upper()[:8]) if r[6] else "ADM-UNKNOWN",
            "hospital": hospital
        }
        for r in rows
    ]


# ─────────────────────────────────────────
# PATIENT — Profile + pending check
# ─────────────────────────────────────────
@router.get("/patient-profile")
def patient_profile(email: str):
    db = get_db()
    row = db.execute(
        "SELECT patient_id FROM users WHERE email=? AND role='patient'",
        (email,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Patient not found")

    patient_id = row[0]
    record = get_record_by_patient_fabric(patient_id)

    if record and not record.get("error"):
        return {
            "patient_id": patient_id,
            "record_id": record.get("recordId"),
            "cid": record.get("cid"),
            "consent": record.get("consent"),
            "on_chain": True,
            "pending": False
        }

    latest = db.execute("""
        SELECT record_id, cid, status
        FROM pending_records
        WHERE patient_id=?
        ORDER BY created_at DESC
        LIMIT 1
    """, (patient_id,)).fetchone()

    if latest:
        record_id, cid, status = latest

        if status == "stored":
            return {
                "patient_id": patient_id,
                "record_id": record_id,
                "cid": cid,
                "consent": True,
                "on_chain": True,
                "pending": False
            }

        if status in ["pending", "notified"]:
            full_row = db.execute("""
                SELECT record_id, cid, status, admin_email, hospital
                FROM pending_records
                WHERE patient_id=?
                ORDER BY created_at DESC
                LIMIT 1
            """, (patient_id,)).fetchone()

            admin_email = full_row[3] or "" if full_row else ""
            hospital = full_row[4] or "A" if full_row else "A"
            admin_name = admin_email.split("@")[0].replace(".", " ").title() if admin_email else "Hospital Admin"
            hospital_name = {
                "A": "Hospital Alpha", "B": "Hospital Beta",
                "C": "Hospital Gamma", "D": "Hospital Delta"
            }.get(hospital.upper(), f"Hospital {hospital}")

            return {
                "patient_id": patient_id,
                "record_id": record_id,
                "cid": cid,
                "consent": False,
                "on_chain": False,
                "pending": True,
                "admin_email": admin_email,
                "admin_name": admin_name,
                "hospital": hospital,
                "hospital_name": hospital_name
            }

    return {
        "patient_id": patient_id,
        "record_id": None,
        "cid": None,
        "consent": False,
        "on_chain": False,
        "pending": False
    }


# ─────────────────────────────────────────
# PATIENT — Approve EHR upload
# ─────────────────────────────────────────
@router.post("/patient/approve")
def approve(record_id: str = Form(...)):
    db = get_db()
    row = db.execute(
        "SELECT patient_id FROM pending_records WHERE record_id=?",
        (record_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Record not found")
    db.execute(
        "UPDATE pending_records SET status='approved' WHERE record_id=?",
        (record_id,)
    )
    db.commit()
    return {"message": "Approved. Admin can now store on blockchain."}


# ─────────────────────────────────────────
# PATIENT — Toggle consent
# ─────────────────────────────────────────
@router.post("/toggle-consent")
def toggle_consent(record_id: str = Form(...), active: bool = Form(...)):
    result = toggle_consent_fabric(record_id, active)
    if "error" in result:
        raise HTTPException(500, f"Blockchain error: {result['error']}")
    return {"message": "Consent updated", "consent": result.get("consent")}


# ─────────────────────────────────────────
# DOCTOR — Request access (saves as PENDING — patient must approve)
# ─────────────────────────────────────────
@router.post("/access-request")
async def access_request(request: Request):
    import json
    body = await request.body()
    try:
        data = json.loads(body)
    except Exception:
        raise HTTPException(400, f"Invalid JSON: {body}")

    hospital = request.headers.get("hospital", "A").strip().upper()
    patient_id = data.get("patientId")
    ttl = data.get("ttl", 3600)
    doctor_email = data.get("doctorEmail", "")

    if not patient_id:
        raise HTTPException(400, "Missing patientId")

    # Check record exists on blockchain
    record = get_record_by_patient_fabric(patient_id, hospital)
    if not record or record.get("error"):
        raise HTTPException(404, "No record found for patient on blockchain")

    if not record.get("consent"):
        raise HTTPException(400, "Patient consent is inactive")

    doctor_name = doctor_email.split("@")[0].replace(".", " ").title() if doctor_email else "Unknown Doctor"
    doctor_id = "DOC-" + doctor_email.split("@")[0].upper()[:8] if doctor_email else "DOC-UNKNOWN"
    request_id = uuid.uuid4().hex

    # Save as PENDING — patient must approve before token is issued
    db = get_db()
    try:
        db.execute("""
            INSERT INTO access_requests
            (request_id, patient_id, doctor_email, doctor_name, doctor_id,
             hospital, status, requested_at)
            VALUES (?,?,?,?,?,?,'pending',?)
        """, (request_id, patient_id, doctor_email, doctor_name, doctor_id,
              hospital, int(time.time())))
        db.commit()
    finally:
        db.close()

    return {
        "message": "Access request sent. Waiting for patient approval.",
        "request_id": request_id,
        "status": "pending",
        "doctor_name": doctor_name,
        "doctor_id": doctor_id
    }


# ─────────────────────────────────────────
# DOCTOR — Poll request status
# ─────────────────────────────────────────
@router.get("/doctor/request-status/{request_id}")
def doctor_request_status(request_id: str):
    db = get_db()
    try:
        row = db.execute("""
            SELECT status, token, expires_at, patient_id
            FROM access_requests WHERE request_id=?
        """, (request_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Request not found")
        return {
            "request_id": request_id,
            "status": row[0],
            "token": row[1],
            "expires_at": row[2],
            "patient_id": row[3]
        }
    finally:
        db.close()


# ─────────────────────────────────────────
# PATIENT — Get pending doctor access requests
# ─────────────────────────────────────────
@router.get("/patient/access-requests")
def patient_access_requests(patient_id: str):
    db = get_db()
    try:
        rows = db.execute("""
            SELECT request_id, doctor_email, doctor_name, doctor_id,
                   hospital, status, requested_at
            FROM access_requests
            WHERE patient_id=? AND status='pending'
            ORDER BY requested_at DESC
        """, (patient_id,)).fetchall()
        return [
            {
                "request_id": r[0],
                "doctor_email": r[1],
                "doctor_name": r[2],
                "doctor_id": r[3],
                "hospital": r[4],
                "status": r[5],
                "requested_at": r[6]
            }
            for r in rows
        ]
    finally:
        db.close()


# ─────────────────────────────────────────
# PATIENT — Approve doctor access request
# ─────────────────────────────────────────
@router.post("/patient/approve-access")
def approve_access(request_id: str = Form(...), patient_id: str = Form(...)):
    db = get_db()
    try:
        row = db.execute("""
            SELECT doctor_email, doctor_name, doctor_id, hospital, patient_id
            FROM access_requests WHERE request_id=? AND status='pending'
        """, (request_id,)).fetchone()

        if not row:
            raise HTTPException(404, "Request not found or already responded")

        doctor_email, doctor_name, doctor_id, hospital, req_patient_id = row

        if req_patient_id != patient_id:
            raise HTTPException(403, "Not your request")

        # Get record from blockchain
        record = get_record_by_patient_fabric(patient_id, hospital)
        if not record or record.get("error"):
            raise HTTPException(404, "Record not found on blockchain")

        record_id = record.get("recordId")

        # Generate token
        result = request_access_fabric(patient_id, record_id, 3600, hospital)
        token = result.get("token", uuid.uuid4().hex)
        expires_at = result.get("expiresAt", int(time.time()) + 3600)

        # Update request as approved with token
        db.execute("""
            UPDATE access_requests
            SET status='approved', token=?, expires_at=?, responded_at=?
            WHERE request_id=?
        """, (token, expires_at, int(time.time()), request_id))

        # Save to access_log
        db.execute("""
            INSERT INTO access_log
            (patient_id, record_id, doctor_email, doctor_name, doctor_id,
             hospital, token, expires_at, requested_at)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (patient_id, record_id, doctor_email, doctor_name, doctor_id,
              hospital, token, expires_at, int(time.time())))

        # Save token binding
        db.execute("""
            INSERT OR REPLACE INTO access_tokens
            (token, doctor_email, record_id, created_at, expires_at)
            VALUES (?,?,?,?,?)
        """, (token, doctor_email, record_id, int(time.time()), expires_at))

        db.commit()
        return {"message": "Access approved", "request_id": request_id}
    finally:
        db.close()


# ─────────────────────────────────────────
# PATIENT — Deny doctor access request
# ─────────────────────────────────────────
@router.post("/patient/deny-access")
def deny_access(request_id: str = Form(...), patient_id: str = Form(...)):
    db = get_db()
    try:
        row = db.execute("""
            SELECT patient_id FROM access_requests
            WHERE request_id=? AND status='pending'
        """, (request_id,)).fetchone()

        if not row:
            raise HTTPException(404, "Request not found")
        if row[0] != patient_id:
            raise HTTPException(403, "Not your request")

        db.execute("""
            UPDATE access_requests
            SET status='denied', responded_at=?
            WHERE request_id=?
        """, (int(time.time()), request_id))
        db.commit()
        return {"message": "Access denied"}
    finally:
        db.close()


# ─────────────────────────────────────────
# PATIENT — Access log (approved history)
# ─────────────────────────────────────────
@router.get("/patient/access-log")
def patient_access_log(patient_id: str):
    db = get_db()
    try:
        rows = db.execute("""
            SELECT doctor_email, doctor_name, doctor_id, hospital, expires_at, requested_at
            FROM access_log
            WHERE patient_id=?
            ORDER BY requested_at DESC
            LIMIT 20
        """, (patient_id,)).fetchall()
        return [
            {
                "doctor_email": r[0],
                "doctor_name": r[1],
                "doctor_id": r[2],
                "hospital": r[3],
                "expires_at": r[4],
                "requested_at": r[5],
                "active": r[4] > int(time.time()) if r[4] else False
            }
            for r in rows
        ]
    finally:
        db.close()


# ─────────────────────────────────────────
# DOCTOR — View EHR with token
# ─────────────────────────────────────────
@router.get("/view/{record_id}")
def view_ehr(record_id: str, token: str, doctor_email: str = ""):
    if doctor_email:
        db = get_db()
        try:
            row = db.execute("""
                SELECT doctor_email, expires_at FROM access_tokens
                WHERE token=? AND record_id=?
            """, (token, record_id)).fetchone()
            if not row:
                raise HTTPException(403, "Invalid token")
            if row[0] != doctor_email:
                raise HTTPException(403, "Token not issued to this doctor")
            if row[1] < int(time.time()):
                raise HTTPException(403, "Token expired")
        finally:
            db.close()

    record = get_record_fabric(record_id)
    if not record or record.get("error"):
        raise HTTPException(404, "Record not found")

    cid = record.get("cid")
    decrypted = download_from_ipfs_bytes(cid)
    return Response(
        content=decrypted,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=ehr.pdf"}
    )


# ─────────────────────────────────────────
# PATIENT — Download own EHR
# ─────────────────────────────────────────
@router.get("/download/{cid}")
def download(cid: str):
    try:
        decrypted = download_from_ipfs_bytes(cid)
        return Response(
            content=decrypted,
            media_type="application/pdf",
            headers={"Content-Disposition": "inline; filename=ehr.pdf"}
        )
    except Exception as e:
        raise HTTPException(500, f"Download failed: {str(e)}")


# ─────────────────────────────────────────
# ADMIN — Get all patients
# ─────────────────────────────────────────
@router.get("/patients")
def get_patients():
    db = get_db()
    rows = db.execute(
        "SELECT patient_id, email FROM users WHERE role='patient'"
    ).fetchall()
    return [{"patient_id": r[0], "email": r[1]} for r in rows]


# ─────────────────────────────────────────
# PATIENT — EHR Version History
# ─────────────────────────────────────────
@router.get("/patient/ehr-history")
def ehr_history(patient_id: str):
    db = get_db()
    try:
        rows = db.execute("""
            SELECT old_cid, new_cid, ch_hash, updated_by, updated_at, version
            FROM ehr_history WHERE patient_id=?
            ORDER BY version DESC
        """, (patient_id,)).fetchall()

        record = get_record_by_patient_fabric(patient_id)
        history = []

        if record and not record.get("error"):
            history.append({
                "version": "Current",
                "cid": record.get("cid"),
                "updated_by": record.get("updatedBy") or "Original Upload",
                "updated_at": None,
                "ch_hash": None
            })

        for r in rows:
            history.append({
                "version": f"v{r[5]}",
                "old_cid": r[0],
                "cid": r[1],
                "ch_hash": r[2],
                "updated_by": r[3],
                "updated_at": r[4]
            })

        return {"patient_id": patient_id, "history": history}
    finally:
        db.close()


# ─────────────────────────────────────────
# ADMIN — Auto Leader Election (AI Agent)
# ─────────────────────────────────────────
@router.post("/admin/elect-leader")
def elect_leader(request: Request):
    hospital = request.headers.get("hospital", "A")

    org_msp = {
        "A": "Org1MSP",
        "B": "Org2MSP",
        "C": "Org3MSP",
        "D": "Org4MSP"
    }.get(hospital.upper(), "Org1MSP")

    try:
        # 🔹 STEP 1: Call AI
        res = requests.post(
            "http://localhost:5050/elect",
            json={"requesting_org": org_msp},
            timeout=15
        )

        if res.status_code != 200:
            raise HTTPException(500, f"AI error: {res.text}")

        result = res.json()
        print("✅ AI RESULT:", result)

        elected = result.get("elected_leader")

        if not elected:
            raise HTTPException(500, "AI did not return leader")

        # 🔥 STEP 2: STORE IN FABRIC
        fabric_result = elect_leader_fabric(hospital, elected)

        print("📦 FABRIC RESULT:", fabric_result)

        if "error" in fabric_result:
            raise HTTPException(500, f"Fabric error: {fabric_result['error']}")

        # 🔹 STEP 3: RETURN FINAL RESPONSE
        return {
            "success": True,
            "leader": elected,
            "active": True,
            "elected_by": result.get("elected_by"),
            "message": result.get("message"),
            "pori_scores": result.get("pori_scores"),
            "is_leader": elected == org_msp,
            "your_org": org_msp
        }

    except Exception as e:
        print("❌ FINAL ERROR:", str(e))
        raise HTTPException(500, f"Election error: {str(e)}")

@router.get("/admin/current-leader")
def get_current_leader(request: Request):
    hospital = request.headers.get("hospital", "A")

    result = get_current_leader_fabric(hospital)

    print("📌 Leader from Fabric:", result)

    return {
        "leader": result.get("leader") or result.get("electedLeader"),
        "your_org": {
            "A": "Org1MSP",
            "B": "Org2MSP",
            "C": "Org3MSP",
            "D": "Org4MSP"
        }.get(hospital.upper(), "Org1MSP")
    }

# ─────────────────────────────────────────
# ADMIN — Update Record (leader only)
# ─────────────────────────────────────────
@router.post("/admin/update-record")
async def update_record(
    request: Request,
    patient_id: str = Form(...),
    file: UploadFile = None
):
    hospital = request.headers.get("hospital", "A").strip().upper()

    org_msp = {
        "A": "Org1MSP", "B": "Org2MSP",
        "C": "Org3MSP", "D": "Org4MSP"
    }.get(hospital, "Org1MSP")

    # Step 1: Get current leader from blockchain
    leader_result = get_current_leader_fabric(hospital)
    elected_leader = leader_result.get("leader") or leader_result.get("electedLeader")

    if not elected_leader:
        raise HTTPException(400, "No leader elected yet. Run election first.")

    # Step 2: Read file and upload to IPFS
    old_record = get_record_by_patient_fabric(patient_id)
    old_cid = old_record.get("cid") if old_record and not old_record.get("error") else None

    file_bytes = await file.read()
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    encrypted = encrypt_bytes(file_bytes)
    new_cid = upload_to_ipfs_bytes(encrypted)

    # Step 3: Compute chameleon hash using forge_r (same hash as original)
    ch_hash_value = file_hash  # default fallback
    try:
        from chameleon_hash.ch_secp256k1 import encode_message, ch_hash, forge_r
        # Load original r, pubkey, privkey from pending_records
        db_ch = get_db()
        orig = db_ch.execute("""
            SELECT ch_r, ch_pubkey, ch_privkey, ch_hash, cid
            FROM pending_records WHERE patient_id=? AND ch_r IS NOT NULL AND ch_r != ''
            ORDER BY created_at ASC LIMIT 1
        """, (patient_id,)).fetchone()
        db_ch.close()

        if orig and orig[0]:
            original_r = int(orig[0], 16)
            pub_bytes = bytes.fromhex(orig[1])
            priv_scalar = int(orig[2], 16)
            original_cid = orig[4]
            # Encode original and new messages
            orig_msg = encode_message(original_cid, True, patient_id.encode())
            new_msg = encode_message(new_cid, True, patient_id.encode())
            # Forge new r using trapdoor
            new_r = forge_r(original_r, priv_scalar, orig_msg, new_msg)
            # Compute hash with new r → same hash as original
            ch_hash_value, _ = ch_hash(new_msg, new_r, pub_bytes)
            print(f"✅ Chameleon hash preserved: {ch_hash_value[:16]}...")
        else:
            print("⚠️ No original ch params found, using fallback")
    except Exception as e:
        print(f"⚠️ Chameleon hash skipped: {e}")

    # ─── BRANCH: Am I the leader? ───────────────────────────────────────
    if org_msp != elected_leader:
        # NOT leader → save pending request, do NOT touch blockchain
        request_id = uuid.uuid4().hex
        db = get_db()
        try:
            db.execute("""
                INSERT INTO update_requests
                (request_id, patient_id, cid, ch_hash, requested_by, leader, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
            """, (request_id, patient_id, new_cid, ch_hash_value,
                  org_msp, elected_leader, int(time.time())))
            db.commit()
        finally:
            db.close()

        return {
            "message": f"Update request sent to leader ({elected_leader}). Awaiting approval.",
            "request_id": request_id,
            "status": "pending",
            "is_leader": False,
            "your_org": org_msp,
            "leader": elected_leader
        }

    # IS leader → update blockchain directly
    result = update_record_fabric(patient_id, new_cid, ch_hash_value, hospital)
    if "error" in result:
        raise HTTPException(500, f"Blockchain update error: {result['error']}")

    # Save history
    db = get_db()
    try:
        row = db.execute(
            "SELECT MAX(version) FROM ehr_history WHERE patient_id=?", (patient_id,)
        ).fetchone()
        next_version = (row[0] or 0) + 1
        db.execute("""
            INSERT INTO ehr_history
            (patient_id, record_id, old_cid, new_cid, ch_hash, updated_by, updated_at, version)
            VALUES (?,?,?,?,?,?,?,?)
        """, (patient_id, patient_id, old_cid, new_cid, ch_hash_value,
              org_msp, int(time.time()), next_version))
        db.commit()
    except Exception as e:
        print("History insert error:", e)
        next_version = 1
    finally:
        db.close()

    return {
        "message": "Record updated on blockchain successfully.",
        "cid": new_cid,
        "hash": ch_hash_value,
        "old_cid": old_cid,
        "version": next_version,
        "status": "updated",
        "is_leader": True,
        "your_org": org_msp,
        "leader": elected_leader
    } 
    
@router.get("/admin/pending-update-requests")
def get_pending_requests(request: Request):
    hospital = request.headers.get("hospital", "A")

    org_msp = {
        "A": "Org1MSP",
        "B": "Org2MSP",
        "C": "Org3MSP",
        "D": "Org4MSP"
    }.get(hospital.upper(), "Org1MSP")

    db = get_db()

    rows = db.execute("""
        SELECT request_id, patient_id, cid, requested_by, created_at
        FROM update_requests
        WHERE leader=? AND status='pending'
        ORDER BY created_at DESC
    """, (org_msp,)).fetchall()

    db.close()

    return [
        {
            "request_id": r[0],
            "patient_id": r[1],
            "cid": r[2],
            "requested_by": r[3],
            "created_at": r[4]
        }
        for r in rows
    ]
    
@router.post("/admin/approve-update")
def approve_update(request: Request, request_id: str = Form(...)):
    hospital = request.headers.get("hospital", "A").strip().upper()

    org_msp = {
        "A": "Org1MSP", "B": "Org2MSP",
        "C": "Org3MSP", "D": "Org4MSP"
    }.get(hospital, "Org1MSP")

    db = get_db()
    try:
        row = db.execute("""
            SELECT patient_id, cid, ch_hash, leader, requested_by
            FROM update_requests
            WHERE request_id=? AND status='pending'
        """, (request_id,)).fetchone()

        if not row:
            raise HTTPException(404, "Request not found or already processed")

        patient_id, new_cid, ch_hash, leader, requested_by = row

        if leader != org_msp:
            raise HTTPException(
                403,
                f"Only the elected leader ({leader}) can approve. You are {org_msp}."
            )

        # Get old CID for history
        old_record = get_record_by_patient_fabric(patient_id)
        old_cid = old_record.get("cid") if old_record and not old_record.get("error") else None

        # Call blockchain update
        result = update_record_fabric(patient_id, new_cid, ch_hash or "hash_placeholder", hospital)
        if "error" in result:
            raise HTTPException(500, f"Blockchain update failed: {result['error']}")

        # Mark request approved
        db.execute("""
            UPDATE update_requests SET status='approved' WHERE request_id=?
        """, (request_id,))

        # Save history
        version_row = db.execute(
            "SELECT MAX(version) FROM ehr_history WHERE patient_id=?", (patient_id,)
        ).fetchone()
        next_version = (version_row[0] or 0) + 1

        db.execute("""
            INSERT INTO ehr_history
            (patient_id, record_id, old_cid, new_cid, ch_hash, updated_by, updated_at, version)
            VALUES (?,?,?,?,?,?,?,?)
        """, (patient_id, patient_id, old_cid, new_cid, ch_hash,
              org_msp, int(time.time()), next_version))

        db.commit()

        return {
            "message": "Update approved and committed to blockchain",
            "request_id": request_id,
            "patient_id": patient_id,
            "new_cid": new_cid,
            "version": next_version
        }
    finally:
        db.close()


# ─────────────────────────────────────────
# ADMIN — Records with update history
# ─────────────────────────────────────────
@router.get("/admin/records-with-history")
def records_with_history(request: Request):
    hospital = request.headers.get("hospital", "A")
    db = get_db()
    rows = db.execute("""
        SELECT record_id, patient_id, cid, file_hash, status, created_at, admin_email
        FROM pending_records
        WHERE hospital=?
        ORDER BY created_at DESC
    """, (hospital,)).fetchall()

    result = []
    for r in rows:
        record_id, patient_id, cid, file_hash, status, created_at, admin_email = r
        admin_id = ("ADM-" + (admin_email or "unknown").split("@")[0].upper()[:8]) if admin_email else "ADM-UNKNOWN"

        # Get ch_hash from ehr_history for this patient (same for all versions)
        ch_row = db.execute(
            "SELECT ch_hash FROM ehr_history WHERE patient_id=? LIMIT 1", (patient_id,)
        ).fetchone()
        display_hash = ch_row[0] if ch_row and ch_row[0] else file_hash

        # Original row
        result.append({
            "record_id": record_id,
            "patient_id": patient_id,
            "cid": cid,
            "file_hash": display_hash,
            "status": status,
            "created_at": created_at,
            "admin_email": admin_email or "",
            "admin_id": admin_id,
            "hospital": hospital,
            "is_update": False,
            "version": "Original"
        })

        # Check ehr_history for updates
        history = db.execute("""
            SELECT old_cid, new_cid, ch_hash, updated_by, updated_at, version
            FROM ehr_history WHERE patient_id=?
            ORDER BY version ASC
        """, (patient_id,)).fetchall()

        for h in history:
            result.append({
                "record_id": record_id + f"_v{h[5]}",
                "patient_id": patient_id,
                "cid": h[1],
                "file_hash": h[2] or display_hash,
                "status": "updated",
                "created_at": h[4],
                "admin_email": admin_email or "",
                "admin_id": admin_id,
                "hospital": hospital,
                "is_update": True,
                "version": f"v{h[5]}",
                "updated_by": h[3],
                "old_cid": h[0]
            })

    db.close()
    return result

@router.get("/admin/update-request-status/{request_id}")
def get_update_request_status(request_id: str):
    db = get_db()
    row = db.execute("""
        SELECT status FROM update_requests WHERE request_id=?
    """, (request_id,)).fetchone()
    db.close()

    if not row:
        raise HTTPException(404, "Request not found")

    return {"status": row[0]}