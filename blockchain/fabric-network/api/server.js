'use strict';

const express = require('express');
const cors = require('cors');
const {
  storeRecord,
  getRecord,
  electLeader,
  getCurrentLeader,
  updateRecord,
  getAllRecords
} = require('../gateway/fabric-client');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;

// ── Health Check ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'Fabric API running', port: PORT });
});

// ── Store Record ─────────────────────────────────────────────────────
// POST /api/record/store
// Body: { orgMSP, patientId, cid, hash }
app.post('/api/record/store', async (req, res) => {
  try {
    const { orgMSP, patientId, cid, hash } = req.body;
    if (!orgMSP || !patientId || !cid || !hash) {
      return res.status(400).json({ error: 'Missing required fields: orgMSP, patientId, cid, hash' });
    }
    const result = await storeRecord(orgMSP, patientId, cid, hash);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get Record ───────────────────────────────────────────────────────
// GET /api/record/:patientId?orgMSP=Org1MSP
app.get('/api/record/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const orgMSP = req.query.orgMSP || 'Org1MSP';
    const result = await getRecord(orgMSP, patientId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get All Records ──────────────────────────────────────────────────
// GET /api/records?orgMSP=Org1MSP
app.get('/api/records', async (req, res) => {
  try {
    const orgMSP = req.query.orgMSP || 'Org1MSP';
    const result = await getAllRecords(orgMSP);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Elect Leader ─────────────────────────────────────────────────────
// POST /api/leader/elect
// Body: { orgMSP }
app.post('/api/leader/elect', async (req, res) => {
  try {
    const { orgMSP } = req.body;
    if (!orgMSP) {
      return res.status(400).json({ error: 'Missing required field: orgMSP' });
    }
    const result = await electLeader(orgMSP);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Get Current Leader ───────────────────────────────────────────────
// GET /api/leader?orgMSP=Org1MSP
app.get('/api/leader', async (req, res) => {
  try {
    const orgMSP = req.query.orgMSP || 'Org1MSP';
    const result = await getCurrentLeader(orgMSP);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Update Record ────────────────────────────────────────────────────
// PUT /api/record/update
// Body: { orgMSP, patientId, newCid, newHash }
app.put('/api/record/update', async (req, res) => {
  try {
    const { orgMSP, patientId, newCid, newHash } = req.body;
    if (!orgMSP || !patientId || !newCid || !newHash) {
      return res.status(400).json({ error: 'Missing required fields: orgMSP, patientId, newCid, newHash' });
    }
    const result = await updateRecord(orgMSP, patientId, newCid, newHash);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start Server ─────────────────────────────────────────────────────
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
