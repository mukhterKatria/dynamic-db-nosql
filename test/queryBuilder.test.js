const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFilter,
  normalizeLimit,
  parseScalar,
  parseFilterValue,
  buildProjection
} = require('../src/queryBuilder');

test('buildFilter builds multiple operators', () => {
  const filter = buildFilter([
    { field: 'status', op: 'eq', value: 'shipped' },
    { field: 'amount', op: 'gte', value: '100' }
  ]);

  assert.deepEqual(filter, {
    status: 'shipped',
    amount: { $gte: 100 }
  });
});

test('normalizeLimit clamps values', () => {
  assert.equal(normalizeLimit(1000), 500);
  assert.equal(normalizeLimit(-2), 50);
});

test('parseScalar parses booleans and numbers', () => {
  assert.equal(parseScalar('true'), true);
  assert.equal(parseScalar('42'), 42);
});

test('parseFilterValue supports comma-separated list for in operator', () => {
  assert.deepEqual(parseFilterValue('in', '1,2,true'), [1, 2, true]);
});

test('buildProjection rejects unknown fields when allow-list is provided', () => {
  assert.throws(() => buildProjection(['doesNotExist'], { allowedFields: ['status'] }), {
    message: 'Unknown field requested: doesNotExist'
  });
});
