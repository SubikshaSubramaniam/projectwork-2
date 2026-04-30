import requests

FABRIC_API_URL = "http://localhost:4000"

# Org mapping — hospital letter to MSP
ORG_MAP = {
    "A": "Org1MSP",
    "B": "Org2MSP",
    "C": "Org3MSP",
    "D": "Org4MSP"
}

def get_org_msp(hospital: str) -> str:
    return ORG_MAP.get(hospital.strip().upper(), "Org1MSP")

# ===============================
# STORE RECORD
# ===============================
def store_record_fabric(record_id: str, patient_id: str, cid: str, hospital: str = "A"):
    try:
        org_msp = get_org_msp(hospital)
        res = requests.post(
            f"{FABRIC_API_URL}/api/record/store",
            json={
                "orgMSP": org_msp,
                "patientId": patient_id,
                "cid": cid,
                "hash": record_id
            },
            timeout=30
        )
        return res.json()
    except Exception as e:
        return {"error": str(e)}

# ===============================
# GET RECORD BY PATIENT
# ===============================
def get_record_by_patient_fabric(patient_id: str, hospital: str = "A"):
    try:
        for org_msp in ["Org1MSP", "Org2MSP", "Org3MSP", "Org4MSP"]:
            res = requests.get(
                f"{FABRIC_API_URL}/api/record/{patient_id}",
                params={"orgMSP": org_msp},
                timeout=30
            )
            data = res.json()
            if "error" not in data:
                return {
                    "recordId": data.get("patientId"),
                    "cid": data.get("cid"),
                    "consent": True,
                    "patientId": data.get("patientId")
                }
        return None
    except Exception:
        return None

# ===============================
# GET RECORD
# ===============================
def get_record_fabric(record_id: str, hospital: str = "A"):
    try:
        org_msp = get_org_msp(hospital)
        res = requests.get(
            f"{FABRIC_API_URL}/api/record/{record_id}",
            params={"orgMSP": org_msp},
            timeout=30
        )
        data = res.json()
        if "error" in data:
            return None
        return {
            "recordId": data.get("patientId"),
            "cid": data.get("cid"),
            "consent": True,
            "patientId": data.get("patientId")
        }
    except Exception as e:
        return {"error": str(e)}

# ===============================
# CONSENT (LOCAL)
# ===============================
def toggle_consent_fabric(record_id: str, active: bool):
    return {"consent": active}

# ===============================
# REQUEST ACCESS
# ===============================
def request_access_fabric(patient_id: str, record_id: str, ttl: int = 600, hospital: str = "A"):
    import uuid, time
    token = uuid.uuid4().hex
    expires = int(time.time()) + ttl
    return {"token": token, "expiresAt": expires}

# ===============================
# CHECK TOKEN
# ===============================
def check_token_fabric(token: str):
    return True

# ===============================
# ELECT LEADER
# ===============================
def elect_leader_fabric(hospital: str, leader: str):
    try:
        # 🔥 Use elected leader MSP for submission
        org_msp = get_org_msp(hospital)   # ✅ requesting org

        print(f"➡️ Submitting election as {org_msp} for leader {leader}")

        res = requests.post(
            f"{FABRIC_API_URL}/api/leader/elect",
            json={
                "orgMSP": org_msp,
                "leader": leader
            },
            timeout=30
        )

        data = res.json()
        print("📦 Fabric Response:", data)

        return data

    except Exception as e:
        return {"error": str(e)}

# ===============================
# GET CURRENT LEADER (🔥 FIXED)
# ===============================
def get_current_leader_fabric(hospital: str = "A"):
    try:
        # 🔥 IMPORTANT FIX:
        # Always read from single org to avoid inconsistent state
        org_msp = "Org1MSP"

        res = requests.get(
            f"{FABRIC_API_URL}/api/leader",
            params={"orgMSP": org_msp},
            timeout=30
        )

        return res.json()

    except Exception as e:
        return {"error": str(e)}

# ===============================
# UPDATE RECORD
# ===============================
def update_record_fabric(patient_id: str, new_cid: str, new_hash: str, hospital: str = "A"):
    try:
        org_msp = get_org_msp(hospital)
        res = requests.put(
            f"{FABRIC_API_URL}/api/record/update",
            json={
                "orgMSP": org_msp,
                "patientId": patient_id,
                "newCid": new_cid,
                "newHash": new_hash
            },
            timeout=30
        )
        return res.json()
    except Exception as e:
        return {"error": str(e)}