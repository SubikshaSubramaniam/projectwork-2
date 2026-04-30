'use strict';

const express = require('express');
const cors = require('cors');
const {
  storeRecord, getRecord, electLeader,
  getCurrentLeader, updateRecord, getAllRecords
} = require('../fabric-gateway/fabric-client');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 4000;

app.get('/health', (req, res) => res.json({ status: 'Fabric API running', port: PORT }));

app.post('/api/record/store', async (req, res) => {
  try {
    const { orgMSP, patientId, cid, hash } = req.body;
    if (!orgMSP || !patientId || !cid || !hash)
      return res.status(400).json({ error: 'Missing fields' });
    res.json(await storeRecord(orgMSP, patientId, cid, hash));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/record/:patientId', async (req, res) => {
  try {
    res.json(await getRecord(req.query.orgMSP || 'Org1MSP', req.params.patientId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/records', async (req, res) => {
  try {
    res.json(await getAllRecords(req.query.orgMSP || 'Org1MSP'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leader/elect', async (req, res) => {
  try {
    const { orgMSP, leader } = req.body;
    if (!orgMSP || !leader) {
      return res.status(400).json({ error: 'Missing orgMSP or leader' });
    }

    // Submit from ALL orgs to satisfy MAJORITY endorsement policy
    const orgs = ['Org1MSP', 'Org2MSP', 'Org3MSP', 'Org4MSP'];
    let lastResult;
    const errors = [];

    for (const org of orgs) {
      try {
        lastResult = await electLeader(org, leader);
        console.log(`✅ Election submitted from ${org}:`, lastResult);
      } catch (err) {
        console.warn(`⚠️ Failed from ${org}:`, err.message);
        errors.push(`${org}: ${err.message}`);
      }
    }

    if (!lastResult) {
      return res.status(500).json({ error: 'All orgs failed', details: errors });
    }

    res.json(lastResult);

  } catch (err) {
    console.error("Leader election error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leader', async (req, res) => {
  try {
    res.json(await getCurrentLeader(req.query.orgMSP || 'Org1MSP'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/record/update', async (req, res) => {
  try {
    const { orgMSP, patientId, newCid, newHash } = req.body;
    if (!orgMSP || !patientId || !newCid || !newHash)
      return res.status(400).json({ error: 'Missing fields' });
    res.json(await updateRecord(orgMSP, patientId, newCid, newHash));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`✅ Fabric API Server running on http://localhost:${PORT}`);
  console.log(`   Health:      GET  http://localhost:${PORT}/health`);
  console.log(`   Store:       POST http://localhost:${PORT}/api/record/store`);
  console.log(`   Get:         GET  http://localhost:${PORT}/api/record/:patientId`);
  console.log(`   All Records: GET  http://localhost:${PORT}/api/records`);
  console.log(`   Elect:       POST http://localhost:${PORT}/api/leader/elect`);
  console.log(`   Leader:      GET  http://localhost:${PORT}/api/leader`);
  console.log(`   Update:      PUT  http://localhost:${PORT}/api/record/update`);
});
