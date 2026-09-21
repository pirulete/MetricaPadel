"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Lock, Unlock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { parseAdminError } from "@/hooks/use-admin-fetch";
import { CreateUserForm } from "./create-user-form";
import { EditUserForm } from "./edit-user-form";

export type AdminUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'LOCKED' | 'TEMPORARY';
  role: 'USER' | 'ADMIN';
  createdAt: string | Date;
};

const statusVariant: Record<AdminUserRow['status'], 'default' | 'destructive' | 'secondary'> = {
  ACTIVE: 'default',
  LOCKED: 'destructive',
  TEMPORARY: 'secondary',
};

export function UserList() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Debounce 300ms del input de búsqueda
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const qs = debounced ? `?search=${encodeURIComponent(debounced)}` : "";
        const res = await fetch(`/api/admin/users${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await parseAdminError(res));
        const data = await res.json();
        if (!cancelled) setUsers(data.users);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error al cargar usuarios");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, tick]);

  const toggleLock = async (user: AdminUserRow) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: user.status === 'LOCKED' ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success(user.status === 'LOCKED' ? "Usuario desbloqueado" : "Usuario bloqueado");
      setUsers((prev) =>
        prev
          ? prev.map((u) =>
              u.id === user.id ? { ...u, status: user.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED' } : u
            )
          : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar estado");
    } finally {
      setBusyId(null);
    }
  };

  const promote = async (user: AdminUserRow) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/promote`, { method: "POST" });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success(`${user.email} ahora es ADMIN`);
      setUsers((prev) =>
        prev ? prev.map((u) => (u.id === user.id ? { ...u, role: 'ADMIN' } : u)) : prev
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al promover");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Gestión de jugadores: editar, bloquear/desbloquear y promover.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Crear usuario
        </Button>
      </div>

      <Card className="p-4">
        <Input
          aria-label="Buscar usuarios"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground" aria-busy="true">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : !users || users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Sin usuarios. Crea el primero.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[user.status]}>{user.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>{user.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditTarget(user)} aria-label={`Editar ${user.email}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleLock(user)}
                        disabled={busyId === user.id}
                        aria-label={user.status === 'LOCKED' ? `Desbloquear ${user.email}` : `Bloquear ${user.email}`}
                      >
                        {user.status === 'LOCKED'
                          ? <Unlock className="h-4 w-4" aria-hidden />
                          : <Lock className="h-4 w-4 text-destructive" aria-hidden />}
                      </Button>
                      {user.role === 'USER' && (
                        <Button variant="ghost" size="sm" onClick={() => promote(user)} disabled={busyId === user.id} aria-label={`Promover ${user.email}`}>
                          <ShieldCheck className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
            <DialogDescription>
              Crea un jugador con acceso directo (status ACTIVE, sin verificación de email).
            </DialogDescription>
          </DialogHeader>
          <CreateUserForm onSuccess={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>Actualiza los datos de {editTarget?.email}.</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <EditUserForm
              user={editTarget}
              onSuccess={() => {
                setEditTarget(null);
                setTick((t) => t + 1); // re-fetch
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}