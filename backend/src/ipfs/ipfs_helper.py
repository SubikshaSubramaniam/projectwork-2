# backend/src/ipfs/ipfs_helper.py
import requests
from .aes_gcm import encrypt_bytes, decrypt_bytes   # updated AES helpers (see below)


def upload_to_ipfs_bytes(raw_bytes: bytes, ipfs_api="http://127.0.0.1:5001/api/v0/add") -> str:
    files = {
        "file": ("file.bin", raw_bytes)
    }

    resp = requests.post(ipfs_api, files=files, timeout=60)

    if resp.status_code == 200:
        return resp.json()["Hash"]
    else:
        raise Exception(f"IPFS upload failed: {resp.status_code} {resp.text}")

def download_from_ipfs_bytes(cid: str, ipfs_gateway="http://127.0.0.1:8080/ipfs/") -> bytes:
    """
    Download encrypted bytes from IPFS, decrypt in-memory, return decrypted bytes.
    """
    url = f"{ipfs_gateway}{cid}"
    resp = requests.get(url, allow_redirects=True, timeout=60)  # ← added allow_redirects

    if resp.status_code == 200:
        encrypted_bytes = resp.content
        print("RAW:", encrypted_bytes[:100])
        decrypted_bytes = decrypt_bytes(encrypted_bytes)
        print(decrypted_bytes[:100])
        return decrypted_bytes
    else:
        raise Exception(f"IPFS download failed: {resp.status_code} {resp.text}")