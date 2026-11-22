// -----------------------------------------------------------------------------
// The Gladys devices: one per ventilation unit, one per T.One heat pump, one
// per room thermostat of a T.One.
//
// Ventilation unit (external id `…:ventilation:<modem>`):
//
//   key                     category / type                    unit     writable
//   mode                    text / select                      -        yes (daily, boost, guests, holidays, schedule)
//   co2                     co2-sensor / decimal               ppm      no  (with a CO2 sensor)
//   temperature_kitchen     temperature-sensor / decimal       celsius  no
//   humidity_kitchen        humidity-sensor / decimal          percent  no
//   temperature_bathroom_N  temperature-sensor / decimal       celsius  no  (N = 1 to 5)
//   humidity_bathroom_N     humidity-sensor / decimal          percent  no
//   filter_life             maintenance / life-remaining       percent  no  (when Aldes gives the wear)
//
// T.One heat pump (`…:heat_pump:<modem>`):
//
//   air_mode                text / select                      -        yes (off, heating and cooling modes)
//   hot_water_mode          water-heater / mode                -        yes (off, on, boost; AquaAIR)
//   hot_water_level         water-heater / remaining-hot-water percent  no  (AquaAIR)
//   temperature             temperature-sensor / decimal       celsius  no
//
// Room thermostat (`…:thermostat:<modem>:<ThermostatId>`):
//
//   target_temperature      thermostat / target-temperature    celsius  yes (whole degrees)
//   temperature             temperature-sensor / decimal       celsius  no
//   humidity                humidity-sensor / decimal          percent  no  (when measured)
//
// A feature appears only when the product reports its value. The feature
// keys, categories, types, units and bounds are forever (the Discovery
// "Update" button compares them): see test/structure.test.js.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { WATER_HEATER_MODE } from './constants.js';
import { KINDS, AIR_MODES, BATHROOMS, SETPOINT_MIN, SETPOINT_MAX } from './aldes.js';
import { t } from './i18n.js';

const writable = { read_only: false, has_feedback: true };
const readOnly = { read_only: true, has_feedback: false };
// T.One setpoints go by whole degrees.
const SETPOINT_STEP = 1;
// The ventilation modes offered, in the order of the app.
const VENTILATION_OPTIONS = ['daily', 'boost', 'guests', 'holidays', 'schedule'];
const AIR_OPTIONS = Object.values(AIR_MODES);
// Hot water mode of a T.One AquaAIR <-> water-heater/mode of Gladys.
const WATER_HEATER_OF = { off: WATER_HEATER_MODE.OFF, on: WATER_HEATER_MODE.MANUAL };
WATER_HEATER_OF.boost = WATER_HEATER_MODE.BOOST;
const WATER_MODE_OF = Object.fromEntries(
  Object.entries(WATER_HEATER_OF).map(([mode, value]) => [value, mode]),
);

const round = (value, digits = 1) =>
  value === null || value === undefined ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const num = (getter) => (model) => round(getter(model));

const temperature = (key, getter) => ({
  key,
  category: CATEGORIES.TEMPERATURE_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.CELSIUS,
  min: -20,
  max: 60,
  ...readOnly,
  present: (model) => getter(model) !== null && getter(model) !== undefined,
  value: num(getter),
});

const humidity = (key, getter) => ({
  key,
  category: CATEGORIES.HUMIDITY_SENSOR,
  type: TYPES.SENSOR.DECIMAL,
  unit: UNITS.PERCENT,
  min: 0,
  max: 100,
  ...readOnly,
  present: (model) => getter(model) !== null && getter(model) !== undefined,
  value: num(getter),
});

const bathroom = (model, n) => model.bathrooms?.find((item) => item.n === n) ?? {};

// Order = order of the features in Gladys. `present` decides from the parsed
// model; `value` gives the state (null: nothing to publish), `text` a string
// state; `options` gives the supported options.
const VENTILATION_FEATURES = [
  {
    key: 'mode',
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.SELECT,
    min: 0,
    max: 0,
    ...writable,
    options: (language) =>
      VENTILATION_OPTIONS.map((mode, index) => ({
        value: mode,
        label: t(`vmc_${mode}`, language),
        sort_order: index,
      })),
    present: () => true,
    text: (model) => model.mode,
  },
  {
    key: 'co2',
    category: CATEGORIES.CO2_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.PPM,
    min: 0,
    max: 5000,
    ...readOnly,
    present: (model) => model.co2 !== null,
    value: (model) => round(model.co2, 0),
  },
  temperature('temperature_kitchen', (model) => model.kitchen?.temperature ?? null),
  humidity('humidity_kitchen', (model) => model.kitchen?.humidity ?? null),
  ...BATHROOMS.flatMap((n) => [
    temperature(`temperature_bathroom_${n}`, (model) => bathroom(model, n).temperature ?? null),
    humidity(`humidity_bathroom_${n}`, (model) => bathroom(model, n).humidity ?? null),
  ]),
  {
    key: 'filter_life',
    category: CATEGORIES.MAINTENANCE,
    type: TYPES.MAINTENANCE.LIFE_REMAINING,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
    ...readOnly,
    present: (model) => model.filter?.life !== null && model.filter?.life !== undefined,
    value: (model) => model.filter.life,
  },
];

const HEAT_PUMP_FEATURES = [
  {
    key: 'air_mode',
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.SELECT,
    min: 0,
    max: 0,
    ...writable,
    options: (language) =>
      AIR_OPTIONS.map((mode, index) => ({
        value: mode,
        label: t(`air_${mode}`, language),
        sort_order: index,
      })),
    present: () => true,
    text: (model) => model.airMode,
  },
  {
    key: 'hot_water_mode',
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.MODE,
    min: WATER_HEATER_MODE.OFF,
    max: WATER_HEATER_MODE.MANUAL,
    ...writable,
    options: (language) => [
      { value: WATER_HEATER_MODE.MANUAL, label: t('water_on', language), sort_order: 0 },
      { value: WATER_HEATER_MODE.BOOST, label: t('water_boost', language), sort_order: 1 },
      { value: WATER_HEATER_MODE.OFF, label: t('water_off', language), sort_order: 2 },
    ],
    present: (model) => model.hasWater,
    value: (model) => (model.waterMode ? WATER_HEATER_OF[model.waterMode] : null),
  },
  {
    key: 'hot_water_level',
    category: CATEGORIES.WATER_HEATER,
    type: TYPES.WATER_HEATER.REMAINING_HOT_WATER,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
    ...readOnly,
    present: (model) => model.hasWater && model.hotWater !== null,
    value: (model) => round(model.hotWater, 0),
  },
  temperature('temperature', (model) => model.temperature),
];

const THERMOSTAT_FEATURES = [
  {
    key: 'target_temperature',
    category: CATEGORIES.THERMOSTAT,
    type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
    unit: UNITS.CELSIUS,
    min: SETPOINT_MIN,
    max: SETPOINT_MAX,
    step: SETPOINT_STEP,
    ...writable,
    present: () => true,
    value: (model) => round(model.setpoint),
  },
  temperature('temperature', (model) => model.room),
  humidity('humidity', (model) => model.humidity),
];

const FEATURES_OF_KIND = {
  [KINDS.VENTILATION]: VENTILATION_FEATURES,
  [KINDS.HEAT_PUMP]: HEAT_PUMP_FEATURES,
  [KINDS.THERMOSTAT]: THERMOSTAT_FEATURES,
};

/**
 * @description The ids of a model. A modem is a MAC address; ids are
 * URI-encoded anyway so a colon could never cut a feature id.
 * @param {object} gladys - The Gladys client (externalIds).
 * @param {object} model - A parsed product or thermostat.
 * @returns {{ device: string, feature: Function }} The ids.
 */
function idsOf(gladys, model) {
  const platformId =
    model.kind === KINDS.THERMOSTAT
      ? `${encodeURIComponent(model.productId)}:${encodeURIComponent(String(model.thermostatId))}`
      : encodeURIComponent(model.id);
  return gladys.externalIds(model.kind, platformId);
}

/**
 * @description The features a model has.
 * @param {object} model - A parsed model.
 * @returns {object[]} The feature specs.
 */
function featuresOf(model) {
  return (FEATURES_OF_KIND[model.kind] ?? []).filter((f) => f.present(model));
}

/**
 * @description The name of a feature (bathrooms are numbered).
 * @param {object} model - A parsed model.
 * @param {string} key - The feature key.
 * @param {string} language - The language.
 * @returns {string} The name.
 */
function featureName(model, key, language) {
  const bath = /^(temperature|humidity)_bathroom_(\d)$/.exec(key);
  if (bath) return t(`feature_${bath[1]}_bathroom`, language, { n: bath[2] });
  return t(`feature_${model.kind}_${key}`, language);
}

/**
 * @description The name of a device: the name given in the app, else the model.
 * @param {object} model - A parsed model.
 * @param {string} [language] - The language.
 * @returns {string} The name.
 */
function deviceName(model, language = 'en') {
  if (model.kind === KINDS.THERMOSTAT) {
    return model.name || t('thermostatName', language, { id: model.thermostatId });
  }
  return model.name ? `${model.model} (${model.name})` : `Aldes ${model.model}`;
}

/**
 * @description The Discovery payload of a model.
 * @param {object} gladys - The Gladys client.
 * @param {object} model - A parsed model.
 * @param {string} language - Language of the feature names.
 * @returns {object} The device.
 */
function buildDevice(gladys, model, language = 'en') {
  const ids = idsOf(gladys, model);
  const params = [{ name: 'ALDES_KIND', value: model.kind }];
  if (model.kind === KINDS.THERMOSTAT) {
    params.push({ name: 'ALDES_MODEM', value: model.productId });
  } else if (model.reference) {
    params.push({ name: 'ALDES_REFERENCE', value: model.reference });
  }
  return {
    name: deviceName(model, language),
    external_id: ids.device,
    model: model.kind === KINDS.THERMOSTAT ? 'T.One' : model.model,
    should_poll: false,
    params,
    features: featuresOf(model).map((feature) => {
      // eslint-disable-next-line no-unused-vars
      const { key, present, value, text, options, ...fields } = feature;
      return {
        ...fields,
        name: featureName(model, key, language),
        external_id: ids.feature(key),
        ...(options ? { supported_options: options(language, model) } : {}),
      };
    }),
  };
}

/**
 * @description The states of a model.
 * @param {object} gladys - The Gladys client.
 * @param {object} model - A parsed model.
 * @returns {Array<object>} `{ device_feature_external_id, state }` or `{ …, text }`.
 */
function buildStates(gladys, model) {
  const ids = idsOf(gladys, model);
  return featuresOf(model).flatMap((feature) => {
    const id = ids.feature(feature.key);
    if (feature.text) {
      const text = feature.text(model);
      return typeof text === 'string' && text ? [{ device_feature_external_id: id, text }] : [];
    }
    const state = feature.value(model);
    return state === null || state === undefined ? [] : [{ device_feature_external_id: id, state }];
  });
}

/**
 * @description What Discovery would compare: a change republishes the list.
 * @param {object} gladys - The Gladys client.
 * @param {object[]} models - Parsed models.
 * @param {string} language - Language of the feature names.
 * @returns {string} A signature.
 */
function discoverySignature(gladys, models, language) {
  return JSON.stringify(
    models.map((model) => {
      const device = buildDevice(gladys, model, language);
      return [
        device.external_id,
        device.name,
        device.model,
        device.features.map((f) => [f.external_id, f.name, f.min, f.max, f.supported_options]),
      ];
    }),
  );
}

export {
  VENTILATION_FEATURES,
  HEAT_PUMP_FEATURES,
  THERMOSTAT_FEATURES,
  VENTILATION_OPTIONS,
  AIR_OPTIONS,
  WATER_HEATER_OF,
  WATER_MODE_OF,
  SETPOINT_STEP,
  idsOf,
  featuresOf,
  featureName,
  deviceName,
  buildDevice,
  buildStates,
  discoverySignature,
};
