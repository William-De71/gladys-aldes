# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- The Aldes products of an AldesConnect account through the service of the AldesConnect app, with the e-mail and the password of the account; every product read in one request every 1, 2, 5 or 10 minutes, a "Test the connection" button that also lists the products not handled.
- One device per ventilation unit (InspirAIR, EasyHOME PureAIR Compact Connect / Premium, Dee Fly Cube): ventilation mode (daily, boost, guests, holidays, schedule), CO2, temperature and humidity of the kitchen and of up to five bathrooms, filter life, each one when the unit reports it.
- One device per T.One heat pump: air mode (off, heating comfort / eco / program A or B, cooling comfort / boost / program C or D), hot water mode and hot water available on an AquaAIR, main temperature.
- One thermostat per room of a T.One: setpoint in whole degrees within the bounds of the heating or cooling mode, room temperature, humidity when measured.
- Commands shown at once and confirmed by the next reading; a product Aldes reports offline refuses them.
- Scene triggers: the mode changes (never a change Gladys asked for), a product goes offline or back online, a filter is due, a holiday starts or ends; each one filtered by product.
- Scene actions: set the ventilation mode, boost the ventilation for a duration then go back to the previous mode, set the T.One air mode, set the T.One hot water, set or cancel a holiday, read Aldes now.
- Dashboard widgets: the ventilation unit (CO2, kitchen, filter, mode, "Boost 30 min" and "Daily") and the T.One (indoor temperature, hot water, rooms, modes).
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.
