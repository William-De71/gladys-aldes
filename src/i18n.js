// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, mode labels, widget contents, toasts, messages of
// the Configuration screen. Vocabulary of the Gladys interface: appareil /
// Gerät / dispositivo, scène / Szene / escena, consigne / Solltemperatur /
// consigna; and of the AldesConnect app: Quotidien, Boost, Invités, Vacances,
// Programmation; Confort, Éco, Programme A…D.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // device names
  thermostatName: {
    en: 'Thermostat {id}',
    fr: 'Thermostat {id}',
    de: 'Thermostat {id}',
    es: 'Termostato {id}',
  },

  // feature names (Discovery, device page)
  feature_ventilation_mode: {
    en: 'Ventilation mode',
    fr: 'Mode de ventilation',
    de: 'Lüftungsmodus',
    es: 'Modo de ventilación',
  },
  feature_ventilation_co2: { en: 'CO2', fr: 'CO2', de: 'CO2', es: 'CO2' },
  feature_ventilation_temperature_kitchen: {
    en: 'Kitchen temperature',
    fr: 'Température cuisine',
    de: 'Temperatur Küche',
    es: 'Temperatura cocina',
  },
  feature_ventilation_humidity_kitchen: {
    en: 'Kitchen humidity',
    fr: 'Humidité cuisine',
    de: 'Feuchte Küche',
    es: 'Humedad cocina',
  },
  feature_temperature_bathroom: {
    en: 'Bathroom {n} temperature',
    fr: 'Température salle de bain {n}',
    de: 'Temperatur Bad {n}',
    es: 'Temperatura baño {n}',
  },
  feature_humidity_bathroom: {
    en: 'Bathroom {n} humidity',
    fr: 'Humidité salle de bain {n}',
    de: 'Feuchte Bad {n}',
    es: 'Humedad baño {n}',
  },
  feature_ventilation_filter_life: {
    en: 'Filter life',
    fr: 'Durée de vie du filtre',
    de: 'Filterrestlaufzeit',
    es: 'Vida útil del filtro',
  },
  feature_heat_pump_air_mode: {
    en: 'Air mode',
    fr: 'Mode air',
    de: 'Luftmodus',
    es: 'Modo aire',
  },
  feature_heat_pump_hot_water_mode: {
    en: 'Hot water mode',
    fr: 'Mode eau chaude',
    de: 'Warmwassermodus',
    es: 'Modo agua caliente',
  },
  feature_heat_pump_hot_water_level: {
    en: 'Hot water available',
    fr: 'Eau chaude disponible',
    de: 'Verfügbares Warmwasser',
    es: 'Agua caliente disponible',
  },
  feature_heat_pump_temperature: {
    en: 'Main temperature',
    fr: 'Température principale',
    de: 'Haupttemperatur',
    es: 'Temperatura principal',
  },
  feature_thermostat_target_temperature: {
    en: 'Setpoint',
    fr: 'Consigne',
    de: 'Solltemperatur',
    es: 'Consigna',
  },
  feature_thermostat_temperature: {
    en: 'Room temperature',
    fr: 'Température de la pièce',
    de: 'Raumtemperatur',
    es: 'Temperatura ambiente',
  },
  feature_thermostat_humidity: {
    en: 'Room humidity',
    fr: 'Humidité de la pièce',
    de: 'Raumfeuchte',
    es: 'Humedad ambiente',
  },

  // ventilation modes
  vmc_daily: { en: 'Daily', fr: 'Quotidien', de: 'Täglich', es: 'Diario' },
  vmc_boost: { en: 'Boost', fr: 'Boost', de: 'Boost', es: 'Boost' },
  vmc_guests: { en: 'Guests', fr: 'Invités', de: 'Gäste', es: 'Invitados' },
  vmc_holidays: { en: 'Holidays', fr: 'Vacances', de: 'Urlaub', es: 'Vacaciones' },
  vmc_schedule: { en: 'Schedule', fr: 'Programmation', de: 'Zeitprogramm', es: 'Programación' },

  // T.One air modes
  air_off: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  air_heat_comfort: {
    en: 'Heating comfort',
    fr: 'Chauffage confort',
    de: 'Heizen Komfort',
    es: 'Calefacción confort',
  },
  air_heat_eco: {
    en: 'Heating eco',
    fr: 'Chauffage éco',
    de: 'Heizen Eco',
    es: 'Calefacción eco',
  },
  air_heat_prog_a: {
    en: 'Heating program A',
    fr: 'Chauffage programme A',
    de: 'Heizen Programm A',
    es: 'Calefacción programa A',
  },
  air_heat_prog_b: {
    en: 'Heating program B',
    fr: 'Chauffage programme B',
    de: 'Heizen Programm B',
    es: 'Calefacción programa B',
  },
  air_cool_comfort: {
    en: 'Cooling comfort',
    fr: 'Rafraîchissement confort',
    de: 'Kühlen Komfort',
    es: 'Refrigeración confort',
  },
  air_cool_boost: {
    en: 'Cooling boost',
    fr: 'Rafraîchissement boost',
    de: 'Kühlen Boost',
    es: 'Refrigeración boost',
  },
  air_cool_prog_c: {
    en: 'Cooling program C',
    fr: 'Rafraîchissement programme C',
    de: 'Kühlen Programm C',
    es: 'Refrigeración programa C',
  },
  air_cool_prog_d: {
    en: 'Cooling program D',
    fr: 'Rafraîchissement programme D',
    de: 'Kühlen Programm D',
    es: 'Refrigeración programa D',
  },

  // T.One hot water modes
  water_off: { en: 'Off', fr: 'Arrêt', de: 'Aus', es: 'Apagado' },
  water_on: { en: 'On', fr: 'Marche', de: 'Ein', es: 'Encendido' },
  water_boost: { en: 'Boost', fr: 'Boost', de: 'Boost', es: 'Boost' },

  // widgets
  tileCo2: { en: 'CO2', fr: 'CO2', de: 'CO2', es: 'CO2' },
  tileKitchenTemperature: { en: 'Kitchen', fr: 'Cuisine', de: 'Küche', es: 'Cocina' },
  tileKitchenHumidity: {
    en: 'Kitchen humidity',
    fr: 'Humidité cuisine',
    de: 'Feuchte Küche',
    es: 'Humedad cocina',
  },
  tileFilter: { en: 'Filter', fr: 'Filtre', de: 'Filter', es: 'Filtro' },
  tileMainTemperature: { en: 'Indoor', fr: 'Intérieur', de: 'Innen', es: 'Interior' },
  tileHotWater: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  rowMode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
  rowBoostUntil: {
    en: 'Boost until',
    fr: 'Boost jusqu’à',
    de: 'Boost bis',
    es: 'Boost hasta',
  },
  rowAirMode: { en: 'Air', fr: 'Air', de: 'Luft', es: 'Aire' },
  rowHotWaterMode: { en: 'Hot water', fr: 'Eau chaude', de: 'Warmwasser', es: 'Agua caliente' },
  rowHoliday: { en: 'Holiday', fr: 'Vacances', de: 'Urlaub', es: 'Vacaciones' },
  holidayUntil: { en: 'until {end}', fr: 'jusqu’au {end}', de: 'bis {end}', es: 'hasta el {end}' },
  rowProduct: { en: 'Product', fr: 'Produit', de: 'Produkt', es: 'Producto' },
  rowConnection: {
    en: 'AldesConnect',
    fr: 'AldesConnect',
    de: 'AldesConnect',
    es: 'AldesConnect',
  },
  rowLastReading: {
    en: 'Last reading',
    fr: 'Dernier relevé',
    de: 'Letzte Abfrage',
    es: 'Última lectura',
  },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  sending: { en: 'Sending…', fr: 'Envoi…', de: 'Wird gesendet…', es: 'Enviando…' },
  buttonBoost: {
    en: 'Boost {n} min',
    fr: 'Boost {n} min',
    de: 'Boost {n} Min.',
    es: 'Boost {n} min',
  },
  buttonDaily: { en: 'Daily', fr: 'Quotidien', de: 'Täglich', es: 'Diario' },
  buttonRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  emptyVentilation: {
    en: 'No Aldes ventilation unit on this account.',
    fr: 'Aucune VMC Aldes sur ce compte.',
    de: 'Kein Aldes-Lüftungsgerät in diesem Konto.',
    es: 'Ninguna VMC Aldes en esta cuenta.',
  },
  emptyHeatPump: {
    en: 'No Aldes T.One heat pump on this account.',
    fr: 'Aucune pompe à chaleur Aldes T.One sur ce compte.',
    de: 'Keine Aldes-T.One-Wärmepumpe in diesem Konto.',
    es: 'Ninguna bomba de calor Aldes T.One en esta cuenta.',
  },

  // connection
  connection_ok: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  connection_unknown: { en: 'Starting', fr: 'Démarrage', de: 'Startet', es: 'Iniciando' },
  connection_unconfigured: {
    en: 'Not configured',
    fr: 'Non configuré',
    de: 'Nicht eingerichtet',
    es: 'Sin configurar',
  },
  connection_refused: {
    en: 'Credentials refused',
    fr: 'Identifiants refusés',
    de: 'Zugangsdaten abgelehnt',
    es: 'Credenciales rechazadas',
  },
  connection_rate_limited: {
    en: 'Too many requests',
    fr: 'Trop de requêtes',
    de: 'Zu viele Anfragen',
    es: 'Demasiadas peticiones',
  },
  connection_error: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  connection_unknown_hint: {
    en: 'Waiting for the first reading of AldesConnect.',
    fr: 'En attente du premier relevé AldesConnect.',
    de: 'Warten auf die erste Abfrage von AldesConnect.',
    es: 'Esperando la primera lectura de AldesConnect.',
  },
  connection_unconfigured_hint: {
    en: 'Enter the e-mail and the password of your AldesConnect account in the configuration of the integration.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte AldesConnect dans la configuration de l’intégration.',
    de: 'Geben Sie E-Mail und Passwort Ihres AldesConnect-Kontos in der Konfiguration der Integration ein.',
    es: 'Introduzca el correo y la contraseña de su cuenta AldesConnect en la configuración de la integración.',
  },
  connection_refused_hint: {
    en: 'Aldes refuses the e-mail or the password. Check them by signing in to the AldesConnect app.',
    fr: 'Aldes refuse l’e-mail ou le mot de passe. Vérifiez-les en vous connectant à l’application AldesConnect.',
    de: 'Aldes lehnt E-Mail oder Passwort ab. Prüfen Sie beides durch Anmelden in der AldesConnect-App.',
    es: 'Aldes rechaza el correo o la contraseña. Compruébelos iniciando sesión en la app AldesConnect.',
  },
  connection_rate_limited_hint: {
    en: 'Aldes asks to slow down: the integration waits longer between two readings, then goes back to normal by itself.',
    fr: 'Aldes demande de ralentir : l’intégration espace ses relevés, puis revient d’elle-même au rythme normal.',
    de: 'Aldes bittet um weniger Anfragen: Die Integration fragt seltener ab und kehrt dann von selbst zum normalen Takt zurück.',
    es: 'Aldes pide reducir el ritmo: la integración espacia sus lecturas y vuelve sola al ritmo normal.',
  },
  connection_error_hint: {
    en: 'AldesConnect does not answer. Check the Internet connection of Gladys; the integration tries again at every reading.',
    fr: 'AldesConnect ne répond pas. Vérifiez la connexion Internet de Gladys ; l’intégration réessaie à chaque relevé.',
    de: 'AldesConnect antwortet nicht. Prüfen Sie die Internetverbindung von Gladys; die Integration versucht es bei jeder Abfrage erneut.',
    es: 'AldesConnect no responde. Compruebe la conexión a Internet de Gladys; la integración lo reintenta en cada lectura.',
  },
  never: { en: 'never', fr: 'jamais', de: 'nie', es: 'nunca' },
  justNow: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  minutesAgo: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  hoursAgo: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  daysAgo: { en: '{n} days ago', fr: 'il y a {n} jours', de: 'vor {n} Tagen', es: 'hace {n} días' },

  // Configuration screen (setConnectionStatus) and its button
  statusUnconfigured: {
    en: 'Enter the e-mail and the password of your AldesConnect account.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte AldesConnect.',
    de: 'Geben Sie E-Mail und Passwort Ihres AldesConnect-Kontos ein.',
    es: 'Introduzca el correo y la contraseña de su cuenta AldesConnect.',
  },
  statusRefused: {
    en: 'Aldes refused the e-mail or the password ({reason}). Check them in the AldesConnect app; the integration tries again every 30 minutes or as soon as they change.',
    fr: 'Aldes a refusé l’e-mail ou le mot de passe ({reason}). Vérifiez-les dans l’application AldesConnect ; l’intégration réessaie toutes les 30 minutes ou dès qu’ils changent.',
    de: 'Aldes hat E-Mail oder Passwort abgelehnt ({reason}). Prüfen Sie sie in der AldesConnect-App; die Integration versucht es alle 30 Minuten oder sobald sie sich ändern.',
    es: 'Aldes rechazó el correo o la contraseña ({reason}). Compruébelos en la app AldesConnect; la integración lo reintenta cada 30 minutos o en cuanto cambian.',
  },
  statusRateLimited: {
    en: 'Aldes asks to slow down: next reading in {n} min.',
    fr: 'Aldes demande de ralentir : prochain relevé dans {n} min.',
    de: 'Aldes bittet um weniger Anfragen: nächste Abfrage in {n} Min.',
    es: 'Aldes pide reducir el ritmo: próxima lectura en {n} min.',
  },
  statusError: {
    en: 'AldesConnect cannot be reached ({error}). The integration tries again at every reading.',
    fr: 'AldesConnect est injoignable ({error}). L’intégration réessaie à chaque relevé.',
    de: 'AldesConnect ist nicht erreichbar ({error}). Die Integration versucht es bei jeder Abfrage erneut.',
    es: 'AldesConnect no está accesible ({error}). La integración lo reintenta en cada lectura.',
  },
  statusNoProduct: {
    en: 'Connected, but this AldesConnect account has no ventilation unit nor T.One the integration handles.',
    fr: 'Connecté, mais ce compte AldesConnect n’a aucune VMC ni T.One que l’intégration sait gérer.',
    de: 'Verbunden, aber dieses AldesConnect-Konto hat kein Lüftungsgerät und keine T.One, die die Integration unterstützt.',
    es: 'Conectado, pero esta cuenta AldesConnect no tiene ninguna VMC ni T.One que la integración gestione.',
  },
  statusOk: {
    en: 'Connected: {count} product(s), {rooms} room thermostat(s), read every {minutes} min.',
    fr: 'Connecté : {count} produit(s), {rooms} thermostat(s) de pièce, relevés toutes les {minutes} min.',
    de: 'Verbunden: {count} Produkt(e), {rooms} Raumthermostat(e), Abfrage alle {minutes} Min.',
    es: 'Conectado: {count} producto(s), {rooms} termostato(s) de estancia, lectura cada {minutes} min.',
  },
  testItem: {
    en: '{name}: {what} ({features} features)',
    fr: '{name} : {what} ({features} fonctionnalités)',
    de: '{name}: {what} ({features} Funktionen)',
    es: '{name}: {what} ({features} funciones)',
  },
  testOk: {
    en: 'Connected. {count} device(s) to add in Discovery: {list}',
    fr: 'Connecté. {count} appareil(s) à ajouter dans Découverte : {list}',
    de: 'Verbunden. {count} Gerät(e) zum Hinzufügen unter Entdecken: {list}',
    es: 'Conectado. {count} dispositivo(s) para añadir en Descubrir: {list}',
  },
  testIgnored: {
    en: ' Not handled: {list}.',
    fr: ' Non gérés : {list}.',
    de: ' Nicht unterstützt: {list}.',
    es: ' No gestionados: {list}.',
  },

  // toasts of the widget buttons
  toastBoost: {
    en: 'Boost until {until}.',
    fr: 'Boost jusqu’à {until}.',
    de: 'Boost bis {until}.',
    es: 'Boost hasta las {until}.',
  },
  toastDaily: {
    en: 'Back to daily ventilation.',
    fr: 'Retour à la ventilation quotidienne.',
    de: 'Zurück zur täglichen Lüftung.',
    es: 'Vuelta a la ventilación diaria.',
  },
  toastOffline: {
    en: 'The ventilation unit is offline: Aldes cannot pass the command on.',
    fr: 'La VMC est hors ligne : Aldes ne peut pas lui transmettre la commande.',
    de: 'Das Lüftungsgerät ist offline: Aldes kann den Befehl nicht weitergeben.',
    es: 'La VMC está sin conexión: Aldes no puede transmitirle la orden.',
  },
  toastFailed: {
    en: 'AldesConnect: {error}',
    fr: 'AldesConnect : {error}',
    de: 'AldesConnect: {error}',
    es: 'AldesConnect: {error}',
  },
  toastRefreshed: {
    en: 'Read: {n} product(s).',
    fr: 'Relevé : {n} produit(s).',
    de: 'Gelesen: {n} Produkt(e).',
    es: 'Leído: {n} producto(s).',
  },
};

const isLanguage = (language) => LANGUAGES.includes(language);

/**
 * @description Whether a text exists.
 * @param {string} key - The TEXTS key.
 * @returns {boolean} It exists.
 */
const has = (key) => Object.hasOwn(TEXTS, key);

/**
 * @description A text in a language, with its `{name}` placeholders replaced.
 * @param {string} key - The TEXTS key.
 * @param {string} language - en, fr, de or es (English otherwise).
 * @param {object} [values] - The substitutions.
 * @returns {string} The text (the key itself when unknown).
 * @example
 * t('minutesAgo', 'fr', { n: 3 }); // -> 'il y a 3 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) return key;
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string|Function} key - The TEXTS key, or `(language) => string`.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      typeof key === 'function' ? key(language) : t(key, language, values),
    ]),
  );
}

const locale = (language) => (isLanguage(language) ? language : 'en');

/**
 * @description A number written in a language ("20,5", "20.5").
 * @param {number} n - The number.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
const formatNumber = (n, language) =>
  new Intl.NumberFormat(locale(language), { maximumFractionDigits: 1 }).format(n);

/**
 * @description How long ago an instant was: "just now", "12 min ago".
 * @param {number} at - The instant, in ms (0: never).
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function ago(at, now, language) {
  if (!at) return t('never', language);
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return t('justNow', language);
  if (minutes < 60) return t('minutesAgo', language, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('hoursAgo', language, { n: hours });
  return t('daysAgo', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, has, t, all, formatNumber, ago };
