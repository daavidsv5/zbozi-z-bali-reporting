import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getUsers, addUser, getUserByEmail } from '@/lib/users';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = (await getUsers()).map(({ passwordHash: _, ...rest }) => rest);
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, name, password, role } = await req.json();

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Chybí povinné údaje' }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: 'Uživatel s tímto emailem již existuje' },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await addUser({
    id: randomUUID(),
    email,
    name,
    passwordHash,
    role: role === 'admin' ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}
