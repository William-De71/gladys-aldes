// Scene triggers: one event per transition, a baseline at the first reading,
// unknown values keep the last known ones, and what the integration commanded
// itself never fires.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseProducts } from '../src/aldes.js';
import {
  TRIGGERS,
  detectEvents,
  snapshotOf,
  boostMinutes,
  holidayDays,
  option,
  wholeNumber,
  FILTER_DUE_PERCENT,
  DEFAULT_BOOST_MINUTES,
} from '../src/events.js';
import { PRODUCTS, VMC_ID, TONE_ID, T0 } from './helpers/fixtures.js';

const parsed = parseProducts(PRODUCTS);
const vmc = parsed.products.find((p) => p.id === VMC_ID);
const tone = parsed.products.find((p) => p.id === TONE_ID);
const context = { device: 'ext:x:ventilation:1', name: 'VMC', now: T0 };
const keys = (result) => result.events.map((event) => event.key);

test('the first reading only sets the baseline', () => {
  const result = detectEvents(null, vmc, context);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.snapshot, {
    mode: 'daily',
    online: true,
    filterLife: 60,
    holiday: false,
  });
});

test('a mode change fires once, with the new and the previous mode', () => {
  const previous = snapshotOf(vmc, T0);
  const result = detectEvents(previous, { ...vmc, mode: 'boost' }, context);
  assert.deepEqual(result.events, [
    {
      key: TRIGGERS.MODE_CHANGED,
      data: {
        device: context.device,
        device_name: 'VMC',
        kind: 'ventilation',
        mode: 'boost',
        previous_mode: 'daily',
      },
    },
  ]);
  assert.deepEqual(keys(detectEvents(result.snapshot, { ...vmc, mode: 'boost' }, context)), []);
  const air = detectEvents(snapshotOf(tone, T0), { ...tone, airMode: 'cool_comfort' }, context);
  assert.equal(air.events[0].data.mode, 'cool_comfort');
  assert.equal(air.events[0].data.kind, 'heat_pump');
});

test('a commanded mode does not fire, another one does', () => {
  const previous = snapshotOf(vmc, T0);
  const expected = (what, value) => what === 'mode' && value === 'boost';
  assert.deepEqual(
    keys(detectEvents(previous, { ...vmc, mode: 'boost' }, { ...context, expected })),
    [],
  );
  assert.deepEqual(
    keys(detectEvents(previous, { ...vmc, mode: 'guests' }, { ...context, expected })),
    [TRIGGERS.MODE_CHANGED],
  );
});

test('offline and back online', () => {
  const previous = snapshotOf(vmc, T0);
  const off = detectEvents(previous, { ...vmc, online: false }, context);
  assert.deepEqual(keys(off), [TRIGGERS.CONNECTION_CHANGED]);
  assert.equal(off.events[0].data.state, 'offline');
  const back = detectEvents(off.snapshot, vmc, context);
  assert.equal(back.events[0].data.state, 'online');
  // An unknown state keeps the last one: nothing fires.
  const unknown = detectEvents(previous, { ...vmc, online: null }, context);
  assert.deepEqual(keys(unknown), []);
  assert.equal(unknown.snapshot.online, true);
});

test('the filter fires once when it goes down to 10 %', () => {
  const at = (life) => ({ ...vmc, filter: { ...vmc.filter, life } });
  const previous = snapshotOf(at(12), T0);
  const due = detectEvents(previous, at(FILTER_DUE_PERCENT), context);
  assert.deepEqual(keys(due), [TRIGGERS.FILTER_DUE]);
  assert.equal(due.events[0].data.filter_life, 10);
  assert.deepEqual(keys(detectEvents(due.snapshot, at(5), context)), []);
  // Changed, then worn again: it fires again.
  const fresh = detectEvents(due.snapshot, at(100), context);
  assert.deepEqual(keys(detectEvents(fresh.snapshot, at(8), context)), [TRIGGERS.FILTER_DUE]);
});

test('holidays: the mode of a ventilation unit, the dates of a T.One', () => {
  const vmcHoliday = detectEvents(snapshotOf(vmc, T0), { ...vmc, mode: 'holidays' }, context);
  assert.deepEqual(keys(vmcHoliday), [TRIGGERS.MODE_CHANGED, TRIGGERS.HOLIDAY_CHANGED]);
  assert.equal(vmcHoliday.events[1].data.state, 'started');
  assert.equal(vmcHoliday.events[1].data.end, '');

  const away = {
    ...tone,
    holidayStart: '2026-11-15T00:00:00.000Z',
    holidayEnd: '2026-11-22T00:00:00.000Z',
  };
  const started = detectEvents(snapshotOf(tone, T0), away, context);
  assert.deepEqual(keys(started), [TRIGGERS.HOLIDAY_CHANGED]);
  assert.equal(started.events[0].data.end, '2026-11-22');
  const ended = detectEvents(started.snapshot, away, {
    ...context,
    now: Date.parse('2026-11-22T01:00:00Z'),
  });
  assert.equal(ended.events[0].data.state, 'ended');
  const quiet = detectEvents(snapshotOf(tone, T0), away, {
    ...context,
    expected: (what, value) => what === 'holiday' && value === true,
  });
  assert.deepEqual(keys(quiet), []);
});

test('event data stays flat and small', () => {
  const previous = { mode: 'daily', online: true, filterLife: 50, holiday: false };
  const changed = { ...vmc, mode: 'holidays', online: false, filter: { life: 5 } };
  const { events } = detectEvents(previous, changed, context);
  assert.equal(events.length, 4);
  for (const { data } of events) {
    assert.ok(Object.keys(data).length <= 30);
    for (const value of Object.values(data)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value) || value === null);
      if (typeof value === 'string') assert.ok(value.length <= 1000);
    }
  }
});

test('action fields: boost minutes, holiday days, options', () => {
  assert.equal(boostMinutes(undefined), DEFAULT_BOOST_MINUTES);
  assert.equal(boostMinutes(''), DEFAULT_BOOST_MINUTES);
  assert.equal(boostMinutes('45'), 45);
  assert.equal(boostMinutes(0), 0);
  assert.throws(() => boostMinutes(241), RangeError);
  assert.equal(holidayDays(7), 7);
  assert.equal(holidayDays('0'), 0);
  assert.throws(() => holidayDays(undefined), RangeError);
  assert.throws(() => holidayDays(400), RangeError);
  assert.equal(option('boost', ['daily', 'boost'], 'Mode'), 'boost');
  assert.throws(() => option('turbo', ['daily', 'boost'], 'Mode'), /daily, boost/);
  assert.equal(wholeNumber('2.6', 0, 5, 'x'), 3);
});
