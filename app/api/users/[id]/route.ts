import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';
import { deleteUser, getUsers } from '@/lib/users';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Nelze smazat sám sebe
  if (id === session.user.id) {
    return NextResponse.json(
      { error: 'Nemůžete smazat vlastní účet' },
      { status: 400 }
    );
  }

  // Zkontroluj, že to není poslední admin
  const users = await getUsers();
  const target = users.find(u => u.id === id);
  if (!target) {
    return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });
  }

  if (target.role === 'admin') {
    const adminCount = users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Nelze smazat posledního admina' },
        { status: 400 }
      );
    }
  }

  await deleteUser(id);
  return NextResponse.json({ success: true });
}
