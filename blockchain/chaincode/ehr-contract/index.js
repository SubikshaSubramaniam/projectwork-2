'use strict';

const { Contract } = require('fabric-contract-api');

class EHRContract extends Contract {

  // ─── Store EHR Record ───────────────────────────────────────────────
  async StoreRecord(ctx, patientId, cid, hash, orgId) {
    const existing = await ctx.stub.getState(patientId);
    if (existing && existing.length > 0) {
      throw new Error(`Record for patient ${patientId} already exists. Use UpdateRecord.`);
    }

    const record = {
      patientId,
      cid,
      hash,
      orgId,
      status: 'stored',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: null,
      leader: null
    };

    await ctx.stub.putState(patientId, Buffer.from(JSON.stringify(record)));
    return JSON.stringify({ success: true, message: 'Record stored', patientId });
  }

  // ─── Get EHR Record ─────────────────────────────────────────────────
  async GetRecord(ctx, patientId) {
    const data = await ctx.stub.getState(patientId);
    if (!data || data.length === 0) {
      throw new Error(`Record for patient ${patientId} not found`);
    }
    return data.toString();
  }

  // ─── Elect Leader  ─────────────────────────────────
  async ElectLeader(ctx, requestingOrg, electedLeader) {
  const orgs = ['Org1MSP', 'Org2MSP', 'Org3MSP', 'Org4MSP'];

  if (!orgs.includes(requestingOrg)) {
    throw new Error(`Unknown org: ${requestingOrg}`);
  }

  const leader = (electedLeader && orgs.includes(electedLeader))
    ? electedLeader
    : requestingOrg;

  const leaderData = {
    leader: leader,
    electedAt: new Date().toISOString(),
    electedBy: requestingOrg,
    electedByAI: true,
    active: true
  };

  await ctx.stub.putState('CURRENT_LEADER', Buffer.from(JSON.stringify(leaderData)));
  await ctx.stub.setEvent('LeaderElected', Buffer.from(JSON.stringify(leaderData)));

  return JSON.stringify({
    success: true,
    electedLeader: leader,
    electedBy: requestingOrg
  });
}
  // ─── Get Current Leader ──────────────────────────────────────────────
  async GetCurrentLeader(ctx) {
    const data = await ctx.stub.getState('CURRENT_LEADER');
    if (!data || data.length === 0) {
      return JSON.stringify({ leader: null, active: false });
    }
    return data.toString();
  }

  // ─── Update Record (only elected leader can call) ────────────────────
  async UpdateRecord(ctx, patientId, newCid, newHash, callerOrg) {
    // Check leader
    const leaderData = await ctx.stub.getState('CURRENT_LEADER');
    if (!leaderData || leaderData.length === 0) {
      throw new Error('No leader elected. Trigger ElectLeader first.');
    }

    const leader = JSON.parse(leaderData.toString());
    if (!leader.active) {
      throw new Error('Leader session expired. Trigger ElectLeader again.');
    }

    if (leader.leader !== callerOrg) {
      throw new Error(`Access denied. Only ${leader.leader} can update. You are ${callerOrg}.`);
    }

    // Get existing record
    const existing = await ctx.stub.getState(patientId);
    if (!existing || existing.length === 0) {
      throw new Error(`Record for patient ${patientId} not found`);
    }

    const record = JSON.parse(existing.toString());
    record.cid = newCid;
    record.hash = newHash;
    record.updatedAt = new Date().toISOString();
    record.updatedBy = callerOrg;
    record.status = 'updated';

    await ctx.stub.putState(patientId, Buffer.from(JSON.stringify(record)));

    // Clear leader after successful update
    const clearedLeader = { ...leader, active: false, clearedAt: new Date().toISOString() };
    await ctx.stub.putState('CURRENT_LEADER', Buffer.from(JSON.stringify(clearedLeader)));

    // Emit event
    await ctx.stub.setEvent('RecordUpdated', Buffer.from(JSON.stringify({ patientId, updatedBy: callerOrg })));

    return JSON.stringify({ success: true, message: 'Record updated', patientId, updatedBy: callerOrg });
  }

  // ─── Clear Leader (manual reset) ────────────────────────────────────
  async ClearLeader(ctx) {
    const data = await ctx.stub.getState('CURRENT_LEADER');
    if (!data || data.length === 0) {
      return JSON.stringify({ message: 'No leader to clear' });
    }
    const leader = JSON.parse(data.toString());
    leader.active = false;
    leader.clearedAt = new Date().toISOString();
    await ctx.stub.putState('CURRENT_LEADER', Buffer.from(JSON.stringify(leader)));
    return JSON.stringify({ success: true, message: 'Leader cleared' });
  }

  // ─── Get All Records (for admin dashboard) ───────────────────────────
  async GetAllRecords(ctx) {
    const iterator = await ctx.stub.getStateByRange('', '');
    const results = [];
    let result = await iterator.next();
    while (!result.done) {
      const key = result.value.key;
      if (key === 'CURRENT_LEADER') {
        result = await iterator.next();
        continue;
      }
      const value = result.value.value.toString();
      try {
        results.push(JSON.parse(value));
      } catch (e) {
        results.push({ key, value });
      }
      result = await iterator.next();
    }
    await iterator.close();
    return JSON.stringify(results);
  }
}

module.exports = EHRContract;
