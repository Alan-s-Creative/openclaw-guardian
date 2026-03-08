/// <reference types="vite/client" />

declare module '@tauri-apps/api/core' {
  export function invoke<T>(cmd: string, args?: object): Promise<T>;
}
