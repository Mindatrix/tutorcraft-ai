import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine';

test('U3 Kayak course: same obstacles every time, beside the lanes, inside the course', () => {
  const a = E.kayakObstacles();
  assert.deepEqual(E.kayakObstacles(), a, 'seeded: the 3D scene and the minimap see the same course');
  assert.ok(a.length >= 9);
  for (const o of a) {
    assert.ok(Math.abs(o.x) > E.KAYAK_LANE + 1, `${o.kind} at x ${o.x} is beside the lanes (race never depends on it)`);
    assert.ok(-o.z > 0 && -o.z < E.KAYAK_COURSE_LENGTH, `${o.kind} at ${-o.z} m`);
  }
});

test('U3 Kayak minimap sections: 20 m each, busy where obstacles gather, clear where none', () => {
  const s = E.kayakSections(E.kayakObstacles());
  assert.equal(s.length, Math.ceil(E.KAYAK_COURSE_LENGTH / E.KAYAK_SECTION_M));
  assert.equal(s[0].from, 0);
  assert.equal(s.at(-1)!.to, E.KAYAK_COURSE_LENGTH);
  const synthetic = E.kayakSections([{ kind: 'log', x: 5, z: -5 }, { kind: 'ice', x: 5, z: -8 }, { kind: 'barrier', x: -5, z: -45 }], 60, 20);
  assert.deepEqual(synthetic.map((x) => x.level), ['busy', 'clear', 'some'], 'log counts double: 2 + 1 = busy');
});

test('U3 compass maths: bearings clockwise from north (−z), signed differences', () => {
  assert.equal(E.bearingDeg(0, 0, 0, -10), 0);
  assert.equal(E.bearingDeg(0, 0, 10, 0), 90);
  assert.equal(E.bearingDeg(0, 0, 0, 10), 180);
  assert.equal(E.bearingDeg(0, 0, -10, 0), 270);
  assert.equal(E.angleDelta(10, 350), 20);
  assert.equal(E.angleDelta(350, 10), -20);
  assert.equal(E.angleDelta(180, 0), 180);
});
