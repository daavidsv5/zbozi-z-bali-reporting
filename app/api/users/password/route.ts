import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getUserById, updatePassword } from '@/lib/users';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  }

  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Vyplňte všechna pole' }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Nové heslo musí mít alespoň 8 znaků' }, { status: 400 });
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Současné heslo není správné' }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await updatePassword(user.id, newHash);

  return NextResponse.json({ success: true });
}
