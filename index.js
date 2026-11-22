// -----------------------------------------------------------------------------
// Entry point of the Aldes external integration.
//
// The products of an AldesConnect account, through the e-mail and password of
// the AldesConnect app:
//   - devices: one per ventilation unit (InspirAIR, EasyHOME Connect /
//     Premium, Dee Fly Cube: mode, CO2, kitchen and bathroom temperature and
//     humidity, filter life), one per T.One heat pump (air mode, hot water
//     mode and level, main temperature) and one per room thermostat of a
//     T.One (setpoint, temperature), offered on the Discovery screen (see
//     src/device.js);
//   - scene triggers: the mode changes, a product goes offline or back
//     online, the filter is due, a holiday starts or ends;
//   - scene actions: a ventilation mode, a timed boost, a T.One air mode,
//     the hot water, a holiday, read now;
//   - dashboard widgets: the ventilation unit, the T.One.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: the language guess, the times of a boost)
// The SDK reads the first three: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { createAldesApi } from './src/aldes-api.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys, { api: createAldesApi({ userAgent: `gladys-aldes/${version}` }) });

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Aldes integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
