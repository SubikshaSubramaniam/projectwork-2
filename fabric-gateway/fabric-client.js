'use strict';

const { connect, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CHANNEL_NAME = 'ehrchannel';
const CHAINCODE_NAME = 'ehr-contract';
const BASE_PATH = '/mnt/c/pw/Project-Work-1/blockchain';

const ORG_CONFIG = {
  Org1MSP: {
    mspId: 'Org1MSP',
    certPath: `${BASE_PATH}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem`,
    keyPath: `${BASE_PATH}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/`,
    tlsCertPath: `${BASE_PATH}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt`,
    peerEndpoint: 'localhost:7051',
    peerHostAlias: 'peer0.org1.example.com'
  },
  Org2MSP: {
    mspId: 'Org2MSP',
    certPath: `${BASE_PATH}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp/signcerts/Admin@org2.example.com-cert.pem`,
    keyPath: `${BASE_PATH}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp/keystore/`,
    tlsCertPath: `${BASE_PATH}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt`,
    peerEndpoint: 'localhost:9051',
    peerHostAlias: 'peer0.org2.example.com'
  },
  Org3MSP: {
    mspId: 'Org3MSP',
    certPath: `${BASE_PATH}/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp/signcerts/Admin@org3.example.com-cert.pem`,
    keyPath: `${BASE_PATH}/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp/keystore/`,
    tlsCertPath: `${BASE_PATH}/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt`,
    peerEndpoint: 'localhost:11051',
    peerHostAlias: 'peer0.org3.example.com'
  },
  Org4MSP: {
    mspId: 'Org4MSP',
    certPath: `${BASE_PATH}/organizations/peerOrganizations/org4.example.com/users/Admin@org4.example.com/msp/signcerts/Admin@org4.example.com-cert.pem`,
    keyPath: `${BASE_PATH}/organizations/peerOrganizations/org4.example.com/users/Admin@org4.example.com/msp/keystore/`,
    tlsCertPath: `${BASE_PATH}/organizations/peerOrganizations/org4.example.com/peers/peer0.org4.example.com/tls/ca.crt`,
    peerEndpoint: 'localhost:13051',
    peerHostAlias: 'peer0.org4.example.com'
  }
};

async function getFabricClient(orgMSP) {
  const orgConfig = ORG_CONFIG[orgMSP];
  if (!orgConfig) throw new Error(`Unknown org: ${orgMSP}`);
  const tlsCert = fs.readFileSync(orgConfig.tlsCertPath);
  const cert = fs.readFileSync(orgConfig.certPath);
  const keyFiles = fs.readdirSync(orgConfig.keyPath);
  const privateKeyPem = fs.readFileSync(path.join(orgConfig.keyPath, keyFiles[0]));
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const tlsCredentials = grpc.credentials.createSsl(tlsCert);
  const grpcClient = new grpc.Client(orgConfig.peerEndpoint, tlsCredentials, {
    'grpc.ssl_target_name_override': orgConfig.peerHostAlias
  });
  const gateway = connect({
    client: grpcClient,
    identity: { mspId: orgConfig.mspId, credentials: cert },
    signer: signers.newPrivateKeySigner(privateKey),
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 })
  });
  const network = gateway.getNetwork(CHANNEL_NAME);
  const contract = network.getContract(CHAINCODE_NAME);
  return { gateway, contract, grpcClient };
}

async function storeRecord(orgMSP, patientId, cid, hash) {
  const { gateway, contract, grpcClient } = await getFabricClient(orgMSP);
  try {
    const result = await contract.submitTransaction('StoreRecord', patientId, cid, hash, orgMSP);
    return JSON.parse(Buffer.from(result).toString());
  } finally { gateway.close(); grpcClient.close(); }
}

async function getRecord(orgMSP, patientId) {
  const { gateway, contract, grpcClient } = await getFabricClient(orgMSP);
  try {
    const result = await contract.evaluateTransaction('GetRecord', patientId);
    return JSON.parse(Buffer.from(result).toString());
  } finally { gateway.close(); grpcClient.close(); }
}

async function electLeader(orgMSP, electedLeader) {
  const { gateway, contract, grpcClient } = await getFabricClient(orgMSP);

  try {
    // ✅ Strict validation
    if (!orgMSP || !electedLeader) {
      throw new Error("Both orgMSP and electedLeader are required");
    }

    // ✅ ALWAYS send both arguments
    const result = await contract.submitTransaction(
      'ElectLeader',
      orgMSP,         // requesting org
      electedLeader   // AI selected leader
    );

    return JSON.parse(Buffer.from(result).toString());

  } finally {
    gateway.close();
    grpcClient.close();
  }
}

async function getCurrentLeader(orgMSP) {
  const { gateway, contract, grpcClient } = await getFabricClient(orgMSP);
  try {
    const result = await contract.evaluateTransaction('GetCurrentLeader');
    return JSON.parse(Buffer.from(result).toString());
  } finally { gateway.close(); grpcClient.close(); }
}

async function updateRecord(orgMSP, patientId, newCid, newHash) {
  const { gateway, contract, grpcClient } = await getFabricClient(orgMSP);
  try {
    const result = await contract.submitTransaction('UpdateRecord', patientId, newCid, newHash, orgMSP);
    return JSON.parse(Buffer.from(result).toString());
  } finally { gateway.close(); grpcClient.close(); }
}

async function getAllRecords(orgMSP) {
  const { gateway, contract, grpcClient } = await getFabricClient(orgMSP);
  try {
    const result = await contract.evaluateTransaction('GetAllRecords');
    return JSON.parse(Buffer.from(result).toString());
  } finally { gateway.close(); grpcClient.close(); }
}

module.exports = { storeRecord, getRecord, electLeader, getCurrentLeader, updateRecord, getAllRecords };
