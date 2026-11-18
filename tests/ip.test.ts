import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipBucket } from '../src/lib/ip'

test('ipBucket: IPv4 كما هو', () => {
  assert.equal(ipBucket('1.2.3.4'), '1.2.3.4')
  assert.equal(ipBucket('::ffff:10.0.0.1'), '10.0.0.1')
})

test('ipBucket: IPv6 بشبكته /64 — عناوين الشبكة الواحدة مفتاح واحد', () => {
  assert.equal(ipBucket('2001:db8:abcd:12:1:2:3:4'), '2001:db8:abcd:12::/64')
  assert.equal(ipBucket('2001:db8:abcd:12::99'), '2001:db8:abcd:12::/64')
  assert.equal(ipBucket('2001:0DB8:00ab:0012:ffff::1'), '2001:db8:ab:12::/64')
  assert.equal(ipBucket('2001:db8::1'), '2001:db8:0:0::/64')
  assert.notEqual(ipBucket('2001:db8:abcd:13::1'), ipBucket('2001:db8:abcd:12::1'))
})
