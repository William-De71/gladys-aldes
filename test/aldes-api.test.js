// The HTTP client against a fake fetch: login, refresh, renewal on a 401,
// errors, commands, and no secret in an error message.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_URL,
  PRODUCTS_PATH,
  APP_KEY,
  CredentialsError,
  RateLimitError,
  ApiError,
  NetworkError,
  errorDetail,
} from '../src/aldes-api.js';
import { apiWithFetch, TOKENS, BAD_LOGIN, PRODUCTS } from './helpers/fixtures.js';

const form = (init) => Object.fromEntries(new URLSearchParams(init.body));

test('logs in with the password grant, then reads the products with the token', async () => {
  const { api, fetch } = apiWithFetch((url) => {
    if (url.endsWith('/oauth2/token')) return TOKENS();
    return { status: 200, body: PRODUCTS };
  });
  api.setCredentials('me@example.com', 'p@ss word');
  const products = await api.getProducts();
  assert.equal(products.length, 3);
  const [login, read] = fetch.requests;
  assert.equal(login.url, `${BASE_URL}/oauth2/token`);
  assert.equal(login.method, 'POST');
  assert.deepEqual(form(login), {
    grant_type: 'password',
    username: 'me@example.com',
    password: 'p@ss word',
    scope: 'openid profile email offline_access',
  });
  assert.equal(login.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(read.url, `${BASE_URL}${PRODUCTS_PATH}`);
  assert.equal(read.headers.Authorization, 'Bearer access-1');
  assert.equal(read.headers.apikey, APP_KEY);
  assert.match(read.headers['User-Agent'], /^gladys-aldes/);
});

test('the token is kept, then renewed with the refresh token before it expires', async () => {
  let tokens = 0;
  const { api, fetch, clock } = apiWithFetch((url) => {
    if (url.endsWith('/oauth2/token')) {
      tokens += 1;
      return TOKENS(tokens);
    }
    return { status: 200, body: [] };
  });
  api.setCredentials('me@example.com', 'secret');
  await api.getProducts();
  await api.getProducts();
  assert.equal(tokens, 1);
  clock.now += 59 * 60 * 1000;
  await api.getProducts();
  assert.equal(tokens, 2);
  const refresh = fetch.requests.filter((r) => r.url.endsWith('/oauth2/token'))[1];
  assert.deepEqual(form(refresh), { grant_type: 'refresh_token', refresh_token: 'refresh-1' });
  assert.equal(fetch.requests.at(-1).headers.Authorization, 'Bearer access-2');
});

test('a refused refresh token logs in again with the password', async () => {
  const grants = [];
  const { api, clock } = apiWithFetch((url, init) => {
    if (url.endsWith('/oauth2/token')) {
      const grant = form(init).grant_type;
      grants.push(grant);
      return grant === 'refresh_token' ? BAD_LOGIN : TOKENS(grants.length);
    }
    return { status: 200, body: [] };
  });
  api.setCredentials('me@example.com', 'secret');
  await api.getProducts();
  clock.now += 2 * 60 * 60 * 1000;
  await api.getProducts();
  assert.deepEqual(grants, ['password', 'refresh_token', 'password']);
});

test('a 401 renews the token once, a second 401 is a credentials error', async () => {
  let reads = 0;
  const { api } = apiWithFetch((url) => {
    if (url.endsWith('/oauth2/token')) return TOKENS();
    reads += 1;
    return reads === 1 ? { status: 401 } : { status: 200, body: [] };
  });
  api.setCredentials('me@example.com', 'secret');
  assert.deepEqual(await api.getProducts(), []);
  assert.equal(reads, 2);

  const { api: refused } = apiWithFetch((url) =>
    url.endsWith('/oauth2/token') ? TOKENS() : { status: 401 },
  );
  refused.setCredentials('me@example.com', 'secret');
  await assert.rejects(refused.getProducts(), (err) => {
    assert.ok(err instanceof CredentialsError);
    assert.equal(err.reason, 'UNAUTHORIZED');
    return true;
  });
});

test('a wrong e-mail or password (400 invalid_grant) is BAD_CREDENTIALS, without the secret', async () => {
  const { api } = apiWithFetch(() => BAD_LOGIN);
  api.setCredentials('me@example.com', 'very-secret-password');
  await assert.rejects(api.getProducts(), (err) => {
    assert.ok(err instanceof CredentialsError);
    assert.equal(err.reason, 'BAD_CREDENTIALS');
    assert.equal(err.status, 400);
    assert.doesNotMatch(err.message, /very-secret|me@example/);
    return true;
  });
});

test('another OAuth error keeps its code', async () => {
  const { api } = apiWithFetch(() => ({ status: 400, body: { error: 'unauthorized_client' } }));
  api.setCredentials('me@example.com', 'secret');
  await assert.rejects(api.getProducts(), (err) => err.reason === 'unauthorized_client');
});

test('without credentials nothing is sent', async () => {
  const { api, fetch } = apiWithFetch(() => TOKENS());
  assert.equal(api.hasCredentials(), false);
  await assert.rejects(api.getProducts(), (err) => err.reason === 'MISSING');
  assert.equal(fetch.requests.length, 0);
});

test('429, 5xx and network failures have their own errors', async () => {
  const { api: limited } = apiWithFetch((url) =>
    url.endsWith('/oauth2/token') ? TOKENS() : { status: 429, headers: { 'retry-after': '120' } },
  );
  limited.setCredentials('me@example.com', 'secret');
  await assert.rejects(limited.getProducts(), (err) => {
    assert.ok(err instanceof RateLimitError);
    assert.equal(err.retryAfterMs, 120000);
    return true;
  });

  const { api: broken } = apiWithFetch((url) =>
    url.endsWith('/oauth2/token') ? TOKENS() : { status: 503, body: { message: 'Down' } },
  );
  broken.setCredentials('me@example.com', 'secret');
  await assert.rejects(broken.getProducts(), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 503);
    assert.equal(err.detail, 'Down');
    return true;
  });

  const { api: offline } = apiWithFetch(() => {
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  });
  offline.setCredentials('me@example.com', 'secret');
  await assert.rejects(offline.getProducts(), (err) => {
    assert.ok(err instanceof NetworkError);
    assert.match(err.message, /ENOTFOUND/);
    return true;
  });
});

test('a non-list answer reads as no product', async () => {
  const { api } = apiWithFetch((url) =>
    url.endsWith('/oauth2/token') ? TOKENS() : { status: 200, body: { odd: true } },
  );
  api.setCredentials('me@example.com', 'secret');
  assert.deepEqual(await api.getProducts(), []);
});

test('changeMode sends a JSON-RPC command, setThermostat a PATCH', async () => {
  const { api, fetch } = apiWithFetch((url) =>
    url.endsWith('/oauth2/token') ? TOKENS() : { status: 200, body: {} },
  );
  api.setCredentials('me@example.com', 'secret');
  await api.changeMode('AA:BB', 'Y');
  await api.setThermostat('AABB', { id: 18991, name: 'Salon' }, 22);
  const [, command, patch] = fetch.requests;
  assert.equal(command.method, 'POST');
  assert.equal(command.url, `${BASE_URL}${PRODUCTS_PATH}/AA%3ABB/commands`);
  const body = JSON.parse(command.body);
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.method, 'changeMode');
  assert.deepEqual(body.params, ['Y']);
  assert.equal(typeof body.id, 'number');
  assert.equal(patch.method, 'PATCH');
  assert.equal(patch.url, `${BASE_URL}${PRODUCTS_PATH}/AABB/updateThermostats`);
  assert.deepEqual(JSON.parse(patch.body), [
    { ThermostatId: 18991, Name: 'Salon', TemperatureSet: 22 },
  ]);
});

test('requests are spaced, and new credentials drop the tokens', async () => {
  let tokens = 0;
  const { api, clock } = apiWithFetch((url) => {
    if (url.endsWith('/oauth2/token')) {
      tokens += 1;
      return TOKENS(tokens);
    }
    return { status: 200, body: [] };
  });
  api.setCredentials('me@example.com', 'secret');
  await api.getProducts();
  await api.getProducts();
  assert.ok(clock.slept.length >= 1);
  api.setCredentials('other@example.com', 'secret');
  await api.getProducts();
  assert.equal(tokens, 2);
  assert.ok(api.requestsLastHour() >= 4);
});

test('errorDetail reads the usual error bodies', () => {
  assert.equal(errorDetail(BAD_LOGIN.body), 'The user name or password is incorrect.');
  assert.equal(errorDetail({ message: '  a\n b ' }), 'a b');
  assert.equal(errorDetail(null), '');
});
