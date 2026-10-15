// Fix 2 (audit H-1): the customer's My Account journeys never expose the
// driver's internal id (enough, before the fix, to forge driver alerts).
const test = require('node:test');
const assert = require('node:assert/strict');
const { attachCustomerStatus } = require('../../api/account/index.js');

test('journeys omit driver ids and driver notes, but keep the status the driver id implies', () => {
  const [j] = attachCustomerStatus([{
    id: 'b1', ref: 'EVX-1', status: 'Dispatched', travel_date: '2099-01-01',
    assigned_driver_id: 'bbbbbbbb-0000-0000-0000-000000000d01', driver_id: 'bbbbbbbb-0000-0000-0000-000000000d01',
    driver_notes: 'gate code 1234',
  }]);
  assert.equal('assigned_driver_id' in j, false);
  assert.equal('driver_id' in j, false);
  assert.equal('driver_notes' in j, false);
  assert.equal(j.customer_status, 'Driver Confirmed');
  assert.equal(j.ref, 'EVX-1');
});

test('a booking without a driver still reads as Trip Confirmed', () => {
  const [j] = attachCustomerStatus([{ id: 'b2', status: 'Dispatched', travel_date: '2099-01-01', assigned_driver_id: null, driver_id: null }]);
  assert.equal(j.customer_status, 'Trip Confirmed');
});
