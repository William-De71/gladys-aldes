// -----------------------------------------------------------------------------
// Scene triggers and scene actions.
//
// Triggers fire on a TRANSITION between two readings of a product, never on a
// snapshot: the first reading only sets the baseline. The last values are kept
// in /data across restarts (state.js), so a change that happened while the
// integration restarted still fires once, and nothing fires twice. A change
// the integration itself commanded (feature, scene action, widget button)
// never fires "mode changed" or "holiday changed": a scene bound to them
// cannot loop (src/app.js keeps the expected values).
// -----------------------------------------------------------------------------

import { KINDS, holidayActive } from './aldes.js';

const TRIGGERS = {
  MODE_CHANGED: 'mode_changed',
  CONNECTION_CHANGED: 'connection_changed',
  FILTER_DUE: 'filter_due',
  HOLIDAY_CHANGED: 'holiday_changed',
};

const SCENE_ACTIONS = {
  SET_VENTILATION_MODE: 'set_ventilation_mode',
  BOOST_VENTILATION: 'boost_ventilation',
  SET_AIR_MODE: 'set_air_mode',
  SET_HOT_WATER: 'set_hot_water',
  SET_HOLIDAY: 'set_holiday',
  READ_NOW: 'read_now',
};

// "Filter to change" fires when the remaining life of the filter goes down to
// this percentage.
const FILTER_DUE_PERCENT = 10;
// A ventilation boost lasts this long at most (minutes).
const MAX_BOOST_MINUTES = 240;
const DEFAULT_BOOST_MINUTES = 30;
// A holiday lasts this long at most (days).
const MAX_HOLIDAY_DAYS = 365;

const given = (value) => value !== undefined && value !== null && value !== '';

/**
 * @description The mode of a product, the one the triggers compare.
 * @param {object} product - A parsed product.
 * @returns {string|null} The mode key.
 */
const modeOf = (product) =>
  product.kind === KINDS.HEAT_PUMP ? product.airMode : (product.mode ?? null);

/**
 * @description What is remembered of a product between two readings.
 * @param {object} product - A parsed product.
 * @param {number} now - Now (ms).
 * @returns {{ mode: string|null, online: boolean|null, filterLife: number|null,
 *   holiday: boolean }} The snapshot.
 */
function snapshotOf(product, now) {
  return {
    mode: modeOf(product),
    online: product.online,
    filterLife: product.filter?.life ?? null,
    holiday: holidayActive(product, now),
  };
}

/**
 * @description The scene events of a new reading of a product.
 * @param {object|null} previous - The snapshot of the previous reading (null:
 *   first reading, nothing fires).
 * @param {object} product - The parsed product.
 * @param {object} context - Context.
 * @param {string} context.device - The Gladys external id of the product.
 * @param {string} context.name - Its name.
 * @param {number} context.now - Now (ms).
 * @param {Function} [context.expected] - `(what, value) => boolean`: the
 *   integration commanded this value itself (no event).
 * @returns {{ events: Array<{key: string, data: object}>, snapshot: object }} The events.
 */
function detectEvents(previous, product, { device, name, now, expected = () => false }) {
  const snapshot = snapshotOf(product, now);
  // An unknown value keeps the last known one: no reading, no transition.
  for (const key of ['mode', 'online', 'filterLife']) {
    if (snapshot[key] === null && previous && previous[key] !== null && previous[key] !== undefined)
      snapshot[key] = previous[key];
  }
  const events = [];
  if (!previous) return { events, snapshot };
  const base = { device, device_name: name, kind: product.kind };

  if (
    previous.mode &&
    snapshot.mode &&
    previous.mode !== snapshot.mode &&
    !expected('mode', snapshot.mode)
  ) {
    events.push({
      key: TRIGGERS.MODE_CHANGED,
      data: { ...base, mode: snapshot.mode, previous_mode: previous.mode },
    });
  }
  if (
    typeof previous.online === 'boolean' &&
    typeof snapshot.online === 'boolean' &&
    previous.online !== snapshot.online
  ) {
    events.push({
      key: TRIGGERS.CONNECTION_CHANGED,
      data: { ...base, state: snapshot.online ? 'online' : 'offline' },
    });
  }
  if (
    typeof previous.filterLife === 'number' &&
    typeof snapshot.filterLife === 'number' &&
    previous.filterLife > FILTER_DUE_PERCENT &&
    snapshot.filterLife <= FILTER_DUE_PERCENT
  ) {
    events.push({
      key: TRIGGERS.FILTER_DUE,
      data: { ...base, filter_life: snapshot.filterLife },
    });
  }
  if (Boolean(previous.holiday) !== snapshot.holiday && !expected('holiday', snapshot.holiday)) {
    const end = product.kind === KINDS.HEAT_PUMP ? (product.holidayEnd ?? '') : '';
    events.push({
      key: TRIGGERS.HOLIDAY_CHANGED,
      data: {
        ...base,
        state: snapshot.holiday ? 'started' : 'ended',
        end: snapshot.holiday ? end.slice(0, 10) : '',
      },
    });
  }
  return { events, snapshot };
}

/**
 * @description Read a whole number field of a scene action.
 * @param {unknown} raw - The resolved value.
 * @param {number} min - Lowest value.
 * @param {number} max - Highest value.
 * @param {string} what - Its name, for the error.
 * @returns {number} The value.
 * @throws {RangeError} Not a number, or out of the bounds.
 */
function wholeNumber(raw, min, max, what) {
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.round(value) < min || Math.round(value) > max) {
    throw new RangeError(`${what} must be between ${min} and ${max}`);
  }
  return Math.round(value);
}

/**
 * @description The duration of boost_ventilation (30 minutes by default).
 * @param {unknown} raw - The resolved value.
 * @returns {number} Minutes, 0 meaning "until changed".
 */
const boostMinutes = (raw) =>
  given(raw) ? wholeNumber(raw, 0, MAX_BOOST_MINUTES, 'The duration') : DEFAULT_BOOST_MINUTES;

/**
 * @description The number of days of set_holiday (0: cancel).
 * @param {unknown} raw - The resolved value.
 * @returns {number} Days.
 */
const holidayDays = (raw) =>
  wholeNumber(given(raw) ? raw : NaN, 0, MAX_HOLIDAY_DAYS, 'The number of days');

/**
 * @description An option of a select field of an action.
 * @param {unknown} raw - The resolved value.
 * @param {string[]} options - The options.
 * @param {string} what - Its name, for the error.
 * @returns {string} The option.
 */
function option(raw, options, what) {
  const value = String(raw ?? '');
  if (!options.includes(value))
    throw new RangeError(`${what} must be one of ${options.join(', ')}`);
  return value;
}

export {
  TRIGGERS,
  SCENE_ACTIONS,
  FILTER_DUE_PERCENT,
  MAX_BOOST_MINUTES,
  DEFAULT_BOOST_MINUTES,
  MAX_HOLIDAY_DAYS,
  modeOf,
  snapshotOf,
  detectEvents,
  wholeNumber,
  boostMinutes,
  holidayDays,
  option,
};
