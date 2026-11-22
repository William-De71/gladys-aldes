// -----------------------------------------------------------------------------
// Made-up AldesConnect answers, shaped like the ones the community projects
// read (see NOTICE): an InspirAIR ventilation unit with a CO2 sensor, a
// kitchen and two bathrooms, a T.One AquaAIR with two room thermostats, and a
// product the integration does not handle. Never a real account.
// -----------------------------------------------------------------------------

import { createAldesApi } from '../../src/aldes-api.js';

// 10:10 in Paris (UTC+1).
const T0 = Date.parse('2026-11-15T09:10:00Z');
const VMC_ID = 'AABBCC000001';
const TONE_ID = 'AABBCC000002';

const PRODUCTS = [
  {
    modem: VMC_ID,
    reference: 'INSPIRAIR_HOME_S',
    serial_number: 'SN-VMC-1',
    type: 'VMC',
    name: 'Maison',
    isConnected: true,
    lastUpdatedDate: '2026-11-15 09:05:00',
    hasFilter: true,
    usureFiltre: '40',
    dateLastFilterUpdate: '2026-06-01 10:00:00',
    indicators: [
      { type: 'MODE', value: 'V', date: '2026-11-15 09:05:00' },
      { type: 'SELF_CONTROLLED', value: false },
      { type: 'QAI_INDEX', value: 72 },
    ],
    indicator: {
      ConVe: 'V',
      CO2: 640,
      TmpCu: 212,
      HrCu: 48,
      TmpBa1: 225,
      HrBa1: 61,
      TmpBa2: 198,
      HrBa2: 55,
      TmpBa3: 0,
      HrBa3: 0,
      Qai: { actualValue: 72 },
    },
  },
  {
    modem: TONE_ID,
    reference: 'TONE_AQUA_AIR',
    serial_number: 'SN-TONE-1',
    type: 'PAC',
    name: 'Maison',
    isConnected: true,
    lastUpdatedDate: '2026-11-15 09:06:00',
    hasFilter: false,
    indicator: {
      current_air_mode: 'B',
      current_water_mode: 'M',
      qte_eau_chaude: 65,
      tmp_principal: 20.5,
      hors_gel: false,
      date_debut_vac: '0001-01-01 00:00:00',
      date_fin_vac: '0001-01-01 00:00:00',
      cmist: 16,
      cmast: 28,
      fmist: 20,
      fmast: 31,
      settings: { people: 4 },
      thermostats: [
        {
          ThermostatId: 18991,
          Name: 'Salon',
          TemperatureSet: 21,
          CurrentTemperature: 20.4,
        },
        {
          ThermostatId: 18992,
          Name: 'Chambre',
          TemperatureSet: 19,
          CurrentTemperature: 19.2,
        },
      ],
    },
  },
  { modem: 'AABBCC000003', reference: 'TFLOW_HYGRA', name: 'Ballon', isConnected: true },
];

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * @description A deep copy of the products, changed by a function.
 * @param {Function} [change] - `(copy) => void`.
 * @returns {object[]} The copy.
 */
function variant(change = () => {}) {
  const list = copy(PRODUCTS);
  change(list);
  return list;
}

/**
 * @description A fake Aldes API (no network): the answers it serves, the
 * writes it receives, an error to throw once.
 * @param {object} [options] - Answers to start from.
 * @returns {object} The fake API.
 */
function fakeApi({ products = PRODUCTS } = {}) {
  const fake = {
    products: copy(products),
    calls: [],
    writes: [],
    credentials: null,
    failNext: null,
    // Method name -> error thrown on every call.
    failOn: {},
    setCredentials(email, secret) {
      fake.credentials = email && secret ? { email, secret } : null;
    },
    hasCredentials: () => fake.credentials !== null,
    requestsLastHour: () => fake.calls.length,
    enter(name) {
      fake.calls.push(name);
      if (fake.failOn[name]) throw fake.failOn[name];
      if (fake.failNext) {
        const error = fake.failNext;
        fake.failNext = null;
        throw error;
      }
    },
    async getProducts() {
      fake.enter('getProducts');
      return copy(fake.products);
    },
    async changeMode(modem, mode) {
      fake.enter('changeMode');
      fake.writes.push(['changeMode', modem, mode]);
    },
    async setThermostat(modem, thermostat, setpoint) {
      fake.enter('setThermostat');
      fake.writes.push(['setThermostat', modem, thermostat, setpoint]);
    },
  };
  return fake;
}

/**
 * @description A fake `fetch` answering from a handler.
 * @param {Function} handler - `(url, init, n) => { status, body?, text?, headers? }`.
 * @returns {Function & { requests: object[] }} The fetch.
 */
function fakeFetch(handler) {
  const requests = [];
  const impl = async (url, init = {}) => {
    requests.push({ url: String(url), ...init });
    const answer = await handler(String(url), init, requests.length);
    const text = answer.text ?? (answer.body === undefined ? '' : JSON.stringify(answer.body));
    const headers = new Headers();
    for (const [key, value] of Object.entries(answer.headers ?? {})) headers.append(key, value);
    return { status: answer.status ?? 200, headers, text: async () => text };
  };
  impl.requests = requests;
  return impl;
}

/**
 * @description A real API client on a fake fetch and a fake clock.
 * @param {Function} handler - The fetch handler.
 * @returns {{ api: object, fetch: Function, clock: object }} The client.
 */
function apiWithFetch(handler) {
  const clock = { now: 1_800_000_000_000, slept: [] };
  const fetchImpl = fakeFetch(handler);
  const api = createAldesApi({
    fetchImpl,
    now: () => clock.now,
    sleep: async (ms) => {
      clock.slept.push(ms);
      clock.now += ms;
    },
  });
  return { api, fetch: fetchImpl, clock };
}

const TOKENS = (n = 1, refresh = true) => ({
  status: 200,
  body: {
    access_token: `access-${n}`,
    token_type: 'Bearer',
    expires_in: 3600,
    ...(refresh ? { refresh_token: `refresh-${n}` } : {}),
  },
});
// The answer of the real service to a wrong e-mail or password (2026-11-22).
const BAD_LOGIN = {
  status: 400,
  body: {
    error: 'invalid_grant',
    error_description: 'The user name or password is incorrect.',
    error_uri: 'https://documentation.openiddict.com/errors/ID2024',
  },
};

// Ids of the fake Gladys (selector "test-integration").
const fakeGladys = {
  externalIds: (type, id) => {
    const device = `ext:test-integration:${type}:${id}`;
    return { device, feature: (key) => `${device}:${key}` };
  },
};

export {
  T0,
  VMC_ID,
  TONE_ID,
  PRODUCTS,
  copy,
  variant,
  fakeApi,
  fakeFetch,
  apiWithFetch,
  TOKENS,
  BAD_LOGIN,
  fakeGladys,
};
