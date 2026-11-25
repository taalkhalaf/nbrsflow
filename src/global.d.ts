import type { NbrsAPI } from './types';

declare global {
  interface Window {
    nbrsAPI?: NbrsAPI;
  }
}
export {};
