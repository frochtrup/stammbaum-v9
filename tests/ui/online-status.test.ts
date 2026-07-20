import { describe, expect, it, beforeEach } from 'vitest';
import { onlineStatus, type OnlineStatusEnv } from '../../ui/shell/online-status.svelte';

/** Steuerbare Umgebung: kein window/navigator/caches nötig (TST-1). */
function makeEnv(init: { online: boolean; cached: boolean }) {
  const listeners: Record<string, Array<() => void>> = { online: [], offline: [] };
  let online = init.online;
  const env: OnlineStatusEnv = {
    isOnline: () => online,
    addListener: (type, cb) => listeners[type].push(cb),
    removeListener: (type, cb) => {
      listeners[type] = listeners[type].filter((c) => c !== cb);
    },
    hasAppCache: async () => init.cached
  };
  return {
    env,
    listenerCount: () => listeners.online.length + listeners.offline.length,
    goOffline: () => {
      online = false;
      listeners.offline.forEach((cb) => cb());
    },
    goOnline: () => {
      online = true;
      listeners.online.forEach((cb) => cb());
    }
  };
}

describe('onlineStatus', () => {
  beforeEach(() => onlineStatus.reset());

  it('übernimmt den Startzustand beim Start', () => {
    const h = makeEnv({ online: false, cached: true });
    onlineStatus.start(h.env);
    expect(onlineStatus.online).toBe(false);
  });

  it('folgt den offline-/online-Ereignissen live', () => {
    const h = makeEnv({ online: true, cached: true });
    onlineStatus.start(h.env);
    expect(onlineStatus.online).toBe(true);

    h.goOffline();
    expect(onlineStatus.online).toBe(false);

    h.goOnline();
    expect(onlineStatus.online).toBe(true);
  });

  it('meldet Listener wieder ab (kein Leck bei mehrfachem Mount)', () => {
    const h = makeEnv({ online: true, cached: true });
    const stop = onlineStatus.start(h.env);
    expect(h.listenerCount()).toBe(2);
    stop();
    expect(h.listenerCount()).toBe(0);
  });

  describe('appCached — der v8-Orakel-Fall `_checkCacheStatus` (TST-6)', () => {
    it('warnt, wenn offline UND kein App-Cache existiert', async () => {
      const h = makeEnv({ online: false, cached: false });
      onlineStatus.start(h.env);
      await Promise.resolve();
      await Promise.resolve();
      expect(onlineStatus.online).toBe(false);
      expect(onlineStatus.appCached).toBe(false);
    });

    it('warnt NICHT, wenn offline aber der Cache steht', async () => {
      const h = makeEnv({ online: false, cached: true });
      onlineStatus.start(h.env);
      await Promise.resolve();
      await Promise.resolve();
      expect(onlineStatus.appCached).toBe(true);
    });

    it('warnt nie, solange online (fehlender Cache ist dann belanglos)', async () => {
      const h = makeEnv({ online: true, cached: false });
      onlineStatus.start(h.env);
      await Promise.resolve();
      await Promise.resolve();
      expect(onlineStatus.appCached).toBe(true);
    });

    it('nimmt die Warnung zurück, sobald die Verbindung zurück ist', async () => {
      const h = makeEnv({ online: false, cached: false });
      onlineStatus.start(h.env);
      await Promise.resolve();
      await Promise.resolve();
      expect(onlineStatus.appCached).toBe(false);

      h.goOnline();
      expect(onlineStatus.appCached).toBe(true);
    });

    it('behauptet nichts, wenn die Cache-Abfrage scheitert (lieber kein Hinweis als ein falscher)', async () => {
      const h = makeEnv({ online: false, cached: false });
      const env: OnlineStatusEnv = {
        ...h.env,
        hasAppCache: async () => {
          throw new Error('caches blockiert');
        }
      };
      onlineStatus.start(env);
      await Promise.resolve();
      await Promise.resolve();
      expect(onlineStatus.appCached).toBe(true);
    });
  });
});
