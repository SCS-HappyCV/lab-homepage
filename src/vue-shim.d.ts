/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEMBER_PASS_HASH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
