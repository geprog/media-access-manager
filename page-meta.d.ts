declare module '#app' {
  interface PageMeta {
    /** Reachable without an admin session (e.g. the token access page). */
    public?: boolean
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
  }
}

export {};
