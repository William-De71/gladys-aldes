// -----------------------------------------------------------------------------
// The Aldes integration: every handler, registered on a Gladys client.
//
//   - one request, `GET /users/me/products`, reads every product of the
//     AldesConnect account at the chosen interval (1, 2, 5 or 10 minutes) on
//     the integration's own clock: the devices are never polled by Gladys
//     (`should_poll: false`);
//   - one Gladys device per ventilation unit, per T.One heat pump and per
//     room thermostat of a T.One (device.js); only the changed states are
//     published (publishChangedStates, with a 30-minute heartbeat);
//   - a command (a feature, a scene action, a widget button) is shown at once
//     and sent without waiting; one reading follows to confirm it. Meanwhile,
//     and for 3 minutes at most, the commanded values win over what the cloud
//     still returns. A product Aldes reports offline refuses commands: the
//     cloud would accept them, the product would never get them;
//   - a timed ventilation boost goes back to the previous mode by itself (a
//     timer of the container, lost on a restart);
//   - scene triggers on transitions of a product (events.js), scene actions,
//     two widgets (widgets.js), one configuration button ("Test the
//     connection").
//
// Transport: cloud (AldesConnect API). index.js only creates the SDK client;
// the tests drive this module with the fake Gladys of the SDK and a fake API.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  guessLanguage,
  resolveTimezone,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import {
  KINDS,
  VENTILATION_MODE_LETTER,
  AIR_MODE_LETTER,
  WATER_MODE_LETTER,
  parseProducts,
  holidayActive,
  holidayCommand,
  checkSetpoint,
} from './aldes.js';
import { createAldesApi, CredentialsError, RateLimitError, ApiError } from './aldes-api.js';
import {
  buildDevice,
  buildStates,
  featuresOf,
  idsOf,
  deviceName,
  discoverySignature,
  VENTILATION_OPTIONS,
  AIR_OPTIONS,
  WATER_MODE_OF,
} from './device.js';
import {
  TRIGGERS,
  SCENE_ACTIONS,
  MAX_HOLIDAY_DAYS,
  detectEvents,
  modeOf,
  boostMinutes,
  holidayDays,
  option,
} from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  WIDGET_BOOST_MINUTES,
  MAX_ITEMS,
  buildVentilationWidget,
  buildHeatPumpWidget,
  formatTime,
} from './widgets.js';
import { createState, DEFAULT_PATH } from './state.js';
import { t, all, isLanguage } from './i18n.js';

const ACTIONS = { TEST: 'test_connection' };
// The clock: the due readings are checked this often.
const TICK_MS = 10 * 1000;
// The reading that confirms a command comes this long after it (Aldes relays
// a command to the product through its own IoT hub, a few seconds late).
const CONFIRM_DELAY_MS = 15 * 1000;
// The commanded values win over the cloud answers this long at most.
const PENDING_MS = 3 * 60 * 1000;
// A change the integration commanded never fires a trigger within this delay.
const EXPECTED_MS = 10 * 60 * 1000;
// A refresh button or action reads again only past this delay.
const MIN_MANUAL_GAP_MS = 30 * 1000;
// Refused credentials are tried again this often.
const REFUSED_RETRY_MS = 30 * 60 * 1000;
// Slow-down after a 429: the interval doubles each time, up to this.
const MAX_PAUSE_MS = 30 * 60 * 1000;
// requestWidgetRefresh: at most once every 10 s per widget.
const WIDGET_REFRESH_GAP_MS = 10 * 1000;
// publishChangedStates also re-sends an unchanged value this old.
const HEARTBEAT_MS = 30 * 60 * 1000;
// The fields a command can change before the cloud confirms them.
const PENDING_KEYS = ['mode', 'airMode', 'waterMode', 'setpoint'];

/** A command for a product Aldes reports offline. */
class OfflineError extends Error {
  /** @param {string} name - The product. */
  constructor(name) {
    super(`${name} is offline: Aldes cannot pass the command on`);
    this.name = 'OfflineError';
  }
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {object} [options.api] - An Aldes API client (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {string|null} [options.statePath] - File of the state (null: memory).
 * @param {number} [options.tickMs] - Clock period, 0 for none (tests).
 * @param {string} [options.timezone] - IANA timezone of Gladys.
 * @param {Function} [options.setTimer] - `(fn, ms) => handle` (tests).
 * @param {Function} [options.clearTimer] - `(handle) => void` (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    api = createAldesApi(),
    now = () => Date.now(),
    statePath = DEFAULT_PATH,
    tickMs = TICK_MS,
    timezone = resolveTimezone(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
    logger = sdkLogger,
  } = {},
) {
  const state = createState({ path: statePath, logger });
  let config = normalizeConfig({});
  let language = null;
  // id -> parsed model as the cloud returned it. What Gladys sees is this
  // with the commanded values on top (view()).
  let cloud = new Map();
  let ignored = [];
  let lastDiscovery = null;
  let connection = 'unknown';
  let connectionDetail = null;
  let lastSuccessAt = 0;
  let lastAttemptAt = 0;
  let nextPollAt = 0;
  let pausedUntil = 0;
  let backoff = 0;
  let lastStatus = null;
  let polling = null;
  let timer = null;
  let running = Promise.resolve();
  // id -> { mode?, airMode?, waterMode?, setpoint?, until }.
  const pending = new Map();
  // product id -> { mode?, holiday?, until }: values the integration commanded.
  const expected = new Map();
  // product id -> { until, restore, handle }: a timed ventilation boost.
  const boosts = new Map();
  const widgetRefreshedAt = new Map();

  const textLanguage = () =>
    config.language !== AUTO_LANGUAGE ? config.language : (language ?? guessLanguage(timezone));
  const intervalMs = () => config.refreshMinutes * 60 * 1000;
  const all_ = () => [...cloud.values()].map(view);
  const ofKind = (kind) => all_().filter((model) => model.kind === kind);
  const products = () => all_().filter((model) => model.kind !== KINDS.THERMOSTAT);
  const ventilations = () => ofKind(KINDS.VENTILATION);
  const heatPumps = () => ofKind(KINDS.HEAT_PUMP);
  const thermostats = () => ofKind(KINDS.THERMOSTAT);
  const modelOf = (id) => (cloud.has(id) ? view(cloud.get(id)) : null);
  const nameOf = (model) => deviceName(model, textLanguage());
  const createdIds = () => new Set((gladys.devices ?? []).map((device) => device.external_id));
  const externalIdOf = (model) => idsOf(gladys, model).device;
  const byExternalId = (externalId) =>
    all_().find((model) => externalIdOf(model) === externalId) ?? null;
  const sortByName = (list) => list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  // --- Publishing ---------------------------------------------------------------

  /** @description Offer every product and thermostat on the Discovery screen. */
  async function publishDiscovery({ force = false } = {}) {
    if (!gladys.connected) return;
    const list = all_();
    const signature = discoverySignature(gladys, list, textLanguage());
    if (!force && signature === lastDiscovery) return;
    try {
      await gladys.publishDiscoveredDevices(
        list.map((model) => buildDevice(gladys, model, textLanguage())),
      );
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
  }

  /**
   * @description Publish the changed states of the devices the user created.
   * @param {object[]} list - Parsed models.
   */
  async function publishStates(list) {
    if (!gladys.connected) return;
    const created = createdIds();
    const states = list
      .filter((model) => created.has(externalIdOf(model)))
      .flatMap((model) => buildStates(gladys, model));
    if (states.length === 0) return;
    try {
      await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
    } catch (err) {
      logger.error('Unable to publish the states', err);
    }
  }

  /** @description Ask Gladys to fetch the widgets again (10 s apart at least). */
  function refreshWidgets() {
    if (!gladys.connected) return;
    Object.values(WIDGETS).forEach((key) => {
      const last = widgetRefreshedAt.get(key) ?? -Infinity;
      if (now() - last < WIDGET_REFRESH_GAP_MS) return;
      widgetRefreshedAt.set(key, now());
      try {
        gladys.requestWidgetRefresh(key);
      } catch (err) {
        logger.warn(`Unable to refresh the widget ${key}: ${err.message}`);
      }
    });
  }

  /**
   * @description The message of the current connection state.
   * @returns {{connected: boolean, message: object}|null} The status (null: unknown yet).
   */
  function statusMessage() {
    if (connection === 'unconfigured') {
      return { connected: false, message: all('statusUnconfigured') };
    }
    if (connection === 'refused') {
      return {
        connected: false,
        message: all('statusRefused', { reason: connectionDetail ?? 'BAD_CREDENTIALS' }),
      };
    }
    if (connection === 'rate_limited') {
      return {
        connected: true,
        message: all('statusRateLimited', {
          n: Math.max(1, Math.ceil((pausedUntil - now()) / 60000)),
        }),
      };
    }
    if (connection === 'error') {
      return {
        connected: false,
        message: all('statusError', { error: connectionDetail ?? 'network' }),
      };
    }
    if (connection === 'ok' && products().length === 0) {
      return { connected: true, message: all('statusNoProduct') };
    }
    if (connection === 'ok') {
      return {
        connected: true,
        message: all('statusOk', {
          count: products().length,
          rooms: thermostats().length,
          minutes: config.refreshMinutes,
        }),
      };
    }
    return null;
  }

  /** @description Show the state of the connection in the Configuration screen. */
  async function reportStatus() {
    const status = statusMessage();
    if (!status) return;
    const signature = JSON.stringify(status);
    if (!gladys.connected || signature === lastStatus) return;
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the status', err);
    }
  }

  /**
   * @description Fire a scene event; a refusal is logged, never thrown.
   * @param {string} key - The trigger.
   * @param {object} data - Its data.
   */
  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Readings -----------------------------------------------------------------

  /**
   * @description A model with the values commanded but not confirmed yet on
   * top of the cloud values (never changes `pending`).
   * @param {object} model - The model as the cloud returned it.
   * @returns {object} The model Gladys sees.
   */
  function view(model) {
    const entry = pending.get(model.id);
    if (!entry || now() >= entry.until) return model;
    const result = { ...model };
    for (const key of PENDING_KEYS) {
      if (key in entry) result[key] = entry[key];
    }
    return result;
  }

  /**
   * @description Drop the commanded values a new reading confirms, and the
   * late ones: from then on the cloud is right.
   * @param {object} model - The model as the cloud returned it.
   */
  function confirmPending(model) {
    const entry = pending.get(model.id);
    if (!entry) return;
    if (now() >= entry.until) {
      pending.delete(model.id);
      return;
    }
    for (const key of PENDING_KEYS) {
      if (key in entry && model[key] === entry[key]) delete entry[key];
    }
    if (!PENDING_KEYS.some((key) => key in entry)) pending.delete(model.id);
  }

  /**
   * @description Whether the integration commanded this value itself lately.
   * @param {string} id - The product.
   * @returns {Function} `(what, value) => boolean`.
   */
  function expectedOf(id) {
    return (what, value) => {
      const entry = expected.get(id);
      // '*': any value (a cancelled holiday ends on a mode Aldes chooses).
      return (
        Boolean(entry) &&
        now() < entry.until &&
        what in entry &&
        (entry[what] === '*' || entry[what] === value)
      );
    };
  }

  /**
   * @description Take a new reading in: detect the scene events, remember
   * the snapshots.
   * @param {object} parsed - `{ products, thermostats, ignored }`.
   * @returns {Promise<void>}
   */
  async function ingest(parsed) {
    const events = [];
    const created = createdIds();
    const next = new Map();
    for (const item of [...parsed.products, ...parsed.thermostats]) {
      confirmPending(item);
      next.set(item.id, item);
    }
    for (const product of parsed.products) {
      // A boost that ended in the app: forget its timer.
      const boost = boosts.get(product.id);
      if (boost && product.kind === KINDS.VENTILATION && product.mode && product.mode !== 'boost') {
        if (!pending.has(product.id)) cancelBoost(product.id);
      }
      const result = detectEvents(state.snapshot(product.id), product, {
        device: externalIdOf(product),
        name: deviceName(product),
        now: now(),
        expected: expectedOf(product.id),
      });
      state.setSnapshot(product.id, result.snapshot);
      if (created.has(externalIdOf(product))) events.push(...result.events);
    }
    cloud = next;
    ignored = parsed.ignored;
    if (parsed.products.length > 0) state.keep(parsed.products.map((item) => item.id));
    state.save();
    for (const event of events) await fire(event.key, event.data);
  }

  /**
   * @description Read the products.
   * @param {string} reason - timer, manual, scan, connected, confirm.
   * @returns {Promise<boolean>} The reading worked.
   */
  function poll(reason = 'timer') {
    if (polling) return polling;
    polling = (async () => {
      lastAttemptAt = now();
      nextPollAt = now() + intervalMs();
      if (!api.hasCredentials()) {
        connection = 'unconfigured';
        await reportStatus();
        refreshWidgets();
        return false;
      }
      try {
        const parsed = parseProducts(await api.getProducts());
        connection = 'ok';
        connectionDetail = null;
        backoff = 0;
        pausedUntil = 0;
        lastSuccessAt = now();
        nextPollAt = now() + intervalMs();
        await ingest(parsed);
        logger.debug?.(
          `Read ${parsed.products.length} product(s), ${parsed.thermostats.length} thermostat(s) (${reason})`,
        );
        await publishDiscovery();
        await publishStates(all_());
        return true;
      } catch (err) {
        handleError(err);
        return false;
      } finally {
        await reportStatus();
        refreshWidgets();
      }
    })().finally(() => {
      polling = null;
    });
    return polling;
  }

  /**
   * @description Record an API failure: refused credentials, slow-down or
   * unreachable API.
   * @param {Error} err - The error.
   */
  function handleError(err) {
    if (err instanceof CredentialsError) {
      connection = err.reason === 'MISSING' ? 'unconfigured' : 'refused';
      connectionDetail = err.reason;
      pausedUntil = now() + REFUSED_RETRY_MS;
      nextPollAt = pausedUntil;
      logger.warn(`Aldes refused the credentials (${err.reason})`);
    } else if (err instanceof RateLimitError) {
      backoff += 1;
      const pause = Math.min(MAX_PAUSE_MS, Math.max(err.retryAfterMs, intervalMs() * 2 ** backoff));
      connection = 'rate_limited';
      pausedUntil = now() + pause;
      nextPollAt = pausedUntil;
      logger.warn(`Aldes limits the requests: next reading in ${Math.round(pause / 60000)} min`);
    } else {
      connection = 'error';
      connectionDetail = err instanceof ApiError ? `HTTP ${err.status}` : err.message?.slice(0, 80);
      logger.warn(`Aldes reading failed: ${err.message}`);
    }
  }

  /** @description The clock: the due reading. */
  async function tick() {
    if (!gladys.connected) return;
    if (now() >= nextPollAt && now() >= pausedUntil) await poll('timer');
  }

  // --- Commands -----------------------------------------------------------------

  /**
   * @description Publish the models touched by a command.
   * @param {string[]} ids - Model ids.
   */
  async function afterCommand(ids) {
    await publishStates(ids.map(modelOf).filter(Boolean));
    refreshWidgets();
  }

  /**
   * @description Show a command at once and return the function that sends it.
   * @param {object} model - The parsed model.
   * @param {object} shown - The values to show until confirmed.
   * @param {Function} request - `() => Promise`: the request to Aldes.
   * @param {object} [expect] - `{ mode?, holiday? }` the triggers must not report.
   * @returns {Function} `() => Promise<void>`: sends it.
   */
  function prepare(model, shown, request, expect = null) {
    if (!api.hasCredentials()) throw new Error('Aldes is not configured');
    const product = model.kind === KINDS.THERMOSTAT ? modelOf(model.productId) : model;
    if (product?.online === false) throw new OfflineError(nameOf(product));
    if (Object.keys(shown).length > 0) {
      pending.set(model.id, {
        ...(pending.get(model.id) ?? {}),
        ...shown,
        until: now() + PENDING_MS,
      });
    }
    if (expect) {
      expected.set(product.id, {
        ...(expected.get(product.id) ?? {}),
        ...expect,
        until: now() + EXPECTED_MS,
      });
    }
    return async () => {
      try {
        await request();
        // One reading confirms the command.
        nextPollAt = Math.min(nextPollAt, now() + CONFIRM_DELAY_MS);
      } catch (err) {
        // The commanded values are dropped: the next reading shows the truth.
        pending.delete(model.id);
        if (err instanceof RateLimitError || err instanceof CredentialsError) handleError(err);
        await afterCommand([model.id]);
        throw err;
      }
    };
  }

  /**
   * @description Forget the timer of a ventilation boost.
   * @param {string} id - The product.
   */
  function cancelBoost(id) {
    const boost = boosts.get(id);
    if (!boost) return;
    if (boost.handle !== null) clearTimer(boost.handle);
    boosts.delete(id);
  }

  /**
   * @description A mode command on a ventilation unit.
   * @param {object} product - The parsed ventilation unit (as Gladys sees it).
   * @param {string} mode - daily, boost, guests, holidays, schedule.
   * @returns {Function} The sender.
   */
  function ventilationCommand(product, mode) {
    const key = option(mode, VENTILATION_OPTIONS, 'The ventilation mode');
    // "Holidays" from the mode list: until another mode is chosen (the
    // command needs an end: the longest holiday).
    const parameter =
      key === 'holidays' ? holidayCommand(now(), MAX_HOLIDAY_DAYS) : VENTILATION_MODE_LETTER[key];
    const send = prepare(product, { mode: key }, () => api.changeMode(product.id, parameter), {
      mode: key,
      holiday: key === 'holidays',
    });
    cancelBoost(product.id);
    return send;
  }

  /**
   * @description A timed boost of a ventilation unit, back to its mode after.
   * @param {object} product - The parsed ventilation unit.
   * @param {number} minutes - Minutes (0: until changed).
   * @returns {{ send: Function, until: number|null }} The sender and the end.
   */
  function boostCommand(product, minutes) {
    const current = boosts.get(product.id);
    const restore =
      current?.restore ??
      (product.mode && !['boost', 'holidays'].includes(product.mode) ? product.mode : 'daily');
    const send = ventilationCommand(product, 'boost');
    if (minutes <= 0) return { send, until: null };
    const until = now() + minutes * 60 * 1000;
    const handle = setTimer(() => {
      boosts.delete(product.id);
      const model = modelOf(product.id);
      if (!model || model.mode !== 'boost') return;
      try {
        const back = ventilationCommand(model, restore);
        afterCommand([model.id])
          .then(back)
          .catch((err) => logger.warn(`End of the boost of ${nameOf(model)}: ${err.message}`));
      } catch (err) {
        logger.warn(`End of the boost of ${nameOf(model)}: ${err.message}`);
      }
    }, until - now());
    handle?.unref?.();
    boosts.set(product.id, { until, restore, handle: handle ?? null });
    return { send, until };
  }

  /**
   * @description An air mode command on a T.One.
   * @param {object} product - The parsed heat pump.
   * @param {string} mode - A key of AIR_MODES.
   * @returns {Function} The sender.
   */
  function airCommand(product, mode) {
    const key = option(mode, AIR_OPTIONS, 'The air mode');
    return prepare(product, { airMode: key }, () =>
      api.changeMode(product.id, AIR_MODE_LETTER[key]),
    );
  }

  /**
   * @description A hot water command on a T.One AquaAIR.
   * @param {object} product - The parsed heat pump.
   * @param {string} mode - off, on, boost.
   * @returns {Function} The sender.
   */
  function waterCommand(product, mode) {
    const key = option(mode, Object.keys(WATER_MODE_LETTER), 'The hot water mode');
    if (!product.hasWater) throw new Error(`${nameOf(product)} makes no hot water`);
    return prepare(product, { waterMode: key }, () =>
      api.changeMode(product.id, WATER_MODE_LETTER[key]),
    );
  }

  /**
   * @description A setpoint command on a room thermostat.
   * @param {object} thermostat - The parsed thermostat.
   * @param {unknown} value - The setpoint asked.
   * @returns {Function} The sender.
   */
  function thermostatCommand(thermostat, value) {
    const setpoint = checkSetpoint(value, modelOf(thermostat.productId));
    return prepare(thermostat, { setpoint }, () =>
      api.setThermostat(
        thermostat.productId,
        { id: thermostat.thermostatId, name: thermostat.name ?? '' },
        setpoint,
      ),
    );
  }

  /**
   * @description The same command on several products, one after the other.
   * @param {object[]} list - Parsed products.
   * @param {Function} build - `(product) => send`.
   * @returns {Promise<{count: number, failed: number}>} The outcome.
   */
  async function commandMany(list, build) {
    let count = 0;
    let failed = 0;
    for (const product of list) {
      try {
        const send = build(product);
        await afterCommand([product.id]);
        await send();
        count += 1;
      } catch (err) {
        // One product chosen: its error is the error of the action.
        if (list.length === 1) throw err;
        failed += 1;
        logger.warn(`Command for ${nameOf(product)} failed: ${err.message}`);
      }
    }
    return { count, failed };
  }

  /**
   * @description The products a scene action is about.
   * @param {unknown} externalId - The device chosen (empty: all of the kind).
   * @param {string} kind - The kind wanted.
   * @returns {object[]} The parsed products.
   */
  function targets(externalId, kind) {
    if (externalId) {
      const model = byExternalId(String(externalId));
      if (!model || model.kind !== kind) {
        throw new Error(`Unknown Aldes ${kind.replace('_', ' ')}: choose it again in the scene`);
      }
      return [model];
    }
    const list = ofKind(kind);
    if (list.length === 0) throw new Error(`No Aldes ${kind.replace('_', ' ')} read yet`);
    return list;
  }

  gladys.onSetValue(async (device, deviceFeature, value) => {
    const model = byExternalId(device.external_id);
    if (!model) throw new Error('Unknown Aldes device: read the devices again');
    const key = String(deviceFeature.external_id).slice(device.external_id.length + 1);
    let send;
    if (model.kind === KINDS.VENTILATION && key === 'mode') {
      send = ventilationCommand(model, String(value));
    } else if (model.kind === KINDS.HEAT_PUMP && key === 'air_mode') {
      send = airCommand(model, String(value));
    } else if (model.kind === KINDS.HEAT_PUMP && key === 'hot_water_mode') {
      const mode = WATER_MODE_OF[Number(value)];
      if (!mode) throw new RangeError(`Hot water mode ${value} is not available on a T.One`);
      send = waterCommand(model, mode);
    } else if (model.kind === KINDS.THERMOSTAT && key === 'target_temperature') {
      send = thermostatCommand(model, value);
    } else {
      throw new Error(`The feature ${key} is read-only`);
    }
    // The answer of Gladys is awaited 5 s: the command is shown at once and
    // sent without waiting for Aldes.
    await afterCommand([model.id]);
    send().catch((err) => logger.warn(`Command for ${nameOf(model)} failed: ${err.message}`));
  });

  // --- Scene actions ----------------------------------------------------------------

  gladys.onSceneAction(SCENE_ACTIONS.SET_VENTILATION_MODE, async (fields = {}) => {
    const mode = option(
      fields.mode,
      VENTILATION_OPTIONS.filter((key) => key !== 'holidays'),
      'The ventilation mode',
    );
    return commandMany(targets(fields.device, KINDS.VENTILATION), (product) =>
      ventilationCommand(product, mode),
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.BOOST_VENTILATION, async (fields = {}) => {
    const minutes = boostMinutes(fields.minutes);
    let until = null;
    const outcome = await commandMany(targets(fields.device, KINDS.VENTILATION), (product) => {
      const command = boostCommand(product, minutes);
      until = command.until;
      return command.send;
    });
    return { ...outcome, until: until ? formatTime(until, timezone) : '' };
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_AIR_MODE, async (fields = {}) => {
    const mode = option(fields.mode, AIR_OPTIONS, 'The air mode');
    return commandMany(targets(fields.device, KINDS.HEAT_PUMP), (product) =>
      airCommand(product, mode),
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_HOT_WATER, async (fields = {}) => {
    const mode = option(fields.mode, Object.keys(WATER_MODE_LETTER), 'The hot water mode');
    const list = targets(fields.device, KINDS.HEAT_PUMP).filter(
      (product) => fields.device || product.hasWater,
    );
    if (list.length === 0) throw new Error('No Aldes T.One makes hot water');
    return commandMany(list, (product) => waterCommand(product, mode));
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_HOLIDAY, async (fields = {}) => {
    const days = holidayDays(fields.days);
    const list = fields.device
      ? [byExternalId(String(fields.device))].filter(
          (model) => model && model.kind !== KINDS.THERMOSTAT,
        )
      : products();
    if (list.length === 0) throw new Error('No Aldes product: choose it again in the scene');
    const parameter = holidayCommand(now(), days);
    const outcome = await commandMany(list, (product) => {
      const send = prepare(product, {}, () => api.changeMode(product.id, parameter), {
        holiday: days > 0,
        ...(product.kind === KINDS.VENTILATION ? { mode: days > 0 ? 'holidays' : '*' } : {}),
      });
      if (product.kind === KINDS.VENTILATION) cancelBoost(product.id);
      return send;
    });
    const until = days > 0 ? new Date(now() + days * 86400000).toISOString().slice(0, 10) : '';
    return { ...outcome, until };
  });

  gladys.onSceneAction(SCENE_ACTIONS.READ_NOW, async (fields = {}) => {
    if (now() - lastAttemptAt >= MIN_MANUAL_GAP_MS || !lastSuccessAt) {
      const ok = await poll('manual');
      if (!ok) throw new Error(`Aldes reading failed (${connection})`);
    }
    const product = fields.device ? byExternalId(String(fields.device)) : (products()[0] ?? null);
    if (fields.device && (!product || product.kind === KINDS.THERMOSTAT)) {
      throw new Error('Unknown Aldes product: choose it again in the scene');
    }
    if (!product) throw new Error('No Aldes product read yet');
    const lang = textLanguage();
    const mode = modeOf(product);
    const prefix = product.kind === KINDS.HEAT_PUMP ? 'air' : 'vmc';
    const value = (n) => (n === null || n === undefined ? -1 : Math.round(n * 10) / 10);
    return {
      mode: mode ?? '',
      mode_label: mode ? t(`${prefix}_${mode}`, lang) : '',
      co2: value(product.co2),
      temperature: value(
        product.kind === KINDS.HEAT_PUMP ? product.temperature : product.kitchen?.temperature,
      ),
      humidity: value(product.kitchen?.humidity),
      hot_water: value(product.hotWater),
      filter_life: value(product.filter?.life),
      online: product.online !== false,
    };
  });

  // --- Configuration button ----------------------------------------------------------

  gladys.onAction(ACTIONS.TEST, async () => {
    if (!api.hasCredentials()) return all('statusUnconfigured');
    const ok = await poll('manual');
    if (!ok) return statusMessage()?.message ?? all('statusError', { error: 'network' });
    if (products().length === 0) {
      return all(
        (lang) =>
          `${t('statusNoProduct', lang)}${
            ignored.length ? t('testIgnored', lang, { list: ignored.join(', ') }) : ''
          }`,
      );
    }
    return all((lang) => {
      const list = sortByName(all_())
        .map((model) => {
          let what;
          if (model.kind === KINDS.THERMOSTAT) {
            what = `${model.room ?? '—'} °C → ${model.setpoint ?? '—'} °C`;
          } else if (model.online === false) {
            what = t('offline', lang);
          } else {
            const mode = modeOf(model);
            const prefix = model.kind === KINDS.HEAT_PUMP ? 'air' : 'vmc';
            what = mode ? t(`${prefix}_${mode}`, lang) : t('online', lang);
          }
          return t('testItem', lang, {
            name: deviceName(model, lang),
            what,
            features: featuresOf(model).length,
          });
        })
        .join(' · ');
      const extra = ignored.length ? t('testIgnored', lang, { list: ignored.join(', ') }) : '';
      return `${t('testOk', lang, { count: cloud.size, list })}${extra}`.slice(0, 2000);
    });
  });

  // --- Widgets ------------------------------------------------------------------------

  /**
   * @description Remember the language of the last widget request (the
   * feature names follow it when the configuration says "automatic").
   * @param {string} lang - The language of the request.
   */
  function rememberLanguage(lang) {
    if (!isLanguage(lang) || lang === language) return;
    const before = textLanguage();
    language = lang;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: lang })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
    if (textLanguage() !== before) publishDiscovery();
  }

  /**
   * @description The product chosen in the settings of a widget (the first
   * of its kind when none is chosen).
   * @param {unknown} wanted - The external id.
   * @param {string} kind - The kind offered.
   * @returns {object|null} The product.
   */
  function chosen(wanted, kind) {
    const list = sortByName(ofKind(kind));
    return list.find((model) => externalIdOf(model) === wanted) ?? list[0] ?? null;
  }

  gladys.onWidgetGet(
    WIDGETS.VENTILATION,
    async ({ settings: s = {}, language: lang, units } = {}) => {
      rememberLanguage(lang);
      const shown = isLanguage(lang) ? lang : textLanguage();
      const product = chosen(s.device, KINDS.VENTILATION);
      return buildVentilationWidget({
        product,
        name: product ? deviceName(product, shown) : '',
        waiting: product ? pending.has(product.id) : false,
        boostUntil: product ? (boosts.get(product.id)?.until ?? null) : null,
        connection,
        lastSuccessAt,
        language: shown,
        units,
        timezone,
        now: now(),
      });
    },
  );

  gladys.onWidgetGet(
    WIDGETS.HEAT_PUMP,
    async ({ settings: s = {}, language: lang, units } = {}) => {
      rememberLanguage(lang);
      const shown = isLanguage(lang) ? lang : textLanguage();
      const product = chosen(s.device, KINDS.HEAT_PUMP);
      const rooms = product
        ? thermostats()
            .filter((item) => item.productId === product.id)
            .sort((a, b) => deviceName(a, shown).localeCompare(deviceName(b, shown)))
        : [];
      return buildHeatPumpWidget({
        product,
        name: product ? deviceName(product, shown) : '',
        thermostats: rooms.slice(0, MAX_ITEMS).map((model) => ({
          model,
          name: deviceName(model, shown),
          waiting: pending.has(model.id),
        })),
        waiting: product ? pending.has(product.id) : false,
        connection,
        lastSuccessAt,
        language: shown,
        units,
        now: now(),
      });
    },
  );

  /**
   * @description The buttons of the widgets.
   * @param {string} actionKey - The button.
   * @param {object} [_params] - Its params (none).
   * @param {object} [context] - `{ settings }` of the widget.
   * @returns {Promise<object>} The toast.
   */
  async function widgetAction(actionKey, _params = {}, { settings: s = {} } = {}) {
    if (actionKey === WIDGET_ACTIONS.BOOST || actionKey === WIDGET_ACTIONS.DAILY) {
      const product = chosen(s.device, KINDS.VENTILATION);
      if (!product) return all('emptyVentilation');
      if (product.online === false) return all('toastOffline');
      try {
        if (actionKey === WIDGET_ACTIONS.BOOST) {
          const { send, until } = boostCommand(product, WIDGET_BOOST_MINUTES);
          await afterCommand([product.id]);
          await send();
          return all('toastBoost', { until: formatTime(until, timezone) });
        }
        const send = ventilationCommand(product, 'daily');
        await afterCommand([product.id]);
        await send();
        return all('toastDaily');
      } catch (err) {
        logger.warn(`Widget command failed: ${err.message}`);
        return all((lang) => t('toastFailed', lang, { error: err.message.slice(0, 120) }));
      }
    }
    if (actionKey === WIDGET_ACTIONS.REFRESH) {
      if (now() - lastAttemptAt >= MIN_MANUAL_GAP_MS || !lastSuccessAt) {
        const ok = await poll('manual');
        if (!ok) {
          return all((lang) =>
            t('toastFailed', lang, { error: t(`connection_${connection}`, lang) }),
          );
        }
      }
      return all('toastRefreshed', { n: products().length });
    }
    throw new Error(`Unknown button ${actionKey}`);
  }
  gladys.onWidgetAction(WIDGETS.VENTILATION, widgetAction);
  gladys.onWidgetAction(WIDGETS.HEAT_PUMP, widgetAction);

  // --- Devices and configuration --------------------------------------------------

  gladys.onScanRequest(async () => {
    await poll('scan');
    await publishDiscovery({ force: true });
  });

  gladys.onDeviceCreated(async (device) => {
    const model = byExternalId(device.external_id);
    if (model) await publishStates([model]);
    refreshWidgets();
  });

  gladys.onDeviceUpdated(async (device) => {
    const model = byExternalId(device.external_id);
    if (model) await publishStates([model]);
  });

  /** @description Forget what was read with other credentials. */
  function resetReadings() {
    connection = 'unknown';
    connectionDetail = null;
    pausedUntil = 0;
    backoff = 0;
    lastStatus = null;
  }

  gladys.onConfigUpdated(async (raw) => {
    const previous = { ...config, language: textLanguage() };
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.email, config.password);
    const credentialsChanged =
      config.email !== previous.email || config.password !== previous.password;
    if (credentialsChanged) resetReadings();
    if (textLanguage() !== previous.language) await publishDiscovery();
    if (credentialsChanged || config.refreshMinutes !== previous.refreshMinutes) {
      nextPollAt = 0;
      if (credentialsChanged) pausedUntil = 0;
      await tick();
    } else {
      refreshWidgets();
    }
  });

  gladys.on('connected', async () => {
    const raw = gladys.config ?? {};
    config = normalizeConfig(raw);
    language = readLanguage(raw, language);
    api.setCredentials(config.email, config.password);
    lastStatus = null;
    lastDiscovery = null;
    nextPollAt = 0;
    running = poll('connected');
    await running;
    if (tickMs > 0 && timer === null) {
      timer = setInterval(() => {
        running = tick().catch((err) => logger.error('Tick failed', err));
      }, tickMs);
      timer.unref?.();
    }
  });

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    for (const id of [...boosts.keys()]) cancelBoost(id);
  };

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stop();
    await running;
    state.save();
  });

  return {
    poll,
    tick,
    stop,
    state,
    models: all_,
    products,
    ventilations,
    heatPumps,
    thermostats,
    connection: () => connection,
    pending,
    boosts,
    holidayActive: (model) => holidayActive(model, now()),
  };
}

export {
  ACTIONS,
  TICK_MS,
  CONFIRM_DELAY_MS,
  PENDING_MS,
  EXPECTED_MS,
  MIN_MANUAL_GAP_MS,
  REFUSED_RETRY_MS,
  MAX_PAUSE_MS,
  TRIGGERS,
  OfflineError,
  createApp,
};
