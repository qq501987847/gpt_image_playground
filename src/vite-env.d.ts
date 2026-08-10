/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __DEV_PROXY_CONFIG__: unknown

interface ImportMetaEnv {
  readonly VITE_DEFAULT_API_URL?: string
  readonly VITE_API_PROXY_AVAILABLE?: string
  readonly VITE_API_PROXY_LOCKED?: string
  readonly VITE_DOCKER_DEPLOYMENT?: string
  readonly VITE_DOCKER_LEGACY_API_URL_USED?: string
  readonly VITE_SHOW_DEFAULT_CONFIG_ONLY?: string
  readonly VITE_AWAI_ASSET_SERVICE_URL?: string
  readonly VITE_AWAI_SUB2API_ALLOWED_ORIGINS?: string
  readonly VITE_AWAI_DEV_SUB2API_ORIGIN?: string
  readonly VITE_AWAI_RELEASE_MODE?: string
  readonly VITE_AWAI_SUB2API_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
