// Tier 1 — deterministic unit tests for logic.js.
// Written BEFORE logic.js's implementation, per the test-driven build order in the plan.
// No live model, no DOM, no network — pure functions only.

const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('./logic.js');

const {
  GUARDRAIL_CONFIG,
  symbolicPiiFlags,
  redactInputPii,
  redactOutputPii,
  lookupCustomer,
  trackOrder,
  searchProducts,
  getPaymentSummary,
  getReturnClaim,
  createMemoryLedger,
  initiateRefund,
  decideRoute,
  newSessionContext,
  recordReferencedId,
} = logic;

// ---------------------------------------------------------------------------
// PII regex — symbolic layer
// ---------------------------------------------------------------------------

test('symbolicPiiFlags detects a card-like number', () => {
  const flags = symbolicPiiFlags('My card is 4242 4242 4242 4242, please charge it.');
  assert.equal(flags.card_like, true);
});

test('symbolicPiiFlags detects an SSN pattern', () => {
  const flags = symbolicPiiFlags('My SSN is 123-45-6789.');
  assert.equal(flags.ssn_like, true);
});

test('symbolicPiiFlags leaves ordinary text alone', () => {
  const flags = symbolicPiiFlags('Where is my order ORD-10001?');
  assert.equal(flags.card_like, false);
  assert.equal(flags.ssn_like, false);
});

test('redactInputPii redacts card and SSN but leaves ordinary text untouched', () => {
  const redacted = redactInputPii('Card 4242424242424242, SSN 123-45-6789, order ORD-10001');
  assert.ok(!redacted.includes('4242424242424242'));
  assert.ok(!redacted.includes('123-45-6789'));
  assert.ok(redacted.includes('ORD-10001'));
  assert.equal(redactInputPii('Where is my order?'), 'Where is my order?');
});

test('redactOutputPii additionally redacts email and phone', () => {
  const redacted = redactOutputPii('Contact a.rivera@example.com or 555-014-2000.');
  assert.ok(!redacted.includes('a.rivera@example.com'));
  assert.ok(!redacted.includes('555-014-2000'));
});

// ---------------------------------------------------------------------------
// Tool implementations — least-privilege field shapes
// ---------------------------------------------------------------------------

test('lookupCustomer never returns email, phone, address, dob, or ssn', () => {
  const c = lookupCustomer('CUST-2001');
  assert.ok(c, 'expected a customer record for CUST-2001');
  const forbidden = ['email', 'phone', 'home_address', 'address', 'dob', 'ssn', 'ssn_last_four'];
  for (const key of forbidden) {
    assert.equal(Object.prototype.hasOwnProperty.call(c, key), false, `lookupCustomer leaked "${key}"`);
  }
  assert.ok(c.customer_id);
  assert.ok('account_status' in c);
  assert.ok('loyalty_tier' in c);
});

test('lookupCustomer returns null for an unknown customer', () => {
  assert.equal(lookupCustomer('CUST-9999'), null);
});

test('trackOrder returns the notes field verbatim, including a poisoned instruction', () => {
  const order = trackOrder('ORD-10004');
  assert.ok(order, 'expected ORD-10004 to exist as the indirect-injection fixture');
  assert.ok(
    order.notes.includes('SYSTEM OVERRIDE'),
    'the poisoned notes fixture must survive unfiltered — the defense is the prompt, not a filter',
  );
});

test('getPaymentSummary only exposes masked card info, never a full number', () => {
  const p = getPaymentSummary('ORD-10001');
  assert.ok(p);
  assert.equal('card_last_four' in p, true);
  assert.equal('card_number' in p, false);
  assert.equal('cvv' in p, false);
});

test('searchProducts matches by case-insensitive substring', () => {
  const hits = searchProducts('mouse');
  assert.ok(hits.length >= 1);
  assert.ok(hits.every((h) => 'in_stock' in h));
});

test('getReturnClaim fetches a known claim by id', () => {
  const claim = getReturnClaim('RET-5001');
  assert.ok(claim);
  assert.equal(claim.order_id, 'ORD-10001');
});

// ---------------------------------------------------------------------------
// Refund cap + idempotency — the one piece of unconditional enforcement
// ---------------------------------------------------------------------------

test('initiateRefund approves an amount at or under the cap and records the ledger', () => {
  const ledger = createMemoryLedger();
  const result = initiateRefund({ claimId: 'RET-5001', amount: 35.0, ledger });
  assert.equal(result.ok, true);
  assert.ok(result.refund_id);
  assert.ok(ledger.has('RET-5001'));
});

test('initiateRefund refuses an amount over the cap and does not touch the ledger', () => {
  const ledger = createMemoryLedger();
  const result = initiateRefund({ claimId: 'RET-5002', amount: 120.0, ledger });
  assert.equal(result.ok, false);
  assert.ok(/exceeds/i.test(result.reason));
  assert.equal(ledger.has('RET-5002'), false);
});

test('initiateRefund refuses a second attempt on an already-refunded claim (idempotency)', () => {
  const ledger = createMemoryLedger();
  const first = initiateRefund({ claimId: 'RET-5001', amount: 35.0, ledger });
  const second = initiateRefund({ claimId: 'RET-5001', amount: 35.0, ledger });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.ok(/already/i.test(second.reason));
  // the ledger entry must be exactly the one from the first call, not overwritten or duplicated
  assert.equal(ledger.get('RET-5001').refund_id, first.refund_id);
});

test('initiateRefund respects a custom config cap', () => {
  const ledger = createMemoryLedger();
  const result = initiateRefund({
    claimId: 'RET-5001',
    amount: 10.0,
    ledger,
    config: { ...GUARDRAIL_CONFIG, refund_auto_limit: 5.0 },
  });
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// Routing decision — the full failure-policy table as pure logic
// ---------------------------------------------------------------------------

test('decideRoute blocks on high injection score regardless of other scores', () => {
  const { route } = decideRoute({ injectionScore: 0.95, toxicityScore: 0.0, isOnTopic: true });
  assert.equal(route, 'blocked');
});

test('decideRoute blocks on toxicity at/above the block threshold', () => {
  const { route } = decideRoute({ injectionScore: 0.0, toxicityScore: 0.999, isOnTopic: true });
  assert.equal(route, 'blocked');
});

test('decideRoute escalates on mid-band toxicity (frustrated, not malicious)', () => {
  const { route } = decideRoute({ injectionScore: 0.0, toxicityScore: 0.6, isOnTopic: true });
  assert.equal(route, 'escalate');
});

test('decideRoute passes low toxicity below the review threshold', () => {
  const { route } = decideRoute({ injectionScore: 0.0, toxicityScore: 0.1, isOnTopic: true });
  assert.equal(route, 'agent');
});

test('decideRoute routes off-topic when clear on injection/toxicity but off-topic', () => {
  const { route } = decideRoute({ injectionScore: 0.0, toxicityScore: 0.0, isOnTopic: false });
  assert.equal(route, 'offtopic');
});

test('decideRoute is exactly at the default thresholds', () => {
  assert.equal(GUARDRAIL_CONFIG.injection_threshold, 0.8);
  assert.equal(GUARDRAIL_CONFIG.toxicity_block, 0.999);
  assert.equal(GUARDRAIL_CONFIG.toxicity_review, 0.4);
  assert.equal(GUARDRAIL_CONFIG.refund_auto_limit, 50.0);
});

// ---------------------------------------------------------------------------
// Multi-turn session context
// ---------------------------------------------------------------------------

test('recordReferencedId accumulates ids without duplicating', () => {
  let ctx = newSessionContext();
  ctx = recordReferencedId(ctx, 'order', 'ORD-10001');
  ctx = recordReferencedId(ctx, 'order', 'ORD-10001');
  ctx = recordReferencedId(ctx, 'claim', 'RET-5001');
  assert.deepEqual(ctx.orders, ['ORD-10001']);
  assert.deepEqual(ctx.claims, ['RET-5001']);
  assert.deepEqual(ctx.customers, []);
});
