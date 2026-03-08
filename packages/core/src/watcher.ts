import chokidar from 'chokidar';

export interface WatcherConfig {
  paths: string[];
  debounceMs?: number;
}

export type WatcherEvent = 'change' | 'corrupt' | 'missing';

export function createWatcher(config: WatcherConfig) {
  // Keep a reference to ensure the dependency is wired in this scaffold.
  const watcher = chokidar.watch(config.paths, {
    ignoreInitial: true,
  });

  // TODO: implement in ALA-410
  return {
    start: () => {
      void watcher;
    },
    stop: () => {
      void watcher.close();
    },
    on: (_event: WatcherEvent, _handler: (path: string) => void) => {
      // TODO: wire event handlers in ALA-410
    },
  };
}
