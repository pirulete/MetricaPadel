"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { parseAdminError } from "@/hooks/use-admin-fetch";

export type AdminRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'LOCKED' | 'TEMPORARY';
  createdAt: string | Date;
};

const statusVariant: Record<AdminRow['status'], 'default' | 'destructive' | 'secondary'> = {
  ACTIVE: 'default',
  LOCKED: 'destructive',
  TEMPORARY: 'secondary',
};

export function AdminsList() {
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [demoteTarget, setDemoteTarget] = useState<AdminRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
        const res = await fetch(`/api/admin/admins${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await parseAdminError(res));
        const data = await res.json();
        if (!cancelled) setAdmins(data.admins);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Error al cargar admins");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const demote = async (admin: AdminRow) => {
    setBusyId(admin.id);
    try {
      const res = await fetch(`/api/admin/users/${admin.id}/demote`, { method: "POST" });
      if (!res.ok) throw new Error(await parseAdminError(res));
      toast.success(`${admin.email} ya no es ADMIN`);
      setAdmins((prev) => (prev ? prev.filter((a) => a.id !== admin.id) : prev));
      setDemoteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al demotar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Admins</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de administradores de plataforma: promover y demotar roles ADMIN.
        </p>
      </div>

      <Card className="p-4">
        <Input
          aria-label="Buscar admins"
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
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
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
            ) : !admins || admins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Sin administradores.
                </TableCell>
              </TableRow>
            ) : (
              admins.map((admin) => (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">
                    {[admin.firstName, admin.lastName].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell>{admin.email}</TableCell>
                  <TableCell>
                    <Badge variant={admin.role === 'SUPER_ADMIN' ? 'default' : 'secondary'}>
                      {admin.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[admin.status]}>{admin.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {admin.role === 'ADMIN' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDemoteTarget(admin)}
                        disabled={busyId === admin.id}
                        aria-label={`Demotar ${admin.email}`}
                      >
                        <ShieldX className="h-4 w-4 text-destructive" aria-hidden />
                      </Button>
                    )}
                    {admin.role === 'SUPER_ADMIN' && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldCheck className="h-4 w-4" aria-hidden /> Protegido
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!demoteTarget} onOpenChange={(open) => !open && setDemoteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demotar administrador</DialogTitle>
            <DialogDescription>
              ¿Seguro que quieres quitar el rol ADMIN a {demoteTarget?.email}? Pasará a ser usuario jugador.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => demoteTarget && demote(demoteTarget)}
              disabled={busyId === demoteTarget?.id}
            >
              Demotar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}