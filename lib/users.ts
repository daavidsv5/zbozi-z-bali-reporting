import pool from './db';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;

const SELECT = `
  SELECT id, email, name, password_hash AS "passwordHash", role, created_at AS "createdAt"
  FROM users
`;

export async function getUsers(): Promise<User[]> {
  const { rows } = await pool.query(`${SELECT} ORDER BY created_at ASC`);
  return rows;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const { rows } = await pool.query(
    `${SELECT} WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return rows[0] ?? undefined;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const { rows } = await pool.query(
    `${SELECT} WHERE id = $1`,
    [id]
  );
  return rows[0] ?? undefined;
}

export async function addUser(user: User): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, email, name, password_hash, role, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, user.email, user.name, user.passwordHash, user.role, user.createdAt]
  );
}

export async function deleteUser(id: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

export async function updatePassword(id: string, newHash: string): Promise<void> {
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, id]);
}
