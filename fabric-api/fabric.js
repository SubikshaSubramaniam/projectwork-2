'use strict';

const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const org1Dir = path.join(
    process.env.HOME,
    'fabric-samples/test-network/organizations/peerOrganizations/org1.example.com'
);

const org2Dir = path.join(
    process.env.HOME,
    'fabric-samples/test-network/organizations/peerOrganizations/org2.example.com'
);

function getFirstFile(dirPath) {
    const files = fs.readdirSync(dirPath);
    return path.join(dirPath, files[0]);
}

// Org1 = Hospital A (Admin)
async function getContract() {
    const tlsCertPath = path.join(
        org1Dir,
        'peers/peer0.org1.example.com/tls/ca.crt'
    );
    const tlsCredentials = grpc.credentials.createSsl(
        fs.readFileSync(tlsCertPath)
    );

    const client = new grpc.Client(
        'localhost:7051',
        tlsCredentials,
        {
            'grpc.ssl_target_name_override': 'peer0.org1.example.com',
            'grpc.max_receive_message_length': 15728640,
            'grpc.max_send_message_length': 15728640,
        }
    );

    const certPath = getFirstFile(
        path.join(org1Dir, 'users/User1@org1.example.com/msp/signcerts')
    );
    const credentials = fs.readFileSync(certPath);

    const keyPath = getFirstFile(
        path.join(org1Dir, 'users/User1@org1.example.com/msp/keystore')
    );
    const privateKeyPem = fs.readFileSync(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const signer = signers.newPrivateKeySigner(privateKey);

    const gateway = connect({
        client,
        identity: { mspId: 'Org1MSP', credentials },
        signer,
        hash: hash.sha256,
        evaluateOptions: () => ({ deadline: Date.now() + 30000 }),
        endorseOptions: () => ({ deadline: Date.now() + 30000 }),
        submitOptions: () => ({ deadline: Date.now() + 30000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 120000 }),
    });

    const network = gateway.getNetwork('mychannel');
    const contract = network.getContract('ehr');

    return { contract, gateway, client };
}

// Org2 = Hospital B (Doctor)
async function getContract2() {
    const tlsCertPath = path.join(
        org2Dir,
        'peers/peer0.org2.example.com/tls/ca.crt'
    );
    const tlsCredentials = grpc.credentials.createSsl(
        fs.readFileSync(tlsCertPath)
    );

    const client = new grpc.Client(
        'localhost:9051',
        tlsCredentials,
        {
            'grpc.ssl_target_name_override': 'peer0.org2.example.com',
            'grpc.max_receive_message_length': 15728640,
            'grpc.max_send_message_length': 15728640,
        }
    );

    const certPath = getFirstFile(
        path.join(org2Dir, 'users/User1@org2.example.com/msp/signcerts')
    );
    const credentials = fs.readFileSync(certPath);

    const keyPath = getFirstFile(
        path.join(org2Dir, 'users/User1@org2.example.com/msp/keystore')
    );
    const privateKeyPem = fs.readFileSync(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const signer = signers.newPrivateKeySigner(privateKey);

    const gateway = connect({
        client,
        identity: { mspId: 'Org2MSP', credentials },
        signer,
        hash: hash.sha256,
        evaluateOptions: () => ({ deadline: Date.now() + 30000 }),
        endorseOptions: () => ({ deadline: Date.now() + 30000 }),
        submitOptions: () => ({ deadline: Date.now() + 30000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 120000 }),
    });

    const network = gateway.getNetwork('mychannel');
    const contract = network.getContract('ehr');

    return { contract, gateway, client };
}

module.exports = { getContract, getContract2 };
