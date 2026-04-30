#!/bin/bash
echo "🚀 Starting EHR Blockchain Network..."

# Start Docker containers
cd /mnt/c/pw/Project-Work-1/blockchain
docker compose up -d
sleep 5

# Set environment
export FABRIC_CFG_PATH=/mnt/c/pw/Project-Work-1/blockchain/config
export PATH=$PATH:/mnt/c/pw/Project-Work-1/blockchain/bin
export CORE_PEER_TLS_ENABLED=true

# Rejoin orderer
echo "Joining orderer..."
osnadmin channel join \
  --channelID ehrchannel \
  --config-block /mnt/c/pw/Project-Work-1/blockchain/channel-artifacts/ehrchannel.block \
  -o orderer.example.com:7053 \
  --ca-file /mnt/c/pw/Project-Work-1/blockchain/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt \
  --client-cert /mnt/c/pw/Project-Work-1/blockchain/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt \
  --client-key /mnt/c/pw/Project-Work-1/blockchain/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.key 2>/dev/null
echo "Orderer joined ✓"

# Rejoin peers
echo "Joining peers..."
for ORG in 1 2 3 4; do
  case $ORG in
    1) PORT=7051 ;;
    2) PORT=9051 ;;
    3) PORT=11051 ;;
    4) PORT=13051 ;;
  esac

  export CORE_PEER_LOCALMSPID=Org${ORG}MSP
  export CORE_PEER_ADDRESS=peer0.org${ORG}.example.com:${PORT}
  export CORE_PEER_TLS_ROOTCERT_FILE=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org${ORG}.example.com/peers/peer0.org${ORG}.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org${ORG}.example.com/users/Admin@org${ORG}.example.com/msp
  peer channel join -b /mnt/c/pw/Project-Work-1/blockchain/channel-artifacts/ehrchannel.block 2>/dev/null
  echo "Org${ORG} joined ✓"
done

# Install chaincode
echo "Installing chaincode..."
export PKG_ID=ehr-contract_1.0:e54ee96cfb5ae2bae5bc4e55d1df7d48dff5e5a24e11bd7ad76e83936cc0bde5

for ORG in 1 2 3 4; do
  case $ORG in
    1) PORT=7051 ;;
    2) PORT=9051 ;;
    3) PORT=11051 ;;
    4) PORT=13051 ;;
  esac
  export CORE_PEER_LOCALMSPID=Org${ORG}MSP
  export CORE_PEER_ADDRESS=peer0.org${ORG}.example.com:${PORT}
  export CORE_PEER_TLS_ROOTCERT_FILE=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org${ORG}.example.com/peers/peer0.org${ORG}.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org${ORG}.example.com/users/Admin@org${ORG}.example.com/msp
  peer lifecycle chaincode install /mnt/c/pw/Project-Work-1/blockchain/channel-artifacts/ehr-contract.tar.gz 2>/dev/null
  echo "Chaincode installed on Org${ORG} ✓"
done

# Approve chaincode
echo "Approving chaincode..."
for ORG in 1 2 3 4; do
  case $ORG in
    1) PORT=7051 ;;
    2) PORT=9051 ;;
    3) PORT=11051 ;;
    4) PORT=13051 ;;
  esac
  export CORE_PEER_LOCALMSPID=Org${ORG}MSP
  export CORE_PEER_ADDRESS=peer0.org${ORG}.example.com:${PORT}
  export CORE_PEER_TLS_ROOTCERT_FILE=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org${ORG}.example.com/peers/peer0.org${ORG}.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org${ORG}.example.com/users/Admin@org${ORG}.example.com/msp
  peer lifecycle chaincode approveformyorg \
    -o orderer.example.com:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --tls --cafile /mnt/c/pw/Project-Work-1/blockchain/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt \
    --channelID ehrchannel --name ehr-contract --version 1.0 \
    --package-id $PKG_ID --sequence 1 \
    --signature-policy "OR('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer','Org4MSP.peer')" 2>/dev/null
  echo "Org${ORG} approved ✓"
done

# Commit chaincode
echo "Committing chaincode..."
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_ADDRESS=peer0.org1.example.com:7051
export CORE_PEER_TLS_ROOTCERT_FILE=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp

peer lifecycle chaincode commit \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile /mnt/c/pw/Project-Work-1/blockchain/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt \
  --channelID ehrchannel --name ehr-contract --version 1.0 --sequence 1 \
  --signature-policy "OR('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer','Org4MSP.peer')" \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses peer0.org2.example.com:9051 \
  --tlsRootCertFiles /mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  --peerAddresses peer0.org3.example.com:11051 \
  --tlsRootCertFiles /mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt \
  --peerAddresses peer0.org4.example.com:13051 \
  --tlsRootCertFiles /mnt/c/pw/Project-Work-1/blockchain/organizations/peerOrganizations/org4.example.com/peers/peer0.org4.example.com/tls/ca.crt 2>/dev/null
echo "Chaincode committed ✓"

# Start AI Agent
echo "Starting AI Agent..."
cd "/mnt/c/pw/Project-Work-1/backend/src/AI Agent"
docker compose up -d 2>/dev/null
echo "AI Agent started ✓"

echo ""
echo "✅ Blockchain network ready!"
echo "Now run: cd ~/fabric-api && node server.js"
