// services/dedup/index.ts — öffentliche Fläche der Dedup-Persistenz (BL-105).
export {
  IdbDedupIgnoreStore,
  loadIgnoredPairs,
  type DedupIgnoreStore,
} from './idb-dedup-ignore-store';
