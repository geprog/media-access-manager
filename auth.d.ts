declare module '#auth-utils' {
  interface User {
    role: string
  }

  interface UserSession {
    user?: User
    loggedInAt?: number
  }
}

export {};
