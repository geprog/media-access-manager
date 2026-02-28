import bcrypt from 'bcrypt';

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const { adminPassword } = useRuntimeConfig();
  if (!adminPassword) {
    return false;
  }
  return password === adminPassword;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
