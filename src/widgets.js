// -----------------------------------------------------------------------------
// Dashboard widgets, built from the last reading (no request to Aldes).
//
//   - ventilation: a ventilation unit — CO2, kitchen temperature and
//                  humidity, filter life, its mode (and the end of a boost),
//                  the connection — and the buttons "Boost 30 min", "Daily"
//                  and "Refresh";
//   - heat_pump:   a T.One — main temperature, hot water left, the room
//                  thermostats as a list (temperature -> setpoint), the air
//                  and hot water modes, the connection — and "Refresh".
//
// The content stays within the budget of the core (8 components, 1 focal,
// 6 tiles, 2 texts, 1 status, 4 buttons) and every text exists in the four
// languages (test/widgets.test.js runs validateWidgetContent on them).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { holidayActive } from './aldes.js';
import { t, ago, formatNumber, LANGUAGES } from './i18n.js';

const WIDGETS = { VENTILATION: 'ventilation', HEAT_PUMP: 'heat_pump' };
const WIDGET_ACTIONS = { BOOST: 'boost', DAILY: 'daily', REFRESH: 'refresh' };
// The boost of the widget button lasts this long (minutes).
const WIDGET_BOOST_MINUTES = 30;
// A list card holds 8 rows at most.
const MAX_ITEMS = 8;
const TTL_SECONDS = 60;
// CO2 thresholds (ppm) of the tile color: good air below the first, fair air
// below the second (the usual 800 / 1 200 ppm of indoor air guides).
const CO2_GOOD = 800;
const CO2_FAIR = 1200;

const isFahrenheit = (units) => units === 'us' || units === 'imperial';

/**
 * @description A temperature in the unit of the user: "20.5 °C", "68.9 °F".
 * @param {number|null} celsius - The temperature.
 * @param {string} units - metric or us.
 * @param {string} language - The language.
 * @returns {string} The text ("—" when unknown).
 */
function formatTemperature(celsius, units, language) {
  if (celsius === null || celsius === undefined) return '—';
  if (isFahrenheit(units)) return `${formatNumber((celsius * 9) / 5 + 32, language)} °F`;
  return `${formatNumber(celsius, language)} °C`;
}

/**
 * @description A day in the language of the user: "21 déc. 2026".
 * @param {string|null} iso - An ISO date.
 * @param {string} language - The language.
 * @returns {string} The text ('' when none).
 */
function formatDay(iso, language) {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) return '';
  return new Intl.DateTimeFormat(LANGUAGES.includes(language) ? language : 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(ms);
}

/**
 * @description A time of day on site: "17:30".
 * @param {number} ms - The instant.
 * @param {string} timezone - IANA timezone.
 * @returns {string} The time.
 */
function formatTime(ms, timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(ms);
}

const CONNECTION_COLOR = {
  ok: WIDGET_COLORS.SUCCESS,
  unconfigured: WIDGET_COLORS.WARNING,
  refused: WIDGET_COLORS.DANGER,
  rate_limited: WIDGET_COLORS.WARNING,
  error: WIDGET_COLORS.DANGER,
  unknown: WIDGET_COLORS.NEUTRAL,
};

/**
 * @description The color of a CO2 level.
 * @param {number} ppm - The level.
 * @returns {string} The color.
 */
function co2Color(ppm) {
  if (ppm < CO2_GOOD) return WIDGET_COLORS.SUCCESS;
  if (ppm < CO2_FAIR) return WIDGET_COLORS.WARNING;
  return WIDGET_COLORS.DANGER;
}

/**
 * @description The color of the remaining life of a filter.
 * @param {number} life - Percent.
 * @returns {string} The color.
 */
function filterColor(life) {
  if (life <= 10) return WIDGET_COLORS.DANGER;
  if (life <= 25) return WIDGET_COLORS.WARNING;
  return WIDGET_COLORS.SUCCESS;
}

/**
 * @description The rows every widget ends with: the product, the connection,
 * the last reading.
 * @param {object} options - `{ product, name, connection, lastSuccessAt, language, now }`.
 * @returns {object[]} Status rows.
 */
function commonRows({ product, name, connection, lastSuccessAt, language, now }) {
  const rows = [];
  if (product && product.online !== null) {
    rows.push({
      label: name.slice(0, 40) || t('rowProduct', language),
      value: t(product.online ? 'online' : 'offline', language),
      color: product.online ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    });
  }
  rows.push({
    label: t('rowConnection', language),
    value: t(`connection_${connection}`, language),
    color: CONNECTION_COLOR[connection] ?? WIDGET_COLORS.NEUTRAL,
  });
  rows.push({
    label: t('rowLastReading', language),
    value: ago(lastSuccessAt, now, language),
    color: WIDGET_COLORS.NEUTRAL,
  });
  return rows;
}

/**
 * @description The text shown when there is nothing to show.
 * @param {string} connection - The connection state.
 * @param {string} emptyKey - The text when connected but no such product.
 * @param {string} language - The language.
 * @returns {object} A body text.
 */
function emptyText(connection, emptyKey, language) {
  const key = connection === 'ok' ? emptyKey : `connection_${connection}_hint`;
  return { type: 'text', variant: 'body', text: t(key, language) };
}

const refreshButton = (language) => ({
  type: 'button',
  label: t('buttonRefresh', language),
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: WIDGET_ACTIONS.REFRESH },
});

/**
 * @description The ventilation widget.
 * @param {object} options - Options.
 * @param {object|null} options.product - The parsed ventilation unit (null: none).
 * @param {string} options.name - Its name.
 * @param {boolean} [options.waiting] - A command is not confirmed yet.
 * @param {number|null} [options.boostUntil] - End of a boost the integration runs (ms).
 * @param {string} options.connection - ok, unconfigured, refused, rate_limited, error, unknown.
 * @param {number} options.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {string} options.language - The language.
 * @param {string} [options.units] - metric or us.
 * @param {string} options.timezone - IANA timezone of Gladys.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildVentilationWidget({
  product,
  name = '',
  waiting = false,
  boostUntil = null,
  connection,
  lastSuccessAt,
  language,
  units = 'metric',
  timezone = 'UTC',
  now,
}) {
  const components = [];
  if (!product) {
    components.push(emptyText(connection, 'emptyVentilation', language));
    components.push(refreshButton(language));
    return { ttl_seconds: TTL_SECONDS, components };
  }
  if (product.co2 !== null) {
    components.push({
      type: 'value',
      value: Math.round(product.co2),
      unit: 'ppm',
      label: t('tileCo2', language),
      icon: 'wind',
      color: co2Color(product.co2),
    });
  }
  if (product.kitchen.temperature !== null) {
    components.push({
      type: 'value',
      value: formatTemperature(product.kitchen.temperature, units, language),
      label: t('tileKitchenTemperature', language),
      icon: 'thermometer',
    });
  }
  if (product.kitchen.humidity !== null) {
    components.push({
      type: 'value',
      value: Math.round(product.kitchen.humidity),
      unit: '%',
      label: t('tileKitchenHumidity', language),
      icon: 'droplet',
    });
  }
  if (product.filter.life !== null) {
    components.push({
      type: 'value',
      value: product.filter.life,
      unit: '%',
      label: t('tileFilter', language),
      icon: 'filter',
      color: filterColor(product.filter.life),
    });
  }
  const mode = product.mode ? t(`vmc_${product.mode}`, language) : t('unknown', language);
  const running =
    product.running && product.running !== product.mode
      ? ` (${t(`vmc_${product.running}`, language)})`
      : '';
  const rows = [
    {
      label: t('rowMode', language),
      value: waiting ? t('sending', language) : `${mode}${running}`,
      color: waiting
        ? WIDGET_COLORS.WARNING
        : product.mode === 'boost'
          ? WIDGET_COLORS.INFO
          : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (boostUntil && boostUntil > now) {
    rows.push({
      label: t('rowBoostUntil', language),
      value: formatTime(boostUntil, timezone),
      color: WIDGET_COLORS.INFO,
    });
  }
  rows.push(...commonRows({ product, name, connection, lastSuccessAt, language, now }));
  components.push({ type: 'status', items: rows });
  components.push({
    type: 'button',
    label: t('buttonBoost', language, { n: WIDGET_BOOST_MINUTES }),
    icon: 'wind',
    style: 'primary',
    action: { key: WIDGET_ACTIONS.BOOST },
  });
  components.push({
    type: 'button',
    label: t('buttonDaily', language),
    icon: 'home',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.DAILY },
  });
  components.push(refreshButton(language));
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The list row of a room thermostat.
 * @param {object} thermostat - A parsed thermostat.
 * @param {object} options - `{ name, waiting, units, language }`.
 * @returns {object} The card-list item.
 */
function thermostatItem(thermostat, { name, waiting, units, language }) {
  const room = formatTemperature(thermostat.room, units, language);
  const setpoint = formatTemperature(thermostat.setpoint, units, language);
  const humidity = thermostat.humidity !== null ? ` · ${Math.round(thermostat.humidity)} %` : '';
  return {
    title: name.slice(0, 60),
    subtitle: `${room} → ${setpoint}${humidity}`,
    ...(waiting ? { badge: { text: t('sending', language), color: WIDGET_COLORS.WARNING } } : {}),
  };
}

/**
 * @description The heat pump widget.
 * @param {object} options - Options.
 * @param {object|null} options.product - The parsed T.One (null: none).
 * @param {string} options.name - Its name.
 * @param {Array<{model: object, name: string, waiting: boolean}>} options.thermostats - Its rooms.
 * @param {boolean} [options.waiting] - A mode command is not confirmed yet.
 * @param {string} options.connection - The connection state.
 * @param {number} options.lastSuccessAt - Last successful reading (ms, 0: never).
 * @param {string} options.language - The language.
 * @param {string} [options.units] - metric or us.
 * @param {number} options.now - Now (ms).
 * @returns {object} The content.
 */
function buildHeatPumpWidget({
  product,
  name = '',
  thermostats = [],
  waiting = false,
  connection,
  lastSuccessAt,
  language,
  units = 'metric',
  now,
}) {
  const components = [];
  if (!product) {
    components.push(emptyText(connection, 'emptyHeatPump', language));
    components.push(refreshButton(language));
    return { ttl_seconds: TTL_SECONDS, components };
  }
  if (product.temperature !== null) {
    components.push({
      type: 'value',
      value: formatTemperature(product.temperature, units, language),
      label: t('tileMainTemperature', language),
      icon: 'thermometer',
    });
  }
  if (product.hasWater && product.hotWater !== null) {
    components.push({
      type: 'value',
      value: Math.round(product.hotWater),
      unit: '%',
      label: t('tileHotWater', language),
      icon: 'droplet',
      color: product.hotWater <= 20 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.INFO,
    });
  }
  if (thermostats.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: thermostats
        .slice(0, MAX_ITEMS)
        .map(({ model, name: room, waiting: busy }) =>
          thermostatItem(model, { name: room, waiting: busy, units, language }),
        ),
    });
  }
  const air = product.airMode ? t(`air_${product.airMode}`, language) : t('unknown', language);
  const rows = [
    {
      label: t('rowAirMode', language),
      value: waiting ? t('sending', language) : air,
      color: waiting
        ? WIDGET_COLORS.WARNING
        : /^heat_/.test(product.airMode ?? '')
          ? WIDGET_COLORS.DANGER
          : /^cool_/.test(product.airMode ?? '')
            ? WIDGET_COLORS.INFO
            : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (product.hasWater && product.waterMode) {
    rows.push({
      label: t('rowHotWaterMode', language),
      value: t(`water_${product.waterMode}`, language),
      color: product.waterMode === 'boost' ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (holidayActive(product, now)) {
    rows.push({
      label: t('rowHoliday', language),
      value: t('holidayUntil', language, { end: formatDay(product.holidayEnd, language) }),
      color: WIDGET_COLORS.INFO,
    });
  }
  rows.push(...commonRows({ product, name, connection, lastSuccessAt, language, now }));
  components.push({ type: 'status', items: rows });
  components.push(refreshButton(language));
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  WIDGETS,
  WIDGET_ACTIONS,
  WIDGET_BOOST_MINUTES,
  MAX_ITEMS,
  CO2_GOOD,
  CO2_FAIR,
  formatTemperature,
  formatDay,
  formatTime,
  co2Color,
  filterColor,
  thermostatItem,
  buildVentilationWidget,
  buildHeatPumpWidget,
};
