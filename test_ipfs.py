# test_ipfs.py
import requests
import json

IPFS_API     = "http://127.0.0.1:5001/api/v0"
IPFS_GATEWAY = "http://127.0.0.1:8080/ipfs"

def test_version():
    r = requests.post(f"{IPFS_API}/version", timeout=10)
    r.raise_for_status()
    print("✅ IPFS version:", r.json()["Version"])

def test_upload():
    payload = json.dumps({
        "patient_id": "P001",
        "org": "Org1MSP",
        "record": "EHR test record"
    }).encode()

    r = requests.post(
        f"{IPFS_API}/add",
        files={"file": ("ehr.json", payload)},
        timeout=30
    )
    r.raise_for_status()
    cid = r.json()["Hash"]
    print("✅ Uploaded CID:", cid)
    return cid

def test_download(cid: str):
    r = requests.get(
        f"{IPFS_GATEWAY}/{cid}",
        allow_redirects=True,
        timeout=30
    )
    r.raise_for_status()
    data = r.json()
    print("✅ Downloaded:", data)
    return data

def test_pin(cid: str):
    r = requests.post(
        f"{IPFS_API}/pin/add",
        params={"arg": cid},
        timeout=30
    )
    r.raise_for_status()
    print("✅ Pinned:", r.json()["Pins"])

if __name__ == "__main__":
    print("\n--- IPFS Stack Test ---\n")
    test_version()
    cid = test_upload()
    test_download(cid)
    test_pin(cid)
    print("\n🎉 IPFS fully operational for EHR system\n")
