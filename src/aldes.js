// -----------------------------------------------------------------------------
// The Aldes data model: the answer of `GET /users/me/products` -> ventilation
// units, T.One heat pumps and their room thermostats.
//
// Two shapes coexist in a product (community projects, see NOTICE):
//   - `indicators`: a list of `{ type, value }`, where `MODE` is the mode of a
//     ventilation unit (one letter, or two: the selected mode then the one
//     running, e.g. `ZV` = clock program, daily speed now);
//   - `indicator`: an object. A ventilation unit gives `ConVe` (mode), `CO2`
//     (ppm, 0 without a CO2 sensor), `TmpCu` / `TmpBa1…5` (tenths of °C,
//     kitchen and bathrooms) and `HrCu` / `HrBa1…5` (% humidity). A T.One
//     gives `current_air_mode` (A…I), `current_water_mode` (L, M, N),
//     `qte_eau_chaude` (% of hot water), `tmp_principal` (°C), `hors_gel`,
//     `date_debut_vac` / `date_fin_vac`, the setpoint bounds `cmist` /
//     `cmast` (heating) and `fmist` / `fmast` (cooling), and `thermostats`
//     (`ThermostatId`, `Name`, `TemperatureSet`, `CurrentTemperature`).
//
// Every field is read defensively: a missing field is `null`, a wrong shape
// is skipped. Nothing here makes a request.
// -----------------------------------------------------------------------------

const KINDS = { VENTILATION: 'ventilation', HEAT_PUMP: 'heat_pump', THERMOSTAT: 'thermostat' };

// Modes of a ventilation unit (AldesConnect app), letter -> stable key.
const VENTILATION_MODES = {
  V: 'daily',
  Y: 'boost',
  X: 'guests',
  W: 'holidays',
  Z: 'schedule',
};
const VENTILATION_MODE_LETTER = Object.fromEntries(
  Object.entries(VENTILATION_MODES).map(([letter, key]) => [key, letter]),
);

// Air modes of a T.One: off, heating (comfort, eco, programs A and B),
// cooling (comfort, boost, programs C and D).
const AIR_MODES = {
  A: 'off',
  B: 'heat_comfort',
  C: 'heat_eco',
  D: 'heat_prog_a',
  E: 'heat_prog_b',
  F: 'cool_comfort',
  G: 'cool_boost',
  H: 'cool_prog_c',
  I: 'cool_prog_d',
};
const AIR_MODE_LETTER = Object.fromEntries(
  Object.entries(AIR_MODES).map(([letter, key]) => [key, letter]),
);

// Hot water modes of a T.One AquaAIR.
const WATER_MODES = { L: 'off', M: 'on', N: 'boost' };
const WATER_MODE_LETTER = Object.fromEntries(
  Object.entries(WATER_MODES).map(([letter, key]) => [key, letter]),
);

// The holiday command: `W<start>Z<end>Z`, UTC `YYYYMMDDHHmmss`; this one
// cancels a holiday (the app sends it).
const HOLIDAY_CANCEL = 'W00010101000000Z00010101000000Z';
// The setpoint bounds of a room thermostat when Aldes gives none.
const SETPOINT_MIN = 16;
const SETPOINT_MAX = 31;
const BATHROOMS = [1, 2, 3, 4, 5];
const NAMES = {
  TONE_AIR: 'T.One AIR',
  TONE_AQUA_AIR: 'T.One AquaAIR',
  INSPIRAIR_HOME_S: 'InspirAIR Home S',
  INSPIRAIR_HOME: 'InspirAIR Home',
  EASY_HOME_CONNECT: 'EasyHOME PureAIR Compact Connect',
  EASY_HOME_PREMIUM: 'EasyHOME PureAIR Compact Premium',
  DEE_FLY_CUBE: 'Dee Fly Cube',
};

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 60) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * @description A finite number, or null (numbers sent as strings are read too).
 * @param {unknown} value - The raw value.
 * @returns {number|null} The number.
 */
function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * @description A measure that means "no sensor" when it is 0.
 * @param {unknown} value - The raw value.
 * @param {number} [divider] - 10 for tenths.
 * @returns {number|null} The value.
 */
function measured(value, divider = 1) {
  const n = number(value);
  return n === null || n === 0 ? null : n / divider;
}

/**
 * @description A date of the API ("2026-12-01 10:00:00", ISO), year 1 = none.
 * @param {unknown} value - The raw value.
 * @returns {string|null} ISO UTC, or null.
 */
function apiDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim().replace(' ', 'T');
  if (/^0{3}1-/.test(raw) || /^0{4}/.test(raw)) return null;
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * @description The value of an indicator of the `indicators` list.
 * @param {object} product - The raw product.
 * @param {string} type - MODE, QAI_INDEX…
 * @returns {unknown} The value (undefined when absent).
 */
function indicatorValue(product, type) {
  const list = Array.isArray(product.indicators) ? product.indicators : [];
  return list.find((item) => isObject(item) && item.type === type)?.value;
}

/**
 * @description The kind of a product.
 * @param {object} product - The raw product.
 * @returns {string|null} ventilation, heat_pump, or null (not handled).
 */
function kindOf(product) {
  const reference = String(product.reference ?? '').toUpperCase();
  const indicator = isObject(product.indicator) ? product.indicator : {};
  if (
    reference.startsWith('TONE') ||
    typeof indicator.current_air_mode === 'string' ||
    Array.isArray(indicator.thermostats)
  ) {
    return KINDS.HEAT_PUMP;
  }
  if (
    indicatorValue(product, 'MODE') !== undefined ||
    typeof indicator.ConVe === 'string' ||
    typeof indicator.EASYHOME_CURRENT_MODE === 'string' ||
    /INSPIRAIR|EASY_?HOME|DEE_?FLY/.test(reference)
  ) {
    return KINDS.VENTILATION;
  }
  return null;
}

/**
 * @description The mode letters of a ventilation unit.
 * @param {object} product - The raw product.
 * @returns {{ mode: string|null, running: string|null }} The selected mode and
 *   the one running (the same letter for a one-letter mode).
 */
function ventilationMode(product) {
  const indicator = isObject(product.indicator) ? product.indicator : {};
  const candidates = [
    indicatorValue(product, 'MODE'),
    indicator.ConVe,
    indicator.EASYHOME_CURRENT_MODE,
    indicator.current_mode,
  ];
  const raw = candidates.find((value) => typeof value === 'string' && /^[A-Z]{1,2}/.test(value));
  if (!raw) return { mode: null, running: null };
  const mode = VENTILATION_MODES[raw[0]] ? raw[0] : null;
  const second = raw[1] && VENTILATION_MODES[raw[1]] ? raw[1] : null;
  return { mode, running: second ?? mode };
}

/**
 * @description The filter of a product: the wear Aldes gives, as a percentage.
 * @param {object} product - The raw product.
 * @returns {{ has: boolean, wear: number|null, life: number|null, changed: string|null }} The filter.
 */
function filterOf(product) {
  const wear = number(product.usureFiltre);
  const has = product.hasFilter === true || wear !== null;
  const bounded = wear === null ? null : Math.max(0, Math.min(100, wear));
  return {
    has,
    wear: bounded,
    life: bounded === null ? null : Math.round(100 - bounded),
    changed: apiDate(product.dateLastFilterUpdate),
  };
}

/**
 * @description The display name of a product: its name in the app, else its model.
 * @param {object} product - The raw product.
 * @returns {string} The model name.
 */
function modelName(product) {
  const reference = String(product.reference ?? '').toUpperCase();
  return NAMES[reference] ?? text(product.reference, 40) ?? 'Aldes';
}

/**
 * @description Parse a ventilation unit.
 * @param {object} product - The raw product.
 * @param {string} id - Its modem.
 * @returns {object} The model.
 */
function parseVentilation(product, id) {
  const indicator = isObject(product.indicator) ? product.indicator : {};
  const { mode, running } = ventilationMode(product);
  const qai = isObject(indicator.Qai)
    ? number(indicator.Qai.actualValue)
    : number(indicatorValue(product, 'QAI_INDEX'));
  return {
    kind: KINDS.VENTILATION,
    id,
    mode: mode ? VENTILATION_MODES[mode] : null,
    running: running ? VENTILATION_MODES[running] : null,
    selfControlled: indicatorValue(product, 'SELF_CONTROLLED') === true,
    co2: measured(indicator.CO2 ?? indicator.Co2_vmc),
    qai,
    kitchen: { temperature: measured(indicator.TmpCu, 10), humidity: measured(indicator.HrCu) },
    bathrooms: BATHROOMS.map((n) => ({
      n,
      temperature: measured(indicator[`TmpBa${n}`], 10),
      humidity: measured(indicator[`HrBa${n}`]),
    })),
  };
}

/**
 * @description Parse a T.One heat pump and its thermostats.
 * @param {object} product - The raw product.
 * @param {string} id - Its modem.
 * @returns {{ heatPump: object, thermostats: object[] }} The models.
 */
function parseHeatPump(product, id) {
  const indicator = isObject(product.indicator) ? product.indicator : {};
  const reference = String(product.reference ?? '').toUpperCase();
  const air = typeof indicator.current_air_mode === 'string' ? indicator.current_air_mode[0] : '';
  const water =
    typeof indicator.current_water_mode === 'string' ? indicator.current_water_mode[0] : '';
  const bounds = (low, high) => {
    const min = number(low);
    const max = number(high);
    return min !== null && max !== null && min < max ? { min, max } : null;
  };
  const heatPump = {
    kind: KINDS.HEAT_PUMP,
    id,
    airMode: AIR_MODES[air] ?? null,
    hasWater: reference === 'TONE_AQUA_AIR' || Boolean(WATER_MODES[water]),
    waterMode: WATER_MODES[water] ?? null,
    hotWater: number(indicator.qte_eau_chaude),
    temperature: number(indicator.tmp_principal),
    frostProtection: typeof indicator.hors_gel === 'boolean' ? indicator.hors_gel : null,
    holidayStart: apiDate(indicator.date_debut_vac),
    holidayEnd: apiDate(indicator.date_fin_vac),
    heating: bounds(indicator.cmist, indicator.cmast),
    cooling: bounds(indicator.fmist, indicator.fmast),
    people: number(indicator.settings?.people),
  };
  const thermostats = (Array.isArray(indicator.thermostats) ? indicator.thermostats : [])
    .filter(isObject)
    .flatMap((raw) => {
      const thermostatId = raw.ThermostatId ?? raw.thermostatId;
      if (thermostatId === undefined || thermostatId === null || thermostatId === '') return [];
      return [
        {
          kind: KINDS.THERMOSTAT,
          id: `${id}:${thermostatId}`,
          productId: id,
          thermostatId,
          name: text(raw.Name ?? raw.name, 60),
          setpoint: number(raw.TemperatureSet ?? raw.temperatureSet),
          room: number(raw.CurrentTemperature ?? raw.currentTemperature),
          humidity: measured(raw.CurrentHumidity ?? raw.currentHumidity),
        },
      ];
    });
  return { heatPump, thermostats };
}

/**
 * @description Parse the products of the account.
 * @param {unknown} answer - The answer of `GET /users/me/products`.
 * @returns {{ products: object[], thermostats: object[], ignored: string[] }}
 *   The ventilation units and heat pumps, the room thermostats, and the
 *   references of the products not handled.
 */
function parseProducts(answer) {
  const products = [];
  const thermostats = [];
  const ignored = [];
  const seen = new Set();
  for (const raw of Array.isArray(answer) ? answer : []) {
    if (!isObject(raw)) continue;
    const id = text(raw.modem, 40);
    if (!id || id === 'N/A' || seen.has(id)) continue;
    seen.add(id);
    const kind = kindOf(raw);
    if (!kind) {
      ignored.push(text(raw.reference, 40) ?? 'unknown');
      continue;
    }
    const common = {
      reference: text(raw.reference, 40),
      model: modelName(raw),
      name: text(raw.name, 60),
      serial: text(raw.serial_number, 40),
      online: typeof raw.isConnected === 'boolean' ? raw.isConnected : null,
      updatedAt: apiDate(raw.lastUpdatedDate),
      filter: filterOf(raw),
    };
    if (kind === KINDS.HEAT_PUMP) {
      const parsed = parseHeatPump(raw, id);
      products.push({ ...common, ...parsed.heatPump });
      thermostats.push(...parsed.thermostats.map((item) => ({ ...item, product: common.name })));
    } else {
      products.push({ ...common, ...parseVentilation(raw, id) });
    }
  }
  return { products, thermostats, ignored };
}

/**
 * @description Whether a holiday is running.
 * @param {object} product - A parsed product.
 * @param {number} now - Now (ms).
 * @returns {boolean} A holiday is running.
 */
function holidayActive(product, now) {
  if (product.kind === KINDS.VENTILATION) return product.mode === 'holidays';
  const start = Date.parse(product.holidayStart ?? '');
  const end = Date.parse(product.holidayEnd ?? '');
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return start <= now && now < end;
}

/**
 * @description A UTC time as the holiday command wants it: `YYYYMMDDHHmmss`.
 * @param {number} ms - The instant.
 * @returns {string} The stamp.
 */
const commandStamp = (ms) =>
  new Date(ms)
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/[-:T]/g, '');

/**
 * @description The holiday command, from now on for a number of days (0: cancel).
 * @param {number} now - Now (ms).
 * @param {number} days - Days (0 cancels).
 * @returns {string} The changeMode parameter.
 */
function holidayCommand(now, days) {
  if (!days) return HOLIDAY_CANCEL;
  return `W${commandStamp(now)}Z${commandStamp(now + days * 24 * 60 * 60 * 1000)}Z`;
}

/**
 * @description The setpoint bounds of a thermostat in the mode of its heat pump.
 * @param {object|null} heatPump - The parsed heat pump.
 * @returns {{ min: number, max: number }} The bounds.
 */
function setpointBounds(heatPump) {
  const cooling = /^cool_/.test(heatPump?.airMode ?? '');
  const bounds = cooling ? heatPump?.cooling : heatPump?.heating;
  return bounds ?? { min: SETPOINT_MIN, max: SETPOINT_MAX };
}

/**
 * @description Check a thermostat setpoint: whole degrees, within the bounds.
 * @param {unknown} raw - The value asked.
 * @param {object|null} heatPump - The parsed heat pump.
 * @returns {number} The setpoint.
 * @throws {RangeError} Not a number, or out of the bounds.
 */
function checkSetpoint(raw, heatPump) {
  const value = Number(raw);
  const { min, max } = setpointBounds(heatPump);
  if (!Number.isFinite(value)) throw new RangeError('The setpoint must be a number');
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    throw new RangeError(`The setpoint must be between ${min} and ${max} °C`);
  }
  return rounded;
}

export {
  KINDS,
  VENTILATION_MODES,
  VENTILATION_MODE_LETTER,
  AIR_MODES,
  AIR_MODE_LETTER,
  WATER_MODES,
  WATER_MODE_LETTER,
  HOLIDAY_CANCEL,
  SETPOINT_MIN,
  SETPOINT_MAX,
  BATHROOMS,
  number,
  apiDate,
  kindOf,
  ventilationMode,
  filterOf,
  parseProducts,
  holidayActive,
  holidayCommand,
  setpointBounds,
  checkSetpoint,
};
