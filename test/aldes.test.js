// The Aldes data model: products -> ventilation units, T.One heat pumps and
// thermostats; modes, filter, holidays, setpoints.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KINDS,
  parseProducts,
  kindOf,
  ventilationMode,
  filterOf,
  apiDate,
  holidayActive,
  holidayCommand,
  HOLIDAY_CANCEL,
  setpointBounds,
  checkSetpoint,
  number,
} from '../src/aldes.js';
import { PRODUCTS, VMC_ID, TONE_ID, variant } from './helpers/fixtures.js';

const parsed = parseProducts(PRODUCTS);
const vmc = parsed.products.find((p) => p.id === VMC_ID);
const tone = parsed.products.find((p) => p.id === TONE_ID);

test('the products are split into ventilation units, heat pumps and thermostats', () => {
  assert.equal(parsed.products.length, 2);
  assert.equal(vmc.kind, KINDS.VENTILATION);
  assert.equal(tone.kind, KINDS.HEAT_PUMP);
  assert.deepEqual(parsed.ignored, ['TFLOW_HYGRA']);
  assert.deepEqual(
    parsed.thermostats.map((t) => [t.id, t.name, t.setpoint, t.room]),
    [
      [`${TONE_ID}:18991`, 'Salon', 21, 20.4],
      [`${TONE_ID}:18992`, 'Chambre', 19, 19.2],
    ],
  );
  assert.equal(parsed.thermostats[0].productId, TONE_ID);
  assert.equal(parsed.thermostats[0].humidity, null);
});

test('a ventilation unit: mode, CO2, kitchen and bathrooms in tenths of degrees, filter', () => {
  assert.equal(vmc.model, 'InspirAIR Home S');
  assert.equal(vmc.name, 'Maison');
  assert.equal(vmc.mode, 'daily');
  assert.equal(vmc.running, 'daily');
  assert.equal(vmc.co2, 640);
  assert.equal(vmc.qai, 72);
  assert.deepEqual(vmc.kitchen, { temperature: 21.2, humidity: 48 });
  assert.deepEqual(vmc.bathrooms.slice(0, 3), [
    { n: 1, temperature: 22.5, humidity: 61 },
    { n: 2, temperature: 19.8, humidity: 55 },
    // 0 means no sensor.
    { n: 3, temperature: null, humidity: null },
  ]);
  assert.deepEqual(vmc.filter, {
    has: true,
    wear: 40,
    life: 60,
    changed: '2026-06-01T10:00:00.000Z',
  });
  assert.equal(vmc.online, true);
});

test('a T.One: modes, hot water, temperature, bounds', () => {
  assert.equal(tone.model, 'T.One AquaAIR');
  assert.equal(tone.airMode, 'heat_comfort');
  assert.equal(tone.hasWater, true);
  assert.equal(tone.waterMode, 'on');
  assert.equal(tone.hotWater, 65);
  assert.equal(tone.temperature, 20.5);
  assert.equal(tone.frostProtection, false);
  assert.equal(tone.holidayStart, null);
  assert.deepEqual(tone.heating, { min: 16, max: 28 });
  assert.deepEqual(tone.cooling, { min: 20, max: 31 });
  assert.equal(tone.filter.has, false);
  assert.equal(tone.filter.life, null);
});

test('a T.One AIR has no hot water; lower-case thermostat fields are read too', () => {
  const [product] = variant((list) => {
    list[1].reference = 'TONE_AIR';
    delete list[1].indicator.current_water_mode;
    list[1].indicator.thermostats = [
      { thermostatId: 5, TemperatureSet: '20', CurrentHumidity: 45 },
    ];
  }).slice(1, 2);
  const result = parseProducts([product]);
  assert.equal(result.products[0].hasWater, false);
  assert.equal(result.products[0].waterMode, null);
  assert.equal(result.thermostats[0].id, `${TONE_ID}:5`);
  assert.equal(result.thermostats[0].setpoint, 20);
  assert.equal(result.thermostats[0].humidity, 45);
  assert.equal(result.thermostats[0].name, null);
});

test('the mode of a ventilation unit: one letter, two letters, the indicator object', () => {
  assert.deepEqual(ventilationMode({ indicators: [{ type: 'MODE', value: 'ZV' }] }), {
    mode: 'Z',
    running: 'V',
  });
  assert.deepEqual(ventilationMode({ indicator: { ConVe: 'Y' } }), { mode: 'Y', running: 'Y' });
  assert.deepEqual(ventilationMode({ indicator: { EASYHOME_CURRENT_MODE: 'X' } }), {
    mode: 'X',
    running: 'X',
  });
  assert.deepEqual(ventilationMode({ indicators: [{ type: 'MODE', value: 'Q' }] }), {
    mode: null,
    running: null,
  });
  assert.deepEqual(ventilationMode({}), { mode: null, running: null });
});

test('kinds: by reference or by the fields present', () => {
  assert.equal(kindOf({ reference: 'EASY_HOME_CONNECT' }), KINDS.VENTILATION);
  assert.equal(kindOf({ reference: 'X', indicator: { current_air_mode: 'A' } }), KINDS.HEAT_PUMP);
  assert.equal(
    kindOf({ reference: 'X', indicators: [{ type: 'MODE', value: 'V' }] }),
    KINDS.VENTILATION,
  );
  assert.equal(kindOf({ reference: 'TFLOW' }), null);
});

test('defensive parsing: odd shapes, duplicates and missing modems are skipped', () => {
  const result = parseProducts([
    null,
    'x',
    { reference: 'TONE_AIR' },
    { modem: 'N/A', reference: 'TONE_AIR' },
    { modem: 'A1', reference: 'TONE_AIR', indicator: 'odd', isConnected: 'yes' },
    { modem: 'A1', reference: 'TONE_AIR' },
  ]);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].airMode, null);
  assert.equal(result.products[0].online, null);
  assert.deepEqual(result.thermostats, []);
  assert.deepEqual(parseProducts({ not: 'a list' }).products, []);
});

test('filter, numbers and dates', () => {
  assert.deepEqual(filterOf({ hasFilter: true }), {
    has: true,
    wear: null,
    life: null,
    changed: null,
  });
  assert.equal(filterOf({ usureFiltre: 130 }).life, 0);
  assert.equal(filterOf({ usureFiltre: 'OK' }).wear, null);
  assert.equal(number('12,5'), 12.5);
  assert.equal(number(''), null);
  assert.equal(number(NaN), null);
  assert.equal(apiDate('0001-01-01 00:00:00'), null);
  assert.equal(apiDate('2026-12-01 10:00:00'), '2026-12-01T10:00:00.000Z');
  assert.equal(apiDate('2026-12-01T10:00:00+01:00'), '2026-12-01T09:00:00.000Z');
  assert.equal(apiDate('soon'), null);
});

test('holidays: the mode of a ventilation unit, the dates of a T.One', () => {
  const now = Date.parse('2026-12-03T12:00:00Z');
  assert.equal(holidayActive({ kind: KINDS.VENTILATION, mode: 'holidays' }, now), true);
  assert.equal(holidayActive({ kind: KINDS.VENTILATION, mode: 'daily' }, now), false);
  const away = {
    kind: KINDS.HEAT_PUMP,
    holidayStart: '2026-12-01T00:00:00.000Z',
    holidayEnd: '2026-12-08T00:00:00.000Z',
  };
  assert.equal(holidayActive(away, now), true);
  assert.equal(holidayActive(away, Date.parse('2026-12-09T00:00:00Z')), false);
  assert.equal(holidayActive({ kind: KINDS.HEAT_PUMP, holidayStart: null }, now), false);
});

test('the holiday command: UTC stamps, or the cancel command', () => {
  const now = Date.parse('2026-12-01T09:30:15.123Z');
  assert.equal(holidayCommand(now, 7), 'W20261201093015Z20261208093015Z');
  assert.equal(holidayCommand(now, 0), HOLIDAY_CANCEL);
  assert.equal(HOLIDAY_CANCEL, 'W00010101000000Z00010101000000Z');
});

test('setpoints: whole degrees within the bounds of the current air mode', () => {
  assert.deepEqual(setpointBounds(tone), { min: 16, max: 28 });
  assert.deepEqual(setpointBounds({ ...tone, airMode: 'cool_boost' }), { min: 20, max: 31 });
  assert.deepEqual(setpointBounds(null), { min: 16, max: 31 });
  assert.equal(checkSetpoint(21.4, tone), 21);
  assert.equal(checkSetpoint('22', tone), 22);
  assert.throws(() => checkSetpoint(29, tone), RangeError);
  assert.throws(() => checkSetpoint('warm', tone), RangeError);
});
