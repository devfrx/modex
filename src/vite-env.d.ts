/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Vue single file component type declaration
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
