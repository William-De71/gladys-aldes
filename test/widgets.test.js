// The widgets pass validateWidgetContent (what the core would keep) in every
// language, every connection state and every shape of data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { parseProducts } from '../src/aldes.js';
import {
  buildVentilationWidget,
  buildHeatPumpWidget,
  formatTemperature,
  formatTime,
  co2Color,
  filterColor,
  WIDGET_ACTIONS,
  MAX_ITEMS,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { deviceName } from '../src/device.js';
import { PRODUCTS, VMC_ID, TONE_ID } from './helpers/fixtures.js';

const TZ = 'Europe/Paris';
// 11:42 in Paris.
const NOW = Date.parse('2026-11-15T10:42:00Z');
const STATES = ['ok', 'unknown', 'unconfigured', 'refused', 'rate_limited', 'error'];
const parsed = parseProducts(PRODUCTS);
const VMC = parsed.products.find((p) => p.id === VMC_ID);
const TONE = parsed.products.find((p) => p.id === TONE_ID);
const rooms = (language = 'en') =>
  parsed.thermostats.map((model) => ({ model, name: deviceName(model, language), waiting: false }));
const ventilation = (overrides = {}) =>
  buildVentilationWidget({
    product: VMC,
    name: deviceName(VMC),
    connection: 'ok',
    lastSuccessAt: NOW - 60000,
    language: 'en',
    timezone: TZ,
    now: NOW,
    ...overrides,
  });
const heatPump = (overrides = {}) =>
  buildHeatPumpWidget({
    product: TONE,
    name: deviceName(TONE),
    thermostats: rooms(overrides.language),
    connection: 'ok',
    lastSuccessAt: NOW - 60000,
    language: 'en',
    now: NOW,
    ...overrides,
  });
const valid = (content, what) => assert.deepEqual(validateWidgetContent(content), [], what);
const types = (content) => content.components.map((c) => c.type);
const statusOf = (content) => content.components.find((c) => c.type === 'status').items;

test('every widget is valid in every language and every connection state', () => {
  for (const language of LANGUAGES) {
    for (const connection of STATES) {
      valid(ventilation({ language, connection }), `ventilation ${language} ${connection}`);
      valid(heatPump({ language, connection }), `heat_pump ${language} ${connection}`);
      valid(ventilation({ language, connection, product: null }), `empty vmc ${language}`);
      valid(heatPump({ language, connection, product: null }), `empty tone ${language}`);
    }
  }
});

test('the ventilation widget: 4 tiles, the status, 3 buttons, within the budget', () => {
  const content = ventilation();
  assert.deepEqual(types(content), [
    'value',
    'value',
    'value',
    'value',
    'status',
    'button',
    'button',
    'button',
  ]);
  const [co2, kitchen, humidity, filter] = content.components;
  assert.deepEqual([co2.value, co2.unit, co2.color], [640, 'ppm', 'success']);
  assert.equal(kitchen.value, '21.2 °C');
  assert.equal(humidity.value, 48);
  assert.deepEqual([filter.value, filter.color], [60, 'success']);
  assert.deepEqual(
    content.components.filter((c) => c.type === 'button').map((b) => b.action.key),
    [WIDGET_ACTIONS.BOOST, WIDGET_ACTIONS.DAILY, WIDGET_ACTIONS.REFRESH],
  );
  assert.deepEqual(
    statusOf(content).map((row) => row.value),
    ['Daily', 'Online', 'Connected', '1 min ago'],
  );
});

test('the ventilation widget shows a boost and its end, a running mode, a command waiting', () => {
  const boost = ventilation({
    product: { ...VMC, mode: 'boost', running: 'boost' },
    boostUntil: NOW + 30 * 60000,
  });
  const rows = statusOf(boost);
  assert.equal(rows[0].value, 'Boost');
  assert.equal(rows[1].value, '12:12');
  const schedule = ventilation({
    product: { ...VMC, mode: 'schedule', running: 'daily' },
    language: 'fr',
  });
  assert.equal(statusOf(schedule)[0].value, 'Programmation (Quotidien)');
  assert.equal(statusOf(ventilation({ waiting: true }))[0].value, 'Sending…');
  const bare = ventilation({
    product: {
      ...VMC,
      co2: null,
      filter: { life: null },
      kitchen: { temperature: null, humidity: null },
    },
  });
  assert.deepEqual(types(bare).slice(0, 2), ['status', 'button']);
});

test('the heat pump widget: tiles, rooms as a list, modes', () => {
  const content = heatPump({ language: 'fr' });
  assert.deepEqual(types(content), ['value', 'value', 'card-list', 'status', 'button']);
  const list = content.components[2];
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle]),
    [
      ['Salon', '20,4 °C → 21 °C'],
      ['Chambre', '19,2 °C → 19 °C'],
    ],
  );
  assert.deepEqual(
    statusOf(content)
      .map((row) => row.value)
      .slice(0, 2),
    ['Chauffage confort', 'Marche'],
  );
  const many = heatPump({
    thermostats: Array.from({ length: 12 }, (_, i) => ({
      model: { ...parsed.thermostats[0], id: `x${i}` },
      name: `Room ${i}`,
      waiting: i === 0,
    })),
  });
  assert.equal(many.components.find((c) => c.type === 'card-list').items.length, MAX_ITEMS);
  valid(many, 'many rooms');
  const away = heatPump({
    product: { ...TONE, holidayStart: '2026-11-14T00:00:00Z', holidayEnd: '2026-11-21T00:00:00Z' },
  });
  assert.ok(statusOf(away).some((row) => row.value.startsWith('until')));
});

test('Fahrenheit, colors and times', () => {
  assert.equal(formatTemperature(20, 'us', 'en'), '68 °F');
  assert.equal(formatTemperature(null, 'metric', 'en'), '—');
  assert.equal(co2Color(500), 'success');
  assert.equal(co2Color(900), 'warning');
  assert.equal(co2Color(1500), 'danger');
  assert.equal(filterColor(8), 'danger');
  assert.equal(filterColor(20), 'warning');
  assert.equal(formatTime(NOW, TZ), '11:42');
  const offline = ventilation({ product: { ...VMC, online: false } });
  assert.equal(statusOf(offline)[1].color, 'danger');
});

test('an empty widget tells what to do', () => {
  const empty = ventilation({ product: null, connection: 'refused', language: 'fr' });
  assert.match(empty.components[0].text, /Aldes refuse/);
  const none = heatPump({ product: null });
  assert.match(none.components[0].text, /No Aldes T.One/);
});
