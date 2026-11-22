// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, a text
// state goes in `text`, and a single invalid field rejects the whole
// discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { parseProducts } from '../src/aldes.js';
import {
  buildDevice,
  buildStates,
  discoverySignature,
  deviceName,
  WATER_HEATER_OF,
  WATER_MODE_OF,
} from '../src/device.js';
import { WATER_HEATER_MODE } from '../src/constants.js';
import { LANGUAGES } from '../src/i18n.js';
import { PRODUCTS, VMC_ID, TONE_ID, fakeGladys } from './helpers/fixtures.js';

const parsed = parseProducts(PRODUCTS);
const vmc = parsed.products.find((p) => p.id === VMC_ID);
const tone = parsed.products.find((p) => p.id === TONE_ID);
const [salon] = parsed.thermostats;
const models = [vmc, tone, ...parsed.thermostats];
const devices = (language) => models.map((model) => buildDevice(fakeGladys, model, language));
const keysOf = (model) =>
  buildDevice(fakeGladys, model).features.map((f) => f.external_id.split(':').pop());
const statesOf = (model) =>
  Object.fromEntries(
    buildStates(fakeGladys, model).map((s) => [
      s.device_feature_external_id.split(':').pop(),
      s.text ?? s.state,
    ]),
  );

// DEVICE_FEATURE_UNITS_BY_CATEGORY of the Gladys core 5.3.0.
const UNITS_OF = {
  [CATEGORIES.THERMOSTAT]: [UNITS.CELSIUS, UNITS.FAHRENHEIT],
  [CATEGORIES.TEMPERATURE_SENSOR]: [UNITS.CELSIUS, UNITS.FAHRENHEIT],
  [CATEGORIES.HUMIDITY_SENSOR]: [UNITS.PERCENT],
  [CATEGORIES.CO2_SENSOR]: [UNITS.PPM],
  [CATEGORIES.MAINTENANCE]: [UNITS.PERCENT],
  [CATEGORIES.WATER_HEATER]: [UNITS.PERCENT, UNITS.LITER],
};
const NO_UNIT = [
  `${CATEGORIES.TEXT}/${TYPES.TEXT.SELECT}`,
  `${CATEGORIES.WATER_HEATER}/${TYPES.WATER_HEATER.MODE}`,
];
const PAIRS = [
  [CATEGORIES.TEXT, TYPES.TEXT.SELECT],
  [CATEGORIES.CO2_SENSOR, TYPES.SENSOR.DECIMAL],
  [CATEGORIES.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL],
  [CATEGORIES.HUMIDITY_SENSOR, TYPES.SENSOR.DECIMAL],
  [CATEGORIES.MAINTENANCE, TYPES.MAINTENANCE.LIFE_REMAINING],
  [CATEGORIES.WATER_HEATER, TYPES.WATER_HEATER.MODE],
  [CATEGORIES.WATER_HEATER, TYPES.WATER_HEATER.REMAINING_HOT_WATER],
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.TARGET_TEMPERATURE],
];
const WRITABLE = ['mode', 'air_mode', 'hot_water_mode', 'target_temperature'];

test('devices are never polled by Gladys: the integration has its own clock', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        const key = feature.external_id.split(':').pop();
        assert.equal(feature.read_only, !WRITABLE.includes(key), feature.external_id);
        assert.equal(feature.has_feedback, WRITABLE.includes(key), feature.external_id);
        assert.ok(feature.name, feature.external_id);
        assert.doesNotMatch(feature.name, /^feature_|\{n\}/, feature.external_id);
        for (const field of ['present', 'value', 'text', 'key', 'options']) {
          assert.equal(feature[field], undefined);
        }
      }
    }
  }
});

test('every category / type pair is a known one, every unit belongs to its category', () => {
  for (const device of devices('en')) {
    for (const feature of device.features) {
      assert.ok(
        PAIRS.some(([category, type]) => feature.category === category && feature.type === type),
        `${feature.external_id}: ${feature.category} / ${feature.type}`,
      );
      if (NO_UNIT.includes(`${feature.category}/${feature.type}`)) {
        assert.equal(feature.unit, undefined, feature.external_id);
      } else {
        assert.ok(UNITS_OF[feature.category].includes(feature.unit), feature.external_id);
      }
    }
  }
});

test('the features follow what each product reports', () => {
  assert.deepEqual(keysOf(vmc), [
    'mode',
    'co2',
    'temperature_kitchen',
    'humidity_kitchen',
    'temperature_bathroom_1',
    'humidity_bathroom_1',
    'temperature_bathroom_2',
    'humidity_bathroom_2',
    'filter_life',
  ]);
  assert.deepEqual(keysOf({ ...vmc, co2: null, filter: { life: null } }).slice(0, 2), [
    'mode',
    'temperature_kitchen',
  ]);
  assert.deepEqual(keysOf(tone), ['air_mode', 'hot_water_mode', 'hot_water_level', 'temperature']);
  assert.deepEqual(keysOf({ ...tone, hasWater: false, temperature: null }), ['air_mode']);
  assert.deepEqual(keysOf(salon), ['target_temperature', 'temperature']);
  assert.deepEqual(keysOf({ ...salon, humidity: 50 }), [
    'target_temperature',
    'temperature',
    'humidity',
  ]);
});

test('external ids: the modem, the modem and the thermostat id', () => {
  assert.equal(
    buildDevice(fakeGladys, vmc).external_id,
    `ext:test-integration:ventilation:${VMC_ID}`,
  );
  assert.equal(
    buildDevice(fakeGladys, tone).external_id,
    `ext:test-integration:heat_pump:${TONE_ID}`,
  );
  assert.equal(
    buildDevice(fakeGladys, salon).external_id,
    `ext:test-integration:thermostat:${TONE_ID}:18991`,
  );
  const colon = buildDevice(fakeGladys, { ...vmc, id: 'AA:BB' });
  assert.equal(colon.external_id, 'ext:test-integration:ventilation:AA%3ABB');
});

test('the mode lists are text selects with string options, the hot water a water heater mode', () => {
  const [mode] = buildDevice(fakeGladys, vmc, 'fr').features;
  assert.deepEqual(
    mode.supported_options.map((o) => [o.value, o.label]),
    [
      ['daily', 'Quotidien'],
      ['boost', 'Boost'],
      ['guests', 'Invités'],
      ['holidays', 'Vacances'],
      ['schedule', 'Programmation'],
    ],
  );
  const [air, water] = buildDevice(fakeGladys, tone).features;
  assert.equal(air.supported_options.length, 9);
  assert.equal(air.supported_options[0].value, 'off');
  assert.deepEqual(
    water.supported_options.map((o) => o.value),
    [WATER_HEATER_MODE.MANUAL, WATER_HEATER_MODE.BOOST, WATER_HEATER_MODE.OFF],
  );
  for (const [mode, value] of Object.entries(WATER_HEATER_OF))
    assert.equal(WATER_MODE_OF[value], mode);
});

test('states: a select is a text state, numbers are rounded, unknown values are left out', () => {
  assert.deepEqual(statesOf(vmc), {
    mode: 'daily',
    co2: 640,
    temperature_kitchen: 21.2,
    humidity_kitchen: 48,
    temperature_bathroom_1: 22.5,
    humidity_bathroom_1: 61,
    temperature_bathroom_2: 19.8,
    humidity_bathroom_2: 55,
    filter_life: 60,
  });
  const [modeState] = buildStates(fakeGladys, vmc);
  assert.equal(modeState.state, undefined);
  assert.equal(modeState.text, 'daily');
  assert.deepEqual(statesOf(tone), {
    air_mode: 'heat_comfort',
    hot_water_mode: WATER_HEATER_MODE.MANUAL,
    hot_water_level: 65,
    temperature: 20.5,
  });
  assert.deepEqual(statesOf({ ...tone, airMode: null, waterMode: null }), {
    hot_water_level: 65,
    temperature: 20.5,
  });
  assert.deepEqual(statesOf(salon), { target_temperature: 21, temperature: 20.4 });
});

test('names: the name in the app with the model, a thermostat its room', () => {
  assert.equal(deviceName(vmc), 'InspirAIR Home S (Maison)');
  assert.equal(deviceName({ ...vmc, name: null }), 'Aldes InspirAIR Home S');
  assert.equal(deviceName(salon), 'Salon');
  assert.equal(deviceName({ ...salon, name: null }, 'es'), 'Termostato 18991');
  const names = buildDevice(fakeGladys, vmc, 'de').features.map((f) => f.name);
  assert.ok(names.includes('Temperatur Bad 2'));
});

test('the discovery signature changes with a name, not with a state', () => {
  const before = discoverySignature(fakeGladys, models, 'en');
  assert.equal(
    discoverySignature(fakeGladys, [{ ...vmc, co2: 900 }, ...models.slice(1)], 'en'),
    before,
  );
  assert.notEqual(
    discoverySignature(fakeGladys, [{ ...vmc, name: 'Gîte' }, ...models.slice(1)], 'en'),
    before,
  );
  assert.notEqual(discoverySignature(fakeGladys, models, 'fr'), before);
});

test('the fake Gladys accepts the discovery and the states', async () => {
  const gladys = createFakeGladys({ config: {} });
  await gladys.connect();
  await gladys.publishDiscoveredDevices(devices('fr'));
  assert.equal(gladys.fake.discoveredDevices.length, models.length);
  for (const device of gladys.fake.discoveredDevices) await gladys.fake.deviceCreated(device);
  await gladys.publishStates(models.flatMap((model) => buildStates(gladys, model)));
  assert.equal(gladys.fake.lastState(`${buildDevice(gladys, vmc).external_id}:mode`), 'daily');
});
