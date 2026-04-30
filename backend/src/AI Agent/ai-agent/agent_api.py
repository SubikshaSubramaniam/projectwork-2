import os
import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

FABRIC_API = os.getenv("FABRIC_API_URL", "http://localhost:4000")
PROMETHEUS = os.getenv("PROMETHEUS_URL", "http://localhost:9090")

HOSPITAL_MSP = {
    "hospitala": "Org1MSP",
    "hospitalb": "Org2MSP",
    "hospitalc": "Org3MSP",
    "hospitald": "Org4MSP"
}

def prom_query(metric):
    try:
        r = requests.get(
            f"{PROMETHEUS}/api/v1/query",
            params={"query": metric},
            timeout=5
        )
        out = {}
        for item in r.json()["data"]["result"]:
            h = item["metric"].get("hospital", "")
            if h:
                out[h] = float(item["value"][1])
        return out
    except:
        return {}

def get_real_metrics():
    cpu  = prom_query("hospital_cpu_percent")
    mem  = prom_query("hospital_memory_percent")
    lat  = prom_query("hospital_avg_latency_ms")
    tput = prom_query("hospital_throughput_rps")
    succ = prom_query("hospital_success_rate")
    err  = prom_query("hospital_error_rate")

    metrics = {}
    for h in ["hospitala", "hospitalb", "hospitalc", "hospitald"]:
        metrics[h] = {
            "cpu":          cpu.get(h, 50.0),
            "memory":       mem.get(h, 50.0),
            "latency":      lat.get(h, 100.0),
            "throughput":   tput.get(h, 1.0),
            "success_rate": succ.get(h, 0.9),
            "error_rate":   err.get(h, 0.1)
        }
    return metrics

def get_simulated_metrics():
    import random
    metrics = {}
    for h in ["hospitala", "hospitalb", "hospitalc", "hospitald"]:
        metrics[h] = {
            "cpu": random.uniform(10, 80),
            "memory": random.uniform(20, 70),
            "latency": random.uniform(10, 200),
            "throughput": random.uniform(0.5, 8),
            "success_rate": random.uniform(0.85, 1.0),
            "error_rate": random.uniform(0, 0.15)
        }
    return metrics

def pori_score(m):
    sr   = m["success_rate"]
    tput = min(m["throughput"] / 10.0, 1.0)
    lat  = min(m["latency"]    / 500.0, 1.0)
    cpu  = min(m["cpu"]        / 100.0, 1.0)
    err  = m["error_rate"]
    score = (0.30 * sr) + (0.25 * tput) - (0.20 * lat) - (0.15 * cpu) - (0.10 * err)
    return round(max(min(score, 1.0), 0.0), 4)

@app.route("/elect", methods=["POST"])
def trigger_election():
    data = request.get_json()
    requesting_org = data.get("requesting_org", "Org1MSP")

    # Try real Prometheus metrics first, fallback to simulated
    metrics = get_real_metrics()
    using_real = any(metrics[h]["cpu"] != 50.0 for h in metrics)
    if not using_real:
        print("⚠️  Prometheus not available — using simulated metrics")
        metrics = get_simulated_metrics()

    scores = {h: pori_score(metrics[h]) for h in metrics}
    best_hospital = max(scores, key=scores.get)
    elected_org = HOSPITAL_MSP.get(best_hospital, "Org1MSP")

    print(f"\n🤖 AI Election ({'Real' if using_real else 'Simulated'} metrics):")
    print(f"   Requesting: {requesting_org}")
    for h, s in sorted(scores.items(), key=lambda x: -x[1]):
        print(f"   {h}: PoRI={s:.4f} cpu={metrics[h]['cpu']:.1f}% lat={metrics[h]['latency']:.1f}ms")
    print(f"   ✅ Elected: {best_hospital} → {elected_org}")

    try:
        res = requests.post(
            f"{FABRIC_API}/api/leader/elect",
            json={
    "orgMSP": requesting_org,
    "leader": elected_org   # 🔥 THIS IS THE FIX
},
            timeout=10
        )
        return jsonify({
            "success": True,
            "elected_leader": elected_org,
            "elected_by": requesting_org,
            "pori_scores": scores,
            "metrics": metrics,
            "best_hospital": best_hospital,
            "using_real_metrics": using_real,
            "message": f"AI elected {elected_org} (PoRI={scores[best_hospital]:.4f})"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/leader", methods=["GET"])
def get_leader():
    try:
        res = requests.get(
            f"{FABRIC_API}/api/leader",
            params={"orgMSP": "Org1MSP"},
            timeout=10
        )
        data = res.json()
        return jsonify({
            "leader": data.get("leader"),
            "active": data.get("active"),
            "elected_at": data.get("electedAt"),
            "elected_by": data.get("electedBy"),
            "elected_by_ai": data.get("electedByAI", False)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/metrics", methods=["GET"])
def show_metrics():
    real = get_real_metrics()
    scores = {h: pori_score(real[h]) for h in real}
    return jsonify({"metrics": real, "pori_scores": scores})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "AI Agent API running", "port": 5050})

if __name__ == "__main__":
    print("🤖 AI Agent API running on http://localhost:5050")
    app.run(host="0.0.0.0", port=5050)
