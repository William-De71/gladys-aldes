// -----------------------------------------------------------------------------
// Client of the AldesConnect cloud, the API behind the AldesConnect app
// (Azure App Service of Aldes). Aldes publishes no documentation: the routes
// and fields below are the ones the community projects for Home Assistant,
// Homebridge and MQTT use (see NOTICE). The answers of the login were checked
// against the real service on 2026-11-22.
//
//   POST {BASE}/oauth2/token        form grant_type=password (or refresh_token)
//        -> 200 { access_token, token_type, expires_in, refresh_token? }
//        -> wrong e-mail or password: 400
//           { "error": "invalid_grant", "error_description": "The user name or
//           password is incorrect." } (checked)
//   GET  {BASE}/aldesoc/v5/users/me/products                  every product
//   POST {BASE}/aldesoc/v5/users/me/products/{modem}/commands
//        { jsonrpc: "2.0", id, method: "changeMode", params: ["V"] }
//   PATCH {BASE}/aldesoc/v5/users/me/products/{modem}/updateThermostats
//        [{ ThermostatId, Name, TemperatureSet }]
//   -> no token or a refused token: 401 with an empty body (checked).
//
// - Requests go one at a time, a short pause apart: the API is not public,
//   the integration stays as discreet as the app.
// - The password and the tokens live in memory only: never logged, never in
//   /data, never in an error message. After a restart the integration logs in
//   again.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://aldesiotsuite-aldeswebapi.azurewebsites.net';
const PRODUCTS_PATH = '/aldesoc/v5/users/me/products';
const SCOPE = 'openid profile email offline_access';
// The key the AldesConnect app sends in the `apikey` header (public, in the
// app; the community integration for Home Assistant sends it too).
const APP_KEY = 'XQibgk1ozo1wjVQcvcoFQqMl3pjEwcRv';
// Two requests to the API are this far apart at least.
const MIN_INTERVAL_MS = 500;
const TIMEOUT_MS = 30 * 1000;
// A 429 without Retry-After asks to wait this long.
const RATE_LIMIT_WAIT_MS = 5 * 60 * 1000;
// A token is renewed this long before it expires.
const TOKEN_MARGIN_MS = 2 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** The e-mail / password pair is refused. */
class CredentialsError extends Error {
  /**
   * @param {string} reason - MISSING, BAD_CREDENTIALS, UNAUTHORIZED, or an OAuth error code.
   * @param {number|null} status - HTTP status.
   */
  constructor(reason, status = null) {
    super(`Aldes refused the credentials (${reason})`);
    this.name = 'CredentialsError';
    this.reason = reason;
    this.status = status;
  }
}

/** Aldes asks to slow down (429). */
class RateLimitError extends Error {
  /** @param {number} retryAfterMs - The wait before the next request. */
  constructor(retryAfterMs) {
    super('Aldes limits the requests');
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Any other HTTP error of the API. */
class ApiError extends Error {
  /**
   * @param {number} status - HTTP status.
   * @param {string} [detail] - A short detail, free of any secret.
   */
  constructor(status, detail = '') {
    super(`Aldes API error ${status}${detail ? ` (${detail})` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** The service cannot be reached (DNS, timeout, connection refused). */
class NetworkError extends Error {
  /** @param {string} message - What failed. */
  constructor(message) {
    super(`Aldes unreachable: ${message}`);
    this.name = 'NetworkError';
  }
}

/**
 * @description A short message of an error body.
 * @param {unknown} body - The parsed answer.
 * @returns {string} The message, 120 characters at most ('' when none).
 */
function errorDetail(body) {
  if (!body || typeof body !== 'object') return '';
  const text =
    [body.error_description, body.message, body.title, body.error, body.detail].find(
      (value) => typeof value === 'string' && value,
    ) ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * @description The Retry-After of an answer, in ms.
 * @param {Headers} headers - The headers.
 * @returns {number} The wait (RATE_LIMIT_WAIT_MS when absent).
 */
function retryAfter(headers) {
  const seconds = Number(headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : RATE_LIMIT_WAIT_MS;
}

/**
 * @description Create an AldesConnect API client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - `fetch` (tests).
 * @param {Function} [options.now] - `() => ms` (tests).
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @param {number} [options.minIntervalMs] - Spacing of two requests.
 * @param {number} [options.timeoutMs] - Timeout of a request.
 * @param {string} [options.userAgent] - User-Agent header.
 * @returns {object} The client.
 * @example
 * const api = createAldesApi();
 * api.setCredentials('me@example.com', 'password');
 * const products = await api.getProducts();
 */
function createAldesApi({
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  minIntervalMs = MIN_INTERVAL_MS,
  timeoutMs = TIMEOUT_MS,
  userAgent = 'gladys-aldes',
} = {}) {
  let email = '';
  let password = '';
  // { access, refresh, expiresAt }
  let tokens = null;
  let session = null;
  // Bumped by setCredentials: a login started with old credentials is dropped.
  let generation = 0;
  let queue = Promise.resolve();
  let nextSlot = 0;
  let commandId = 0;
  const sentAt = [];

  /** @description Forget the requests older than an hour. */
  function prune() {
    const limit = now() - HOUR_MS;
    while (sentAt.length && sentAt[0] < limit) sentAt.shift();
  }

  /**
   * @description One HTTP exchange (never throws on an HTTP status).
   * @param {string} path - The path after the base URL.
   * @param {object} init - fetch options.
   * @returns {Promise<{status: number, headers: Headers, body: unknown}>} The answer.
   */
  async function exchange(path, init) {
    sentAt.push(now());
    prune();
    let response;
    try {
      response = await fetchImpl(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json',
          apikey: APP_KEY,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? 'network');
      throw new NetworkError(reason);
    }
    const text = await response.text().catch(() => '');
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, headers: response.headers, body };
  }

  /**
   * @description Run a task in the queue, a pause after the previous one.
   * @param {Function} task - `() => Promise`.
   * @returns {Promise<unknown>} Its result.
   */
  function enqueue(task) {
    const run = async () => {
      const wait = nextSlot - now();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        nextSlot = now() + minIntervalMs;
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }

  /**
   * @description Call the token endpoint and keep the tokens.
   * @param {object} grant - The form fields.
   * @returns {Promise<void>}
   */
  async function requestToken(grant) {
    const answer = await exchange('/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(grant).toString(),
    });
    if (answer.status === 429) throw new RateLimitError(retryAfter(answer.headers));
    if (answer.status === 400 || answer.status === 401) {
      const code = String(answer.body?.error ?? '').slice(0, 40);
      throw new CredentialsError(
        !code || code === 'invalid_grant' ? 'BAD_CREDENTIALS' : code,
        answer.status,
      );
    }
    if (answer.status >= 400) throw new ApiError(answer.status, errorDetail(answer.body));
    const body = answer.body ?? {};
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new ApiError(answer.status, 'no token in the answer');
    }
    const lifetime = Number(body.expires_in);
    tokens = {
      access: body.access_token,
      refresh:
        typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
      expiresAt: now() + (Number.isFinite(lifetime) && lifetime > 0 ? lifetime * 1000 : HOUR_MS),
    };
  }

  /** @description Log in with the e-mail and the password. */
  async function login() {
    if (!email || !password) throw new CredentialsError('MISSING');
    await requestToken({ grant_type: 'password', username: email, password, scope: SCOPE });
  }

  /** @description Renew with the refresh token, else log in again. */
  async function renew() {
    if (tokens?.refresh) {
      try {
        await requestToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
        return;
      } catch (err) {
        if (err instanceof RateLimitError || err instanceof NetworkError) throw err;
        // An expired or revoked refresh token: log in again.
        tokens = null;
      }
    }
    await login();
  }

  /** @description A valid access token (shared by concurrent callers). */
  async function ensureToken() {
    if (tokens?.access && now() < tokens.expiresAt - TOKEN_MARGIN_MS) return;
    if (!session) {
      const started = generation;
      session = renew()
        .then(() => {
          // Credentials changed meanwhile: these tokens belong to the old ones.
          if (started !== generation) tokens = null;
        })
        .finally(() => {
          session = null;
        });
    }
    await session;
    if (!tokens?.access) throw new CredentialsError('UNAUTHORIZED');
  }

  /**
   * @description Call a route of the API (in the queue).
   * @param {string} method - GET, POST or PATCH.
   * @param {string} path - The path after the base URL.
   * @param {unknown} [payload] - The JSON body.
   * @returns {Promise<unknown>} The parsed answer.
   */
  function call(method, path, payload) {
    return enqueue(async () => {
      for (let renewed = false; ; renewed = true) {
        await ensureToken();
        const answer = await exchange(path, {
          method,
          headers: {
            Authorization: `Bearer ${tokens.access}`,
            ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        });
        if (answer.status === 429) throw new RateLimitError(retryAfter(answer.headers));
        if (answer.status === 401) {
          // A refused token: renew once, then give up.
          if (tokens) tokens.expiresAt = 0;
          if (renewed) throw new CredentialsError('UNAUTHORIZED', answer.status);
          continue;
        }
        if (answer.status >= 400) throw new ApiError(answer.status, errorDetail(answer.body));
        return answer.body;
      }
    });
  }

  const productPath = (modem) => `${PRODUCTS_PATH}/${encodeURIComponent(String(modem))}`;

  /**
   * @description Send a JSON-RPC command to a product.
   * @param {string} modem - The product.
   * @param {string} method - changeMode.
   * @param {string} value - Its only parameter.
   * @returns {Promise<void>}
   */
  async function command(modem, method, value) {
    commandId = (commandId % 1000000) + 1;
    await call('POST', `${productPath(modem)}/commands`, {
      jsonrpc: '2.0',
      id: commandId,
      method,
      params: [value],
    });
  }

  return {
    /**
     * @description Use these credentials from now on (drops the tokens).
     * @param {string} mail - The e-mail of the AldesConnect account.
     * @param {string} secret - Its password.
     */
    setCredentials(mail, secret) {
      const changed = (mail ?? '') !== email || (secret ?? '') !== password;
      email = mail ?? '';
      password = secret ?? '';
      if (changed) {
        tokens = null;
        generation += 1;
      }
    },
    hasCredentials: () => Boolean(email && password),
    /** @returns {Promise<object[]>} The products of the account. */
    async getProducts() {
      const body = await call('GET', PRODUCTS_PATH);
      return Array.isArray(body) ? body : [];
    },
    /**
     * @description Change the mode of a product (a letter, or the holiday command).
     * @param {string} modem - The product.
     * @param {string} mode - `V`, `Y`, `B`, `W20261201000000Z20261208000000Z`…
     * @returns {Promise<void>}
     */
    changeMode: (modem, mode) => command(modem, 'changeMode', mode),
    /**
     * @description Set the setpoint of a room thermostat of a T.One.
     * @param {string} modem - The product.
     * @param {object} thermostat - `{ id, name }` as Aldes returned them.
     * @param {number} setpoint - Whole degrees.
     * @returns {Promise<void>}
     */
    async setThermostat(modem, thermostat, setpoint) {
      await call('PATCH', `${productPath(modem)}/updateThermostats`, [
        { ThermostatId: thermostat.id, Name: thermostat.name, TemperatureSet: setpoint },
      ]);
    },
    /** @returns {number} Requests sent during the last hour. */
    requestsLastHour() {
      prune();
      return sentAt.length;
    },
  };
}

export {
  BASE_URL,
  PRODUCTS_PATH,
  APP_KEY,
  MIN_INTERVAL_MS,
  RATE_LIMIT_WAIT_MS,
  CredentialsError,
  RateLimitError,
  ApiError,
  NetworkError,
  errorDetail,
  createAldesApi,
};
