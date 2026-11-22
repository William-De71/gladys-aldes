// The whole integration against the fake Gladys of the SDK and a fake Aldes
// API: readings, discovery, states, commands, boost timer, scene triggers and
// actions, widgets, errors, persistence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, CONFIRM_DELAY_MS, PENDING_MS, REFUSED_RETRY_MS } from '../src/app.js';
import { CredentialsError, RateLimitError, NetworkError } from '../src/aldes-api.js';
import { WATER_HEATER_MODE } from '../src/constants.js';
import { HOLIDAY_CANCEL } from '../src/aldes.js';
import { T0, VMC_ID, TONE_ID, fakeApi } from './helpers/fixtures.js';

const CONFIG = { email: 'me@example.com', password: 'secret' };
const MINUTE = 60 * 1000;
const EXT = {
  vmc: `ext:test-integration:ventilation:${VMC_ID}`,
  tone: `ext:test-integration:heat_pump:${TONE_ID}`,
  salon: `ext:test-integration:thermostat:${TONE_ID}:18991`,
  chambre: `ext:test-integration:thermostat:${TONE_ID}:18992`,
};
const out = (answer) =>
  answer.data?.outputs ?? answer.data?.content ?? answer.data?.message ?? answer.data ?? answer;

/**
 * @description Expect a refused command: the ack fails, with this message.
 * @param {Promise<object>} pending - The ack.
 * @param {RegExp} pattern - The error.
 */
async function refused(pending, pattern) {
  const answer = await pending;
  assert.equal(answer.success, false);
  assert.match(String(answer.error?.message ?? answer.error ?? JSON.stringify(answer)), pattern);
}
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A connected integration on a fake clock and fake timers.
 * @param {object} [options] - Options.
 * @returns {Promise<object>} The handles.
 */
async function start({
  config = CONFIG,
  api = fakeApi(),
  statePath = null,
  created = true,
  devices = [],
} = {}) {
  const clock = { now: T0 };
  const timers = [];
  const gladys = createFakeGladys({ config: { ...config }, devices });
  const app = createApp(gladys, {
    api,
    now: () => clock.now,
    statePath,
    tickMs: 0,
    timezone: 'Europe/Paris',
    setTimer: (fn, ms) => {
      const handle = { fn, at: clock.now + ms, done: false };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      handle.done = true;
    },
    logger: silent,
  });
  await gladys.connect();
  if (created && devices.length === 0) {
    for (const device of gladys.fake.discoveredDevices) await gladys.fake.deviceCreated(device);
  }
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const advance = async (ms) => {
    clock.now += ms;
    for (const handle of timers) {
      if (!handle.done && handle.at <= clock.now) {
        handle.done = true;
        handle.fn();
      }
    }
    await settle();
    await app.tick();
  };
  const device = (name) => gladys.fake.devices.find((d) => d.external_id === EXT[name]);
  const featureOf = (name, key) =>
    device(name).features.find((f) => f.external_id === `${EXT[name]}:${key}`);
  const state = (name, key) => gladys.fake.lastState(`${EXT[name]}:${key}`);
  const set = (name, key, value) => gladys.fake.setValue(device(name), featureOf(name, key), value);
  const raw = (id) => api.products.find((p) => p.modem === id);
  return { gladys, app, api, clock, timers, advance, device, state, set, settle, raw };
}

test('without credentials: nothing is read, the status says what to do', async () => {
  const { gladys, api } = await start({ config: {} });
  assert.deepEqual(api.calls, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /AldesConnect/);
  assert.equal(gladys.fake.discoveredDevices.length, 0);
});

test('one reading offers every product and thermostat, then publishes their states', async () => {
  const { gladys, api, state } = await start();
  assert.deepEqual(api.calls, ['getProducts']);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.external_id).sort(),
    Object.values(EXT).sort(),
  );
  assert.equal(state('vmc', 'mode'), 'daily');
  assert.equal(state('vmc', 'co2'), 640);
  assert.equal(state('vmc', 'filter_life'), 60);
  assert.equal(state('tone', 'air_mode'), 'heat_comfort');
  assert.equal(state('tone', 'hot_water_mode'), WATER_HEATER_MODE.MANUAL);
  assert.equal(state('salon', 'target_temperature'), 21);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /2 product\(s\), 2 room thermostat/);
});

test('the products are read again at the chosen interval, not before', async () => {
  const { api, advance } = await start({ config: { ...CONFIG, refresh_minutes: '5' } });
  await advance(4 * MINUTE);
  assert.equal(api.calls.length, 1);
  await advance(MINUTE);
  assert.equal(api.calls.length, 2);
});

test('only changed states are published, and new devices get theirs', async () => {
  const { gladys, api, advance, raw, state } = await start({ created: false });
  assert.equal(gladys.fake.states.length, 0);
  await gladys.fake.deviceCreated(
    gladys.fake.discoveredDevices.find((d) => d.external_id === EXT.vmc),
  );
  const count = gladys.fake.states.length;
  assert.ok(count > 0);
  raw(VMC_ID).indicator.CO2 = 910;
  await advance(2 * MINUTE);
  assert.equal(state('vmc', 'co2'), 910);
  assert.equal(gladys.fake.states.length, count + 1);
  assert.equal(api.calls.length, 2);
});

test('a ventilation mode is shown at once, sent without waiting, then confirmed', async () => {
  const { api, set, state, settle, advance, raw } = await start();
  await set('vmc', 'mode', 'boost');
  assert.equal(state('vmc', 'mode'), 'boost');
  await settle();
  assert.deepEqual(api.writes, [['changeMode', VMC_ID, 'Y']]);
  // The cloud still says daily: the command wins meanwhile.
  await advance(CONFIRM_DELAY_MS);
  assert.equal(api.calls.filter((c) => c === 'getProducts').length, 2);
  assert.equal(state('vmc', 'mode'), 'boost');
  // Never confirmed: after 3 minutes the cloud is right again.
  await advance(PENDING_MS);
  assert.equal(state('vmc', 'mode'), 'daily');
  // Confirmed by the cloud.
  await set('vmc', 'mode', 'guests');
  await settle();
  raw(VMC_ID).indicators[0].value = 'X';
  await advance(CONFIRM_DELAY_MS);
  assert.equal(state('vmc', 'mode'), 'guests');
});

test('"Holidays" from the mode list sends the holiday command for a year', async () => {
  const { api, set, settle } = await start();
  await set('vmc', 'mode', 'holidays');
  await settle();
  const [, , parameter] = api.writes[0];
  assert.match(parameter, /^W20261115091000Z20271115091000Z$/);
});

test('T.One: air mode, hot water and setpoints', async () => {
  const { api, set, settle, state } = await start();
  await set('tone', 'air_mode', 'cool_boost');
  await set('tone', 'hot_water_mode', WATER_HEATER_MODE.BOOST);
  await settle();
  assert.equal(state('tone', 'air_mode'), 'cool_boost');
  assert.equal(state('tone', 'hot_water_mode'), WATER_HEATER_MODE.BOOST);
  await set('salon', 'target_temperature', 23.4);
  await settle();
  assert.equal(state('salon', 'target_temperature'), 23);
  assert.deepEqual(api.writes, [
    ['changeMode', TONE_ID, 'G'],
    ['changeMode', TONE_ID, 'N'],
    ['setThermostat', TONE_ID, { id: 18991, name: 'Salon' }, 23],
  ]);
});

test('a setpoint out of the bounds of the air mode, a read-only feature, an unknown mode are refused', async () => {
  const { set, api } = await start();
  await refused(set('salon', 'target_temperature', 29), /between 16 and 28/);
  await refused(set('salon', 'temperature', 20), /read-only/);
  await refused(set('vmc', 'mode', 'turbo'), /ventilation mode/);
  await refused(set('tone', 'hot_water_mode', WATER_HEATER_MODE.ECO), /not available/);
  assert.deepEqual(api.writes, []);
});

test('an offline product refuses commands', async () => {
  const api = fakeApi();
  api.products[0].isConnected = false;
  const { set, gladys } = await start({ api });
  await refused(set('vmc', 'mode', 'boost'), /offline/);
  assert.deepEqual(api.writes, []);
  const toast = await gladys.fake.widgetAction('ventilation', 'boost', {}, { settings: {} });
  assert.match(out(toast).fr, /hors ligne/);
});

test('a failed command is dropped: the next reading shows the truth', async () => {
  const { api, set, settle, state } = await start();
  api.failOn.changeMode = new Error('HTTP 500');
  await set('vmc', 'mode', 'boost');
  await settle();
  await settle();
  assert.equal(state('vmc', 'mode'), 'daily');
});

test('a timed boost goes back to the previous mode by itself', async () => {
  const { gladys, api, advance, raw, state, app } = await start();
  const result = out(
    await gladys.fake.sceneAction('boost_ventilation', { device: EXT.vmc, minutes: 20 }),
  );
  assert.deepEqual(result, { count: 1, failed: 0, until: '10:30' });
  assert.deepEqual(api.writes, [['changeMode', VMC_ID, 'Y']]);
  raw(VMC_ID).indicators[0].value = 'Y';
  await advance(CONFIRM_DELAY_MS);
  assert.equal(state('vmc', 'mode'), 'boost');
  assert.ok(app.boosts.has(VMC_ID));
  await advance(20 * MINUTE);
  assert.deepEqual(api.writes.at(-1), ['changeMode', VMC_ID, 'V']);
  assert.equal(app.boosts.has(VMC_ID), false);
});

test('a boost ended in the app or replaced by another mode forgets its timer', async () => {
  const { gladys, api, advance, raw, app, set, settle } = await start();
  await gladys.fake.sceneAction('boost_ventilation', { minutes: 30 });
  await set('vmc', 'mode', 'guests');
  await settle();
  assert.equal(app.boosts.has(VMC_ID), false);
  await gladys.fake.sceneAction('boost_ventilation', { minutes: 30 });
  raw(VMC_ID).indicators[0].value = 'Y';
  await advance(PENDING_MS);
  raw(VMC_ID).indicators[0].value = 'Z';
  await advance(2 * MINUTE);
  assert.equal(app.boosts.has(VMC_ID), false);
  const writes = api.writes.length;
  await advance(30 * MINUTE);
  assert.equal(api.writes.length, writes);
});

test('scene actions: ventilation mode, air mode, hot water, holiday', async () => {
  const { gladys, api } = await start();
  assert.deepEqual(
    out(await gladys.fake.sceneAction('set_ventilation_mode', { mode: 'schedule' })),
    { count: 1, failed: 0 },
  );
  await gladys.fake.sceneAction('set_air_mode', { device: EXT.tone, mode: 'off' });
  await gladys.fake.sceneAction('set_hot_water', { mode: 'off' });
  const holiday = out(await gladys.fake.sceneAction('set_holiday', { days: 7 }));
  assert.deepEqual(holiday, { count: 2, failed: 0, until: '2026-11-22' });
  await gladys.fake.sceneAction('set_holiday', { device: EXT.tone, days: 0 });
  assert.deepEqual(api.writes, [
    ['changeMode', VMC_ID, 'Z'],
    ['changeMode', TONE_ID, 'A'],
    ['changeMode', TONE_ID, 'L'],
    ['changeMode', VMC_ID, 'W20261115091000Z20261122091000Z'],
    ['changeMode', TONE_ID, 'W20261115091000Z20261122091000Z'],
    ['changeMode', TONE_ID, HOLIDAY_CANCEL],
  ]);
  await refused(
    gladys.fake.sceneAction('set_air_mode', { device: EXT.vmc, mode: 'off' }),
    /choose it again/,
  );
  await refused(
    gladys.fake.sceneAction('set_ventilation_mode', { mode: 'holidays' }),
    /ventilation mode/,
  );
});

test('read_now gives the values of a product', async () => {
  const { gladys, api, clock } = await start();
  clock.now += MINUTE;
  const vmc = out(await gladys.fake.sceneAction('read_now', {}));
  assert.equal(api.calls.filter((c) => c === 'getProducts').length, 2);
  assert.deepEqual(vmc, {
    mode: 'daily',
    mode_label: 'Quotidien',
    co2: 640,
    temperature: 21.2,
    humidity: 48,
    hot_water: -1,
    filter_life: 60,
    online: true,
  });
  const tone = out(await gladys.fake.sceneAction('read_now', { device: EXT.tone }));
  assert.equal(tone.mode, 'heat_comfort');
  assert.equal(tone.temperature, 20.5);
  assert.equal(tone.hot_water, 65);
  assert.equal(tone.co2, -1);
  // Within 30 seconds: no new reading.
  assert.equal(api.calls.filter((c) => c === 'getProducts').length, 2);
});

test('triggers: a mode changed in the app fires, a commanded one does not', async () => {
  const { gladys, advance, raw, set, settle } = await start();
  raw(VMC_ID).indicators[0].value = 'X';
  await advance(2 * MINUTE);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => [e.key, e.data.mode, e.data.previous_mode]),
    [['mode_changed', 'guests', 'daily']],
  );
  await set('vmc', 'mode', 'boost');
  await settle();
  raw(VMC_ID).indicators[0].value = 'Y';
  await advance(CONFIRM_DELAY_MS);
  assert.equal(gladys.fake.sceneEvents.length, 1);
});

test('triggers: offline, filter due, holiday of a T.One', async () => {
  const { gladys, advance, raw } = await start();
  raw(VMC_ID).isConnected = false;
  raw(VMC_ID).usureFiltre = '92';
  raw(TONE_ID).indicator.date_debut_vac = '2026-11-15 00:00:00';
  raw(TONE_ID).indicator.date_fin_vac = '2026-11-20 00:00:00';
  await advance(2 * MINUTE);
  assert.deepEqual(gladys.fake.sceneEvents.map((e) => e.key).sort(), [
    'connection_changed',
    'filter_due',
    'holiday_changed',
  ]);
  const holiday = gladys.fake.sceneEvents.find((e) => e.key === 'holiday_changed');
  assert.equal(holiday.data.end, '2026-11-20');
});

test('no trigger for a device the user did not add', async () => {
  const { gladys, advance, raw } = await start({ created: false });
  raw(VMC_ID).indicators[0].value = 'X';
  await advance(2 * MINUTE);
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('refused credentials pause the readings for 30 minutes, until they change', async () => {
  const api = fakeApi();
  api.failOn.getProducts = new CredentialsError('BAD_CREDENTIALS', 400);
  const { gladys, advance } = await start({ api });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused/);
  await advance(10 * MINUTE);
  assert.equal(api.calls.length, 1);
  await advance(REFUSED_RETRY_MS);
  assert.equal(api.calls.length, 2);
  delete api.failOn.getProducts;
  await gladys.fake.configUpdated({ ...CONFIG, password: 'new' });
  assert.equal(api.calls.length, 3);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a 429 slows the readings down, a network failure is reported', async () => {
  const api = fakeApi();
  const { gladys, advance } = await start({ api });
  api.failNext = new RateLimitError(60000);
  await advance(2 * MINUTE);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
  await advance(2 * MINUTE);
  assert.equal(api.calls.length, 2);
  await advance(3 * MINUTE);
  assert.equal(api.calls.length, 3);
  api.failNext = new NetworkError('ENOTFOUND');
  await advance(2 * MINUTE);
  assert.match(gladys.fake.connectionStatus.message.en, /cannot be reached/);
});

test('the test button lists the devices, and the products not handled', async () => {
  const { gladys } = await start();
  const answer = out(await gladys.fake.action('test_connection'));
  const text = answer.fr;
  assert.match(text, /4 appareil\(s\)/);
  assert.match(text, /Salon/);
  assert.match(text, /Non gérés : TFLOW_HYGRA/);
});

test('widgets: valid content from the last reading, buttons', async () => {
  const { gladys, api } = await start();
  for (const key of ['ventilation', 'heat_pump']) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const content = out(await gladys.fake.widgetGet(key, { language, settings: {} }));
      assert.deepEqual(validateWidgetContent(content), [], `${key} ${language}`);
    }
  }
  const toast = out(await gladys.fake.widgetAction('ventilation', 'boost', {}, { settings: {} }));
  assert.match(JSON.stringify(toast), /10:40/);
  assert.deepEqual(api.writes.at(-1), ['changeMode', VMC_ID, 'Y']);
  await gladys.fake.widgetAction('ventilation', 'daily', {}, { settings: {} });
  assert.deepEqual(api.writes.at(-1), ['changeMode', VMC_ID, 'V']);
  const refreshed = out(
    await gladys.fake.widgetAction('heat_pump', 'refresh', {}, { settings: {} }),
  );
  assert.match(JSON.stringify(refreshed), /2 product/);
});

test('the snapshots survive a restart in /data, without any secret', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gladys-aldes-'));
  const statePath = join(dir, 'state.json');
  const first = await start({ statePath });
  first.app.stop();
  assert.equal(statSync(statePath).mode & 0o777, 0o600);
  const content = readFileSync(statePath, 'utf8');
  assert.doesNotMatch(content, /secret|me@example|access/);
  // The mode changed while stopped: it fires at the first reading.
  const api = fakeApi();
  api.products[0].indicators[0].value = 'Y';
  const second = await start({ statePath, api, devices: first.gladys.fake.devices });
  assert.deepEqual(
    second.gladys.fake.sceneEvents.map((e) => e.key),
    ['mode_changed'],
  );
});
