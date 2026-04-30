"""
DQN Leader Election Agent — Phase 1
=====================================
Reads real metrics from 4 hospital nodes via Prometheus:
  - CPU usage
  - Memory usage
  - Average latency (ms)
  - Throughput (requests/sec)
  - Success rate
  - Error rate

Uses a Deep Q-Network (DQN) to learn which hospital makes
the best leader. Prints a full explanation every election round.
"""

import os, time, random, logging
import numpy as np
from collections import deque
import requests
import torch
import torch.nn as nn
import torch.optim as optim


# ── Fabric API Integration ──────────────────────────────────────
FABRIC_API = os.getenv("FABRIC_API_URL", "http://localhost:4000")

# Hospital name to MSP mapping
HOSPITAL_MSP = {
    "hospitala": "Org1MSP",
    "hospitalb": "Org2MSP",
    "hospitalc": "Org3MSP",
    "hospitald": "Org4MSP"
}

def notify_fabric_election(elected_hospital: str):
    """
    After DQN elects a leader, store it on Fabric blockchain.
    """
    org_msp = HOSPITAL_MSP.get(elected_hospital.lower(), "Org1MSP")
    try:
        res = requests.post(
            f"{FABRIC_API}/api/leader/elect",
            json={"orgMSP": org_msp},
            timeout=10
        )
        data = res.json()
        print(f"\n  🔗  FABRIC: Leader {data.get('electedLeader')} stored on blockchain")
        print(f"      Elected by: {data.get('electedBy')}")
        return data
    except Exception as e:
        print(f"\n  ⚠️  FABRIC: Could not store election on blockchain: {e}")
        return None

def get_fabric_leader():
    """
    Check current leader stored on blockchain.
    """
    try:
        res = requests.get(
            f"{FABRIC_API}/api/leader",
            params={"orgMSP": "Org1MSP"},
            timeout=10
        )
        return res.json()
    except Exception as e:
        return {"error": str(e)}

# ── Settings ───────────────────────────────────────────────────
PROMETHEUS = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
INTERVAL   = int(os.getenv("ELECTION_INTERVAL", "30"))
HOSPITALS  = ["hospitala", "hospitalb", "hospitalc", "hospitald"]

# State = 6 metrics × 4 hospitals = 24 inputs
METRICS    = ["cpu", "memory", "latency", "throughput", "success_rate", "error_rate"]
STATE_SIZE  = len(HOSPITALS) * len(METRICS)
ACTION_SIZE = len(HOSPITALS)

# DQN hyperparameters
LR            = 0.001
GAMMA         = 0.95
EPSILON       = 1.0        # starts fully random, decays over time
EPSILON_MIN   = 0.05
EPSILON_DECAY = 0.97
BATCH_SIZE    = 32
MEM_SIZE      = 500
SYNC_EVERY    = 5

logging.basicConfig(level=logging.WARNING)   # suppress noisy logs


# ── Neural network ─────────────────────────────────────────────
class DQN(nn.Module):
    """
    24 inputs  →  64 hidden  →  64 hidden  →  4 outputs
    Output = Q-value per hospital (higher = better leader choice)
    """
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(STATE_SIZE, 64), nn.ReLU(),
            nn.Linear(64, 64),         nn.ReLU(),
            nn.Linear(64, ACTION_SIZE),
        )
    def forward(self, x):
        return self.net(x)


# ── Replay memory ──────────────────────────────────────────────
class Memory:
    def __init__(self):
        self.buf = deque(maxlen=MEM_SIZE)
    def push(self, s, a, r, s2):
        self.buf.append((s, a, r, s2))
    def sample(self):
        batch = random.sample(self.buf, BATCH_SIZE)
        s, a, r, s2 = zip(*batch)
        return (torch.FloatTensor(np.array(s)),
                torch.LongTensor(a).unsqueeze(1),
                torch.FloatTensor(r),
                torch.FloatTensor(np.array(s2)))
    def ready(self):
        return len(self.buf) >= BATCH_SIZE


# ── Prometheus query ───────────────────────────────────────────
def prom(metric_name: str) -> dict:
    """
    Query Prometheus. Returns {hospitalA: value, hospitalB: value, ...}
    Returns empty dict if Prometheus isn't ready yet.
    """
    try:
        r = requests.get(
            f"{PROMETHEUS}/api/v1/query",
            params={"query": metric_name},
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


def fetch_all_metrics() -> dict | None:
    """
    Fetch all 6 metrics for all 4 hospitals from Prometheus.
    Returns None if Prometheus has no data yet.
    """
    cpu     = prom("hospital_cpu_percent")
    mem     = prom("hospital_memory_percent")
    lat     = prom("hospital_avg_latency_ms")
    tput    = prom("hospital_throughput_rps")
    succ    = prom("hospital_success_rate")
    err     = prom("hospital_error_rate")

    if not cpu:
        return None

    data = {}
    for h in HOSPITALS:
        data[h] = {
            "cpu":          cpu.get(h,  0.0),
            "memory":       mem.get(h,  0.0),
            "latency":      lat.get(h,  0.0),
            "throughput":   tput.get(h, 0.0),
            "success_rate": succ.get(h, 1.0),
            "error_rate":   err.get(h,  0.0),
        }
    return data


def build_state(data: dict) -> np.ndarray:
    """
    Flatten all metrics into a normalised [0,1] state vector.
    Bad metrics push values toward 1.0 (penalty zone).
    """
    vec = []
    for h in HOSPITALS:
        m = data[h]
        vec.append(min(m["cpu"]         / 100.0, 1.0))
        vec.append(min(m["memory"]      / 100.0, 1.0))
        vec.append(min(m["latency"]     / 500.0, 1.0))   # cap at 500ms
        vec.append(min(m["throughput"]  / 10.0,  1.0))   # cap at 10 rps
        vec.append(m["success_rate"])
        vec.append(m["error_rate"])
    return np.array(vec, dtype=np.float32)


def pori_score(m: dict) -> float:
    """
    PoRI score = how good this hospital is as a leader.
    Range 0.0 (worst) to 1.0 (best).

    Formula:
      score = (success_weight × success_rate)
            + (throughput_weight × norm_throughput)
            - (latency_weight × norm_latency)
            - (cpu_weight × norm_cpu)
            - (error_weight × error_rate)

    Weights chosen to reflect EHR system priorities:
      Success rate  30%  — reliability is most important
      Throughput    25%  — higher capacity = better leader
      Latency       20%  — faster = better ZKP generation
      CPU           15%  — less busy = more headroom
      Error rate    10%  — penalise unreliable nodes
    """
    sr   = m["success_rate"]
    tput = min(m["throughput"] / 10.0, 1.0)
    lat  = min(m["latency"]    / 500.0, 1.0)
    cpu  = min(m["cpu"]        / 100.0, 1.0)
    err  = m["error_rate"]

    score = (0.30 * sr) + (0.25 * tput) - (0.20 * lat) - (0.15 * cpu) - (0.10 * err)
    return round(max(min(score, 1.0), 0.0), 4)


# ── DQN Agent ──────────────────────────────────────────────────
class Agent:
    def __init__(self):
        self.policy  = DQN()
        self.target  = DQN()
        self.target.load_state_dict(self.policy.state_dict())
        self.target.eval()
        self.opt     = optim.Adam(self.policy.parameters(), lr=LR)
        self.mem     = Memory()
        self.eps     = EPSILON
        self.rounds  = 0
        self.prev_s  = None
        self.prev_a  = None

    def act(self, state: np.ndarray) -> int:
        if random.random() < self.eps:
            return random.randrange(ACTION_SIZE)
        with torch.no_grad():
            return int(self.policy(torch.FloatTensor(state).unsqueeze(0)).argmax())

    def q_values(self, state: np.ndarray) -> list:
        with torch.no_grad():
            return self.policy(torch.FloatTensor(state).unsqueeze(0)).squeeze().tolist()

    def train(self):
        if not self.mem.ready():
            return None
        S, A, R, S2 = self.mem.sample()
        curr = self.policy(S).gather(1, A).squeeze()
        with torch.no_grad():
            tgt = R + GAMMA * self.target(S2).max(1)[0]
        loss = nn.MSELoss()(curr, tgt)
        self.opt.zero_grad(); loss.backward(); self.opt.step()
        self.eps = max(EPSILON_MIN, self.eps * EPSILON_DECAY)
        return loss.item()


# ── Display helpers ─────────────────────────────────────────────
W = 62

def line(char="─"): print("  " + char * (W - 2))

def header(r):
    print("\n" + "═" * W)
    print(f"  ELECTION ROUND {r}".ljust(W - 1) + "═")
    print("═" * W)

def table(data: dict, scores: dict, elected: int):
    print(f"\n  {'Hospital':<12} {'CPU%':>5} {'Mem%':>5} {'Lat ms':>7} {'Tput/s':>7} {'Success%':>9} {'ErrRate':>8}  {'PoRI':>6}")
    line()
    for i, h in enumerate(HOSPITALS):
        m  = data[h]
        s  = scores[h]
        tag = " ◀ elected" if i == elected else ""
        print(
            f"  {h:<12}"
            f" {m['cpu']:>4.1f}%"
            f" {m['memory']:>4.1f}%"
            f" {m['latency']:>6.1f}"
            f" {m['throughput']:>6.2f}"
            f" {m['success_rate']*100:>8.1f}%"
            f" {m['error_rate']:>7.3f}"
            f"  {s:>6.4f}"
            f"{tag}"
        )

def qbar(q_vals: list, elected: int):
    print(f"\n  Q-VALUES  (DQN confidence — higher = DQN prefers this node)")
    line()
    mn, mx = min(q_vals), max(q_vals)
    rng = max(mx - mn, 0.001)
    for i, (h, q) in enumerate(zip(HOSPITALS, q_vals)):
        norm  = (q - mn) / rng
        bar   = "█" * int(norm * 24) + "░" * (24 - int(norm * 24))
        arrow = "  ◀ ELECTED" if i == elected else ""
        print(f"  {h:<12}  {q:>7.4f}  {bar}{arrow}")

def why(data: dict, scores: dict, elected: int):
    h = HOSPITALS[elected]
    m = data[h]
    s = scores[h]
    ranked = sorted(scores.items(), key=lambda x: -x[1])

    print(f"\n  ✅  ELECTED LEADER: {h.upper()}")
    print(f"\n  WHY {h} was chosen over the others:")
    line()

    # Show each metric with a plain-English verdict
    def verdict_lat(v):
        if v < 50:   return "excellent — very fast proof generation"
        if v < 100:  return "good"
        if v < 200:  return "acceptable"
        return           "slow — may delay ZKP verification"

    def verdict_tput(v):
        if v > 3:    return "high — handles many requests"
        if v > 1:    return "moderate"
        return           "low — limited capacity"

    def verdict_succ(v):
        if v > 0.97: return "very reliable"
        if v > 0.90: return "reliable"
        return           "unreliable — risky for leader role"

    def verdict_cpu(v):
        if v < 30:   return "low — plenty of headroom"
        if v < 60:   return "moderate"
        return           "high — node is busy"

    print(f"  Metric          Value        Verdict")
    print(f"  {'─'*55}")
    print(f"  Latency         {m['latency']:>6.1f} ms    {verdict_lat(m['latency'])}")
    print(f"  Throughput      {m['throughput']:>6.2f} rps   {verdict_tput(m['throughput'])}")
    print(f"  Success rate    {m['success_rate']*100:>6.1f}%     {verdict_succ(m['success_rate'])}")
    print(f"  CPU usage       {m['cpu']:>6.1f}%     {verdict_cpu(m['cpu'])}")
    print(f"  Error rate      {m['error_rate']:>6.3f}       {'low ✓' if m['error_rate'] < 0.05 else 'high ✗'}")
    print(f"  PoRI Score      {s:>6.4f}       highest in network")

    if len(ranked) > 1:
        runner = ranked[1]
        gap    = s - runner[1]
        print(f"\n  Runner-up: {runner[0]}  (PoRI {runner[1]:.4f},  gap = +{gap:.4f})")

    # Show what would have happened with other choices
    print(f"\n  All PoRI scores ranked:")
    for rank, (hosp, sc) in enumerate(ranked, 1):
        bar = "█" * int(sc * 20)
        print(f"    {rank}. {hosp:<12} {sc:.4f}  {bar}")

def training_info(loss, eps, rounds):
    print(f"\n  🧠  DQN STATUS")
    line()
    if loss is not None:
        confidence = "low — still exploring" if eps > 0.5 else ("medium" if eps > 0.2 else "high — model is confident")
        print(f"  Loss:         {loss:.6f}   {'↓ learning well' if loss < 0.05 else ''}")
        print(f"  Epsilon:      {eps:.4f}   ({confidence})")
        print(f"  Rounds:       {rounds}")
        print(f"  Memory:       {rounds} experiences stored")
    else:
        remaining = BATCH_SIZE - rounds
        print(f"  Collecting experience... ({rounds}/{BATCH_SIZE} needed to start training)")
        print(f"  Still need {remaining} more rounds before DQN trains.")
    print(f"\n  ⏱   Next election in {INTERVAL}s")
    print("═" * W + "\n")


# ── Main ───────────────────────────────────────────────────────
def main():
    agent = Agent()
    round_num = 0

    print("=" * W)
    print("  EHR Network — DQN Leader Election Agent  (Phase 1)")
    print("=" * W)
    print(f"  Prometheus : {PROMETHEUS}")
    print(f"  Hospitals  : {', '.join(HOSPITALS)}")
    print(f"  Metrics    : {', '.join(METRICS)}")
    print(f"  Interval   : {INTERVAL}s")
    print(f"\n  Waiting for Prometheus to scrape first metrics...")

    # Wait until Prometheus actually has data
    while True:
        d = fetch_all_metrics()
        if d:
            break
        print("  Still waiting for metrics... (this takes ~20s on first run)")
        time.sleep(8)

    print("  ✅  Metrics available. Starting elections.\n")

    while True:
        data = fetch_all_metrics()
        if not data:
            print("  Prometheus not responding — retrying in 10s...")
            time.sleep(10)
            continue

        round_num += 1
        scores = {h: pori_score(data[h]) for h in HOSPITALS}
        state  = build_state(data)
        action = agent.act(state)
        q_vals = agent.q_values(state)
        reward = scores[HOSPITALS[action]] * 10.0

        if agent.prev_s is not None:
            agent.mem.push(agent.prev_s, agent.prev_a, reward, state)

        loss = agent.train()
        agent.rounds += 1
        if agent.rounds % SYNC_EVERY == 0:
            agent.target.load_state_dict(agent.policy.state_dict())

        # Print full report
        header(round_num)
        table(data, scores, action)
        qbar(q_vals, action)
        why(data, scores, action)
        training_info(loss, agent.eps, agent.rounds)

        agent.prev_s = state
        agent.prev_a = action

        # Store election result on Fabric blockchain
        elected_hospital = HOSPITALS[action]
        notify_fabric_election(elected_hospital)

        # Show current blockchain leader
        fabric_leader = get_fabric_leader()
        if fabric_leader.get("active"):
            print(f"\n  📦  BLOCKCHAIN LEADER: {fabric_leader.get('leader')}")
            print(f"      Elected at: {fabric_leader.get('electedAt')}")

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
