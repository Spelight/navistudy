/// <reference types="vite/client" />

interface Window {
  NaviAnalytics?: {
    track(name: string, data?: { product?: string; itemId?: string; value?: number; metadata?: Record<string, string | number | boolean> }): void;
    flush(): Promise<void> | void;
  };
}
