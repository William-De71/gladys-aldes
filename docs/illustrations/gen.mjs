// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a made-up home, on a fixed morning (Sunday 15 November
// 2026, 8:42 in Paris): an InspirAIR ventilation unit on its schedule, running
// in daily speed, a CO2 a bit high after the night, a filter half worn; a T.One
// AquaAIR heating in comfort, with three rooms and a hot water tank two thirds
// full.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildVentilationWidget, buildHeatPumpWidget } = await load('src/widgets.js');
const { parseProducts } = await load('src/aldes.js');
const { deviceName } = await load('src/device.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const NOW = Date.parse('2026-11-15T07:42:00Z');
const TIMEZONE = 'Europe/Paris';
const PRODUCTS = [
  {
    modem: 'VMC1',
    reference: 'INSPIRAIR_HOME_S',
    isConnected: true,
    hasFilter: true,
    usureFiltre: '55',
    indicators: [{ type: 'MODE', value: 'ZV' }],
    indicator: { CO2: 870, TmpCu: 206, HrCu: 52, TmpBa1: 224, HrBa1: 68 },
  },
  {
    modem: 'TONE1',
    reference: 'TONE_AQUA_AIR',
    isConnected: true,
    indicator: {
      current_air_mode: 'B',
      current_water_mode: 'M',
      qte_eau_chaude: 68,
      tmp_principal: 20.3,
      cmist: 16,
      cmast: 28,
      thermostats: [
        { ThermostatId: 1, TemperatureSet: 21, CurrentTemperature: 20.6 },
        { ThermostatId: 2, TemperatureSet: 19, CurrentTemperature: 19.3 },
        { ThermostatId: 3, TemperatureSet: 18, CurrentTemperature: 17.4 },
      ],
    },
  },
];
const ROOMS = {
  en: ['Living room', 'Bedroom', 'Office'],
  fr: ['Salon', 'Chambre', 'Bureau'],
  de: ['Wohnzimmer', 'Schlafzimmer', 'Büro'],
  es: ['Salón', 'Dormitorio', 'Despacho'],
};

const contents = {};
for (const language of LANGUAGES) {
  const parsed = parseProducts(PRODUCTS);
  const [vmc, tone] = parsed.products;
  const rooms = parsed.thermostats.map((model, i) => ({
    model: { ...model, name: ROOMS[language][i] },
    name: ROOMS[language][i],
    waiting: i === 1,
  }));
  contents[language] = {
    ventilation: buildVentilationWidget({
      product: vmc,
      name: deviceName(vmc, language),
      connection: 'ok',
      lastSuccessAt: NOW - 60 * 1000,
      language,
      units: 'metric',
      timezone: TIMEZONE,
      now: NOW,
    }),
    heat_pump: buildHeatPumpWidget({
      product: tone,
      name: deviceName(tone, language),
      thermostats: rooms,
      connection: 'ok',
      lastSuccessAt: NOW - 60 * 1000,
      language,
      units: 'metric',
      now: NOW,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
