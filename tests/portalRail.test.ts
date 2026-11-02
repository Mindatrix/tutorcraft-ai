import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine';

const rooms = JSON.parse(readFileSync('content/multiverse_rooms.json', 'utf8'));

test('U3 Multiverse rail: the route of the scenario, passed / now / next by stage', () => {
  const r = E.portalRail(rooms, 'mv-05', 3);
  assert.equal(r.length, rooms.routes['mv-05'].length);
  assert.deepEqual(r.map((c) => c.state), ['done', 'done', 'now', 'next', 'next', 'next']);
  assert.equal(r[2].room, rooms.routes['mv-05'][2]);
  assert.ok(r.every((c) => c.name && !c.name.startsWith('r_')), 'every room on a route has a name');
  assert.equal(new Set(r.map((c) => c.key)).size, r.length, 'a room met twice still has its own card');
  // Unknown or missing scenario key → the first route; stages are clamped.
  assert.deepEqual(E.portalRail(rooms, undefined, 1).map((c) => c.room), Object.values(rooms.routes)[0]);
  assert.equal(E.portalRail(rooms, 'mv-01', 99).at(-1)!.state, 'now');
  assert.equal(E.portalRail(rooms, 'mv-01', 0)[0].state, 'now');
});
