'use strict';

const { getRecord, storeRecord, electLeader, getCurrentLeader, updateRecord } = require('./fabric-client');

async function main() {
  try {
    console.log('--- Testing Fabric Gateway ---');

    console.log('\n1. Storing record PATIENT003...');
    const stored = await storeRecord('Org1MSP', 'PATIENT003', 'QmGatewayCID', 'gatewayhash');
    console.log('Store result:', stored);

    console.log('\n2. Getting record PATIENT003...');
    const record = await getRecord('Org1MSP', 'PATIENT003');
    console.log('Get result:', record);

    console.log('\n3. Electing leader from Org1MSP...');
    const election = await electLeader('Org1MSP');
    console.log('Election result:', election);

    console.log('\n4. Getting current leader...');
    const leader = await getCurrentLeader('Org1MSP');
    console.log('Leader:', leader);

    console.log('\n5. Updating record as Org4MSP (leader)...');
    const updated = await updateRecord('Org4MSP', 'PATIENT003', 'QmNewCID999', 'newhash999');
    console.log('Update result:', updated);

    console.log('\n✅ All tests passed!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

main();
