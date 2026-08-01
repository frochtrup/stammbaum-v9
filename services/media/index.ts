// services/media/index.ts — öffentliche Fläche der Medien-Auflösung (Spec 14 §7,
// ADR-v9-187, BL-257/BL-258).
export type {
  MediaFolderAdapter,
  MediaFolderEntry,
  MediaFolderHandleStore,
  MediaMatch,
  MediaMatchKind,
  MediaFilePicker,
  PickedMedia,
} from './types';
export { buildMediaIndex, normalizePath, basenameOf, type MediaIndex } from './media-index';
export { FsMediaFolderAdapter } from './fs-media-folder-adapter';
export { browserThumbnail, canMakeThumbnails } from './browser-thumbnailer';
export { IdbMediaFolderHandleStore } from './idb-media-folder-handle-store';
export { IdbMediaBytesStore, bytesKey, type MediaBytesStore } from './media-bytes-store';
export { InputMediaFilePicker } from './media-file-picker';
export {
  createMediaResolver,
  type MediaResolver,
  type MediaFolderStatus,
  type MediaResolutionState,
  type ResolvedMedia,
} from './media-resolver';
