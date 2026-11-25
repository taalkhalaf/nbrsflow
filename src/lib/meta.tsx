import { createContext, useContext } from 'react';
import type { ColorId, ItemMeta } from '../types';

export interface MetaCtx {
  /** Metadata of an item (explicit color + summary + aliases + openedAt + lastOpenedChildRelPath). */
  metaOf: (path: string) => ItemMeta | undefined;
  /** Effective color: explicit one, else the auto color when the rule is enabled. */
  colorOf: (path: string) => ColorId | undefined;
  /** Set (or clear with null) the color of folders; 'auto' applies the content-based suggestion. */
  setColor: (paths: string[], color: ColorId | null | 'auto') => void;
  /** Set (or clear with null) the category tag of folders. */
  setTag: (paths: string[], tag: string | null) => void;
  /** All distinct user-created tags currently in metadata. */
  allTags: () => string[];
  editSummary: (path: string) => void;
  editAliases: (path: string) => void;
  markOpened: (path: string) => void;
  resetAsNew: (path: string) => void;
  verifyChecksum: (path: string) => void;
  /** Ask for auto-color suggestions for these folders (no-op when the rule is off). */
  requestAuto: (folderPaths: string[]) => void;
}

const noop: MetaCtx = {
  metaOf: () => undefined,
  colorOf: () => undefined,
  setColor: () => undefined,
  setTag: () => undefined,
  allTags: () => [],
  editSummary: () => undefined,
  editAliases: () => undefined,
  markOpened: () => undefined,
  resetAsNew: () => undefined,
  verifyChecksum: () => undefined,
  requestAuto: () => undefined
};

export const MetaContext = createContext<MetaCtx>(noop);
export const useMeta = () => useContext(MetaContext);
export const keyOf = (p: string) => p.toLowerCase();
