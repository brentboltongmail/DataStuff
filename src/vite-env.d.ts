/// <reference types="vite/client" />

import type { OracleApi } from "./types";

declare global {
  interface Window {
    oracle: OracleApi;
  }
}

export {};
