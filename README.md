# EHR Blockchain System — Setup Guide

## Prerequisites
- Windows 11 with WSL2 (Ubuntu 24.04)
- Docker Desktop
- Node.js v18 in WSL
- Python 3.12 in WSL

## Step 1 — Install Fabric Binaries
```bash
cd blockchain
./install-fabric.sh --fabric-version 2.5.9 binary docker
echo 'export PATH=$PATH:'$(pwd)'/blockchain/bin' >> ~/.bashrc
source ~/.bashrc
```

## Step 2 — Add hosts entries
```bash
echo "127.0.0.1 orderer.example.com" | sudo tee -a /etc/hosts
echo "127.0.0.1 peer0.org1.example.com" | sudo tee -a /etc/hosts
echo "127.0.0.1 peer0.org2.example.com" | sudo tee -a /etc/hosts
echo "127.0.0.1 peer0.org3.example.com" | sudo tee -a /etc/hosts
echo "127.0.0.1 peer0.org4.example.com" | sudo tee -a /etc/hosts
```

## Step 3 — Install IPFS
```bash
cd ~
wget https://dist.ipfs.tech/kubo/v0.27.0/kubo_v0.27.0_linux-amd64.tar.gz
tar -xzf kubo_v0.27.0_linux-amd64.tar.gz
sudo bash kubo/install.sh
ipfs init
```

## Step 4 — Setup Gateway & API
```bash
mkdir -p ~/fabric-gateway ~/fabric-api
# Copy fabric-client.js to ~/fabric-gateway/
# Copy server.js to ~/fabric-api/
cd ~/fabric-gateway && npm init -y && npm install @hyperledger/fabric-gateway @grpc/grpc-js
cd ~/fabric-api && npm init -y && npm install express cors
```

## Step 5 — Install Python dependencies
```bash
cd backend/src
pip install -r ../requirements.txt --break-system-packages
pip install uvicorn fastapi flask --break-system-packages
cd 'AI Agent'/ai-agent
pip install flask requests torch numpy --break-system-packages
```

## Step 6 — Install Frontend dependencies
```bash
cd frontend
npm install
```

## Step 7 — Update BASE_PATH
Edit ~/fabric-gateway/fabric-client.js:
Change BASE_PATH to match your project path

## Every time you start:
Terminal 1: ~/start-blockchain.sh
Terminal 2: cd ~/fabric-api && node server.js
Terminal 3: cd backend/src/'AI Agent'/ai-agent && python agent_api.py
Terminal 4: cd backend/src && uvicorn main:app --reload --port 8000
Terminal 5: ipfs daemon &
Terminal 6: cd frontend && npm start
