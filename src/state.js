// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (mode
// 0600, the only writable place of the container): per product, the values
// the scene triggers compare (mode, online, filter life, holiday). Never a
// token, a password nor an e-mail. A missing or unreadable file is an empty
// state: nothing fires on the first reading.
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/state.json';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * @description Create the store.
 * @param {object} [options] - Options.
 * @param {string|null} [options.path] - The file (null: memory only, tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} The store.
 */
function createState({ path = DEFAULT_PATH, logger = null } = {}) {
  let snapshots = {};
  let dirty = false;

  if (path) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      snapshots = isObject(parsed?.snapshots) ? parsed.snapshots : {};
    } catch (err) {
      if (err.code !== 'ENOENT') logger?.warn(`Unreadable ${path}, starting afresh`);
    }
  }

  return {
    /** @returns {object|null} The snapshot of a product. */
    snapshot: (id) => (isObject(snapshots[id]) ? snapshots[id] : null),
    /**
     * @param {string} id - The modem.
     * @param {object} snapshot - Its snapshot.
     */
    setSnapshot(id, snapshot) {
      if (JSON.stringify(snapshots[id]) === JSON.stringify(snapshot)) return;
      snapshots[id] = snapshot;
      dirty = true;
    },
    /**
     * @description Drop the products Aldes no longer lists.
     * @param {string[]} ids - The ids to keep.
     */
    keep(ids) {
      const wanted = new Set(ids);
      for (const id of Object.keys(snapshots)) {
        if (!wanted.has(id)) {
          delete snapshots[id];
          dirty = true;
        }
      }
    },
    /** @description Write the file when something changed (atomically). */
    save() {
      if (!dirty || !path) return;
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        writeFileSync(temporary, JSON.stringify({ snapshots }), { mode: 0o600 });
        renameSync(temporary, path);
        dirty = false;
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
}

export { DEFAULT_PATH, createState };
