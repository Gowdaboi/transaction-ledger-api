const http = require('http');

const BASE = 'http://localhost:3000/api';
let passed = 0;
let failed = 0;
const failures = [];

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(label);
  }
}

async function run() {
  console.log('========================================');
  console.log('TRANSACTION LEDGER API — TEST SUITE');
  console.log('========================================\n');

  // ------------------------------------------------
  // 1. Account creation — balance always starts at 0
  // ------------------------------------------------
  console.log('1. ACCOUNT CREATION');

  const acctA = await request('POST', '/accounts', { name: 'Alice Test' });
  assert('Create account A returns 201', acctA.status === 201, `got ${acctA.status}`);
  assert('Account A balance is 0', acctA.body.data.balance === 0, `got ${acctA.body.data.balance}`);
  assert('Account A has UUID id', /^[0-9a-f-]{36}$/i.test(acctA.body.data.id));
  assert('Account A has created_at', !!acctA.body.data.created_at);
  assert('Account A name matches', acctA.body.data.name === 'Alice Test');

  const acctB = await request('POST', '/accounts', { name: 'Bob Test' });
  assert('Create account B returns 201', acctB.status === 201, `got ${acctB.status}`);
  assert('Account B balance is 0', acctB.body.data.balance === 0);

  // Try to sneak in a balance
  const acctSneak = await request('POST', '/accounts', { name: 'Sneaky', balance: 999 });
  assert('Sneaked balance is ignored, starts at 0', acctSneak.body.data.balance === 0, `got ${acctSneak.body.data.balance}`);

  // Missing name
  const noName = await request('POST', '/accounts', {});
  assert('Missing name returns 400', noName.status === 400, `got ${noName.status}`);

  const emptyName = await request('POST', '/accounts', { name: '' });
  assert('Empty name returns 400', emptyName.status === 400, `got ${emptyName.status}`);

  const idA = acctA.body.data.id;
  const idB = acctB.body.data.id;

  // ------------------------------------------------
  // 2. Credit and debit update balance correctly
  // ------------------------------------------------
  console.log('\n2. CREDIT AND DEBIT OPERATIONS');

  const credit1 = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'credit', amount: 100, description: 'Initial deposit', reference_id: 'CR-001'
  });
  assert('Credit 100 returns 201', credit1.status === 201, `got ${credit1.status}`);
  assert('Balance after credit is 100', credit1.body.data.balance_after === 100, `got ${credit1.body.data.balance_after}`);

  const credit2 = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'credit', amount: 50, description: 'Second deposit', reference_id: 'CR-002'
  });
  assert('Balance after second credit is 150', credit2.body.data.balance_after === 150, `got ${credit2.body.data.balance_after}`);

  const debit1 = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'debit', amount: 30, description: 'Withdrawal', reference_id: 'DB-001'
  });
  assert('Debit 30 returns 201', debit1.status === 201, `got ${debit1.status}`);
  assert('Balance after debit is 120', debit1.body.data.balance_after === 120, `got ${debit1.body.data.balance_after}`);

  // Verify via balance endpoint
  const balA = await request('GET', `/accounts/${idA}/balance`);
  assert('GET balance confirms 120', balA.body.data.balance === 120, `got ${balA.body.data.balance}`);

  // ------------------------------------------------
  // 3. Insufficient balance rejection
  // ------------------------------------------------
  console.log('\n3. INSUFFICIENT BALANCE REJECTION');

  const overDebit = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'debit', amount: 999, description: 'Too much', reference_id: 'DB-OVER'
  });
  assert('Overdraft returns 422', overDebit.status === 422, `got ${overDebit.status}`);
  assert('Error response has success=false', overDebit.body.success === false);

  const balAfterReject = await request('GET', `/accounts/${idA}/balance`);
  assert('Balance unchanged after rejection (still 120)', balAfterReject.body.data.balance === 120, `got ${balAfterReject.body.data.balance}`);

  // Exact balance debit should succeed
  const exactDebit = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'debit', amount: 120, description: 'Drain account', reference_id: 'DB-EXACT'
  });
  assert('Exact balance debit returns 201', exactDebit.status === 201, `got ${exactDebit.status}`);
  assert('Balance after exact debit is 0', exactDebit.body.data.balance_after === 0, `got ${exactDebit.body.data.balance_after}`);

  // Debit from zero balance
  const zeroDebit = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'debit', amount: 1, description: 'From empty', reference_id: 'DB-ZERO'
  });
  assert('Debit from zero balance returns 422', zeroDebit.status === 422, `got ${zeroDebit.status}`);

  // Refund so we can keep testing
  await request('POST', `/accounts/${idA}/transactions`, {
    type: 'credit', amount: 200, description: 'Refund for testing', reference_id: 'CR-REFUND'
  });

  // ------------------------------------------------
  // 4. Duplicate reference_id handling
  // ------------------------------------------------
  console.log('\n4. DUPLICATE REFERENCE_ID');

  const dup = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'credit', amount: 100, description: 'Duplicate attempt', reference_id: 'CR-001'
  });
  assert('Duplicate reference_id returns 409', dup.status === 409, `got ${dup.status}`);
  assert('Response indicates existing transaction', !!dup.body.error.existing_transaction_id);

  const balAfterDup = await request('GET', `/accounts/${idA}/balance`);
  assert('Balance unchanged after duplicate (still 200)', balAfterDup.body.data.balance === 200, `got ${balAfterDup.body.data.balance}`);

  // Same reference_id on DIFFERENT account should work
  const crossRef = await request('POST', `/accounts/${idB}/transactions`, {
    type: 'credit', amount: 50, description: 'Same ref, different account', reference_id: 'CR-001'
  });
  assert('Same reference_id on different account returns 201', crossRef.status === 201, `got ${crossRef.status}`);

  // ------------------------------------------------
  // 5. Atomicity (tested via constraint violation)
  // ------------------------------------------------
  console.log('\n5. ATOMICITY');

  const balBefore = await request('GET', `/accounts/${idA}/balance`);
  const beforeVal = balBefore.body.data.balance;

  // Force a failure: invalid account should not leave partial state
  const badAcct = await request('POST', '/accounts/00000000-0000-0000-0000-000000000000/transactions', {
    type: 'credit', amount: 50, description: 'Ghost account', reference_id: 'ATOM-001'
  });
  assert('Transaction on non-existent account returns 404', badAcct.status === 404, `got ${badAcct.status}`);

  const balAfterBad = await request('GET', `/accounts/${idA}/balance`);
  assert('Balance unchanged after failed transaction', balAfterBad.body.data.balance === beforeVal);

  // ------------------------------------------------
  // 6. Concurrent debit race condition
  // ------------------------------------------------
  console.log('\n6. CONCURRENT DEBIT (RACE CONDITION)');

  // Create a fresh account with exactly 100
  const raceAcct = await request('POST', '/accounts', { name: 'Race Test' });
  const raceId = raceAcct.body.data.id;
  await request('POST', `/accounts/${raceId}/transactions`, {
    type: 'credit', amount: 100, description: 'Setup', reference_id: 'RACE-SETUP'
  });

  // Fire 5 concurrent debits of 30 each — only 3 should succeed (3x30=90 <= 100)
  const concurrentDebits = Array.from({ length: 5 }, (_, i) =>
    request('POST', `/accounts/${raceId}/transactions`, {
      type: 'debit', amount: 30, description: `Concurrent ${i}`, reference_id: `RACE-${i}`
    })
  );
  const results = await Promise.all(concurrentDebits);
  const successes = results.filter(r => r.status === 201).length;
  const rejections = results.filter(r => r.status === 422).length;

  assert('At most 3 concurrent debits succeed (3x30=90 <= 100)', successes <= 3, `got ${successes} successes`);
  assert('Remaining debits rejected as insufficient', rejections >= 2, `got ${rejections} rejections`);

  const raceBal = await request('GET', `/accounts/${raceId}/balance`);
  assert('Race account balance >= 0 (no overdraft)', raceBal.body.data.balance >= 0, `got ${raceBal.body.data.balance}`);
  assert('Race account balance is consistent', raceBal.body.data.balance === 100 - (successes * 30), `expected ${100 - successes * 30}, got ${raceBal.body.data.balance}`);

  // ------------------------------------------------
  // 7. Transaction history — filtering, pagination, sorting
  // ------------------------------------------------
  console.log('\n7. TRANSACTION HISTORY');

  // Get all transactions for account A
  const allTx = await request('GET', `/accounts/${idA}/transactions`);
  assert('Get all transactions returns 200', allTx.status === 200, `got ${allTx.status}`);
  assert('Transactions array is non-empty', allTx.body.data.length > 0);
  assert('Pagination metadata present', !!allTx.body.pagination);
  assert('Has total_records', typeof allTx.body.pagination.total_records === 'number');
  assert('Has total_pages', typeof allTx.body.pagination.total_pages === 'number');

  // Verify latest-first ordering
  const dates = allTx.body.data.map(t => new Date(t.created_at).getTime());
  const isSorted = dates.every((d, i) => i === 0 || d <= dates[i - 1]);
  assert('Transactions sorted latest-first', isSorted, `timestamps: ${dates.join(', ')}`);

  // Filter by type=credit
  const credits = await request('GET', `/accounts/${idA}/transactions?type=credit`);
  assert('Credit filter returns only credits', credits.body.data.every(t => t.type === 'credit'));

  // Filter by type=debit
  const debits = await request('GET', `/accounts/${idA}/transactions?type=debit`);
  assert('Debit filter returns only debits', debits.body.data.every(t => t.type === 'debit'));

  // Pagination
  const page1 = await request('GET', `/accounts/${idA}/transactions?page=1&limit=2`);
  assert('Page 1 with limit=2 returns at most 2 records', page1.body.data.length <= 2, `got ${page1.body.data.length}`);
  assert('Pagination shows page=1', page1.body.pagination.page === 1);
  assert('Pagination shows limit=2', page1.body.pagination.limit === 2);

  const page2 = await request('GET', `/accounts/${idA}/transactions?page=2&limit=2`);
  assert('Page 2 returns data or empty array', Array.isArray(page2.body.data));

  // Invalid type filter
  const badType = await request('GET', `/accounts/${idA}/transactions?type=invalid`);
  assert('Invalid type filter returns 400', badType.status === 400, `got ${badType.status}`);

  // ------------------------------------------------
  // 8. Error handling — status codes and response format
  // ------------------------------------------------
  console.log('\n8. ERROR HANDLING');

  // 404 — account not found
  const notFound = await request('GET', '/accounts/00000000-0000-0000-0000-000000000000/balance');
  assert('Non-existent account returns 404', notFound.status === 404, `got ${notFound.status}`);
  assert('Error has success=false', notFound.body.success === false);
  assert('Error has message', typeof notFound.body.error.message === 'string');

  // 400 — invalid UUID
  const badUuid = await request('GET', '/accounts/not-a-uuid/balance');
  assert('Invalid UUID returns 400', badUuid.status === 400, `got ${badUuid.status}`);

  // 400 — invalid transaction type
  const badTxType = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'transfer', amount: 10, reference_id: 'BAD-TYPE'
  });
  assert('Invalid transaction type returns 400', badTxType.status === 400, `got ${badTxType.status}`);

  // 400 — negative amount
  const negAmount = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'credit', amount: -10, reference_id: 'NEG-AMT'
  });
  assert('Negative amount returns 400', negAmount.status === 400, `got ${negAmount.status}`);

  // 400 — zero amount
  const zeroAmount = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'credit', amount: 0, reference_id: 'ZERO-AMT'
  });
  assert('Zero amount returns 400', zeroAmount.status === 400, `got ${zeroAmount.status}`);

  // 400 — missing reference_id
  const noRef = await request('POST', `/accounts/${idA}/transactions`, {
    type: 'credit', amount: 10
  });
  assert('Missing reference_id returns 400', noRef.status === 400, `got ${noRef.status}`);

  // 400 — invalid pagination
  const badPage = await request('GET', `/accounts/${idA}/transactions?page=0`);
  assert('Page=0 returns 400', badPage.status === 400, `got ${badPage.status}`);

  const badLimit = await request('GET', `/accounts/${idA}/transactions?limit=999`);
  assert('Limit=999 returns 400', badLimit.status === 400, `got ${badLimit.status}`);

  // 404 — unknown route
  const noRoute = await request('GET', '/nonexistent');
  assert('Unknown route returns 404', noRoute.status === 404, `got ${noRoute.status}`);

  // ------------------------------------------------
  // BONUS: Money Transfer
  // ------------------------------------------------
  console.log('\n9. MONEY TRANSFER (BONUS)');

  const balABefore = await request('GET', `/accounts/${idA}/balance`);
  const balBBefore = await request('GET', `/accounts/${idB}/balance`);

  const transfer = await request('POST', '/transfers', {
    from_account_id: idA, to_account_id: idB, amount: 25,
    description: 'Test transfer', reference_id: 'TRF-001'
  });
  assert('Transfer returns 201', transfer.status === 201, `got ${transfer.status}`);
  assert('Transfer shows both transaction IDs', !!transfer.body.data.debit_transaction.id && !!transfer.body.data.credit_transaction.id);

  const balAAfter = await request('GET', `/accounts/${idA}/balance`);
  const balBAfter = await request('GET', `/accounts/${idB}/balance`);
  assert('Source balance decreased by 25', balAAfter.body.data.balance === balABefore.body.data.balance - 25, `expected ${balABefore.body.data.balance - 25}, got ${balAAfter.body.data.balance}`);
  assert('Destination balance increased by 25', balBAfter.body.data.balance === balBBefore.body.data.balance + 25, `expected ${balBBefore.body.data.balance + 25}, got ${balBAfter.body.data.balance}`);

  // Duplicate transfer
  const dupTransfer = await request('POST', '/transfers', {
    from_account_id: idA, to_account_id: idB, amount: 25,
    description: 'Duplicate', reference_id: 'TRF-001'
  });
  assert('Duplicate transfer returns 409', dupTransfer.status === 409, `got ${dupTransfer.status}`);

  // Transfer to self
  const selfTransfer = await request('POST', '/transfers', {
    from_account_id: idA, to_account_id: idA, amount: 10,
    reference_id: 'TRF-SELF'
  });
  assert('Self-transfer returns 400', selfTransfer.status === 400, `got ${selfTransfer.status}`);

  // Transfer with insufficient balance
  const bigTransfer = await request('POST', '/transfers', {
    from_account_id: idA, to_account_id: idB, amount: 999999,
    reference_id: 'TRF-BIG'
  });
  assert('Insufficient balance transfer returns 422', bigTransfer.status === 422, `got ${bigTransfer.status}`);

  // ------------------------------------------------
  // SUMMARY
  // ------------------------------------------------
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('========================================');
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner crashed:', err.message);
  process.exit(1);
});
