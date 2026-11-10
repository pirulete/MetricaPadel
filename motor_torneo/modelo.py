"""
Modelo de optimizacion de la agenda del torneo.

Formulacion como programa entero (todas las restricciones son lineales sobre
variables binarias). Se resuelve con HiGHS (scipy.optimize.milp). La misma
formulacion se traslada 1:1 a CP-SAT de OR-Tools: cada bloque de codigo marcado
con [CP-SAT] indica la restriccion equivalente.

Variable principal:  x[m, b] = 1 si el partido m se juega en el bloque b.
El bloque de un partido es la expresion lineal  blk[m] = sum_b b * x[m, b].
"""
import time
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import coo_matrix

# ----------------------------------------------------------------------------
# Parametros del modelo (todo lo que es politica, no dato)
# ----------------------------------------------------------------------------
PARAMS = dict(
    frontera_sabado=True,     # previa solo en bloques de previa, final en bloques de final
    descanso_final=1,         # bloques libres entre dos rondas de una categoria
    max_seguidos=3,           # tope blando de bloques consecutivos por persona (previa)
    bloque_final_objetivo=33, # las finales no antes de este bloque (Dom 16:45)
    disponibilidad_dura=True, # False = modo BR-04: se publica igual, con penalizacion
    doble_dura_en=("8vos",),  # rondas de la final donde el choque de doble categoria es duro
                              # (en las demas es blando: se resuelve al re-planificar)
    # pesos del objetivo, de mayor a menor prioridad
    W_EXTENSION=1000,         # por partido en bloque de extension
    W_DISPONIBILIDAD=500,     # por partido en bloque prohibido (solo modo relajado)
    W_DOBLE_BLANDO=60,        # por posible choque de doble categoria en rondas tardias
    W_DIAS=40,                # por dia adicional que una pareja debe venir en la previa
    W_FINAL_TEMPRANA=30,      # por bloque que una final queda antes del objetivo
    W_COMPACTO=25,            # por bloque de dispersion de un grupo mas alla del minimo
    W_SEGUIDOS=15,            # por bloque sobre el tope de seguidos
    W_TEMPRANO=1,             # por bloque: empuja la fase final hacia el inicio (sin huecos)
    tiempo_max=120,
    gap=0.01,
)


class Modelo:
    def __init__(self, inst, params=None):
        self.inst = inst
        self.p = dict(PARAMS)
        if params:
            self.p.update(params)
        self._construir()

    # ------------------------------------------------------------------
    def _nueva_var(self, nombre, lb=0, ub=1, entera=True, costo=0.0):
        i = len(self.var_nombre)
        self.var_nombre.append(nombre)
        self.lb.append(lb)
        self.ub.append(ub)
        self.entera.append(1 if entera else 0)
        self.costo.append(costo)
        return i

    def _restriccion(self, coefs, lo, hi, nombre=""):
        """coefs: dict var_idx -> coef. lo <= sum <= hi."""
        r = len(self.r_lo)
        for v, c in coefs.items():
            self.rows.append(r)
            self.cols.append(v)
            self.vals.append(c)
        self.r_lo.append(lo)
        self.r_hi.append(hi)
        self.r_nombre.append(nombre)

    # ------------------------------------------------------------------
    def _construir(self):
        inst, p = self.inst, self.p
        self.var_nombre, self.lb, self.ub, self.entera, self.costo = [], [], [], [], []
        self.rows, self.cols, self.vals = [], [], []
        self.r_lo, self.r_hi, self.r_nombre = [], [], []
        self.x = {}             # (partido, bloque) -> var
        self.viol = {}          # (partido, bloque) -> var de violacion de disponibilidad

        bloques = inst.bloques
        idx_fase = {"previa": [b.idx for b in bloques if b.fase == "previa"],
                    "final": [b.idx for b in bloques if b.fase == "final"]}
        todos = [b.idx for b in bloques]

        # ---- variables x[m,b] ------------------------------------------------
        # [CP-SAT] x = model.NewBoolVar() por cada (m, b) permitido
        for m in inst.partidos.values():
            if p["frontera_sabado"]:
                permitidos = idx_fase[m.fase]
            else:
                permitidos = todos if m.fase == "final" else idx_fase["previa"]
            prohibidos = set()
            if m.fase == "previa":
                for pj in m.parejas:
                    prohibidos |= inst.parejas[pj].bloqueados
            for b in permitidos:
                costo = 0.0
                if bloques[b].extension:
                    costo += p["W_EXTENSION"]
                if m.fase == "final":
                    costo += p["W_TEMPRANO"] * b
                if b in prohibidos:
                    if p["disponibilidad_dura"]:
                        continue  # restriccion 4 dura: la variable no existe
                    costo += p["W_DISPONIBILIDAD"]  # modo BR-04
                    self.viol[(m.id, b)] = True
                self.x[(m.id, b)] = self._nueva_var(f"x[{m.id},{b}]", costo=costo)

        # indice rapido: partido -> lista de (b, var)
        self.vars_de = {}
        for (mid, b), v in self.x.items():
            self.vars_de.setdefault(mid, []).append((b, v))

        def blk(mid):
            """expresion lineal del bloque del partido"""
            return {v: b for b, v in self.vars_de[mid]}

        # ---- R1: cada partido en exactamente una casilla ---------------------
        # [CP-SAT] model.AddExactlyOne(x[m, b] for b)
        for mid, lst in self.vars_de.items():
            self._restriccion({v: 1 for _, v in lst}, 1, 1, f"R1[{mid}]")

        # ---- R2: capacidad por bloque (canchas) ------------------------------
        # [CP-SAT] model.Add(sum(x[m, b] for m) <= cap[b])
        por_bloque = {}
        for (mid, b), v in self.x.items():
            por_bloque.setdefault(b, []).append(v)
        for b, vs in por_bloque.items():
            self._restriccion({v: 1 for v in vs}, 0, bloques[b].cap, f"R2[{b}]")

        # ---- R3: una persona no esta en dos partidos del mismo bloque --------
        # Previa: exacto (partidos conocidos). Final: sobre el camino potencial.
        # Para personas de una sola categoria basta la restriccion por pareja
        # en la previa (en la final las rondas ya estan separadas por R5).
        # [CP-SAT] model.AddAtMostOne(x[m, b] for m in partidos_persona)
        def agregar_r3(partidos, etiqueta):
            por_b = {}
            for mid in partidos:
                for b, v in self.vars_de.get(mid, []):
                    por_b.setdefault(b, []).append(v)
            for b, vs in por_b.items():
                if len(vs) > 1:
                    self._restriccion({v: 1 for v in vs}, 0, 1, f"R3[{etiqueta},{b}]")

        self.partidos_pareja = {}
        for m in inst.partidos_fase("previa"):
            for pj in m.parejas:
                self.partidos_pareja.setdefault(pj, []).append(m.id)
        for pj, ms in self.partidos_pareja.items():
            agregar_r3(ms, pj)
        # Doble categoria. En rondas tardias el camino potencial es casi todo el
        # cuadro, asi que exigirlo duro prohibe cosas que casi nunca pasan
        # (que la misma persona llegue a dos finales). Regla: duro en previa y
        # en las rondas listadas en `doble_dura_en`; blando con penalizacion en
        # el resto, y se resuelve al re-planificar tras cada ronda.
        self.dobles = inst.personas_doble()
        self.choques = {}   # (persona, bloque) -> var de holgura (choque aceptado)
        duras = set(p["doble_dura_en"])
        for per in self.dobles:
            pot = inst.partidos_potenciales(per)
            agregar_r3([m for m in pot if inst.partidos[m].fase == "previa"
                        or inst.partidos[m].ronda in duras], per)
            blandos = [m for m in pot if inst.partidos[m].fase == "final"
                       and inst.partidos[m].ronda not in duras]
            por_b = {}
            for mid in blandos:
                for b, v in self.vars_de[mid]:
                    por_b.setdefault(b, []).append(v)
            for b, vs in por_b.items():
                if len(vs) > 1:
                    e = self._nueva_var(f"choque[{per},{b}]", 0, len(vs), entera=False,
                                        costo=p["W_DOBLE_BLANDO"])
                    self.choques[(per, b)] = e
                    coefs = {v: 1 for v in vs}
                    coefs[e] = -1
                    self._restriccion(coefs, -np.inf, 1, f"R3b[{per},{b}]")

        # ---- R5: precedencias del cuadro ------------------------------------
        # blk[m] >= blk[f] + 1 + descanso  para cada alimentador f
        # (alimentador = partido de ronda anterior, o todos los partidos de un
        #  grupo de origen cuando el lado viene directo de la previa)
        # [CP-SAT] model.Add(blk[m] >= blk[f] + 1 + descanso)
        sep = 1 + p["descanso_final"]
        partidos_de_grupo = {}
        for m in inst.partidos_fase("previa"):
            partidos_de_grupo.setdefault(m.grupo, []).append(m.id)
        for m in inst.partidos_fase("final"):
            feeders = list(m.alimentadores)
            # grupos que alimentan directamente este partido
            cubiertos = set()
            for f in m.alimentadores:
                cubiertos |= inst.partidos[f].grupos_origen
            for g in m.grupos_origen - cubiertos:
                feeders += partidos_de_grupo[g]
            # Version acumulada (mas ajustada para programacion entera):
            # para todo t: sum_{b<=t} x[m,b] <= sum_{b<=t-sep} x[f,b]
            # "si m ya se jugo a la altura de t, f se jugo a mas tardar en t-sep"
            vm = sorted(self.vars_de[m.id])
            for f in feeders:
                vf = sorted(self.vars_de[f])
                ts = sorted({b for b, _ in vm})
                max_f = max(b for b, _ in vf)
                for t in ts:
                    if t - sep >= max_f:
                        break  # de aqui en adelante la restriccion es redundante
                    coefs = {v: 1 for b, v in vm if b <= t}
                    for b, v in vf:
                        if b <= t - sep:
                            coefs[v] = coefs.get(v, 0) - 1
                    self._restriccion(coefs, -np.inf, 0, f"R5[{m.id}<-{f},{t}]")

        # ---- Objetivo: dias por pareja en la previa ---------------------------
        # d[pj, dia] >= sum_{b in dia} x[m, b]  para cada partido m de la pareja
        # [CP-SAT] d es BoolVar; model.Add(sum(x) <= d) ; minimizar sum(d)
        dias_previa = sorted({bloques[b].dia for b in idx_fase["previa"]})
        bloques_dia = {d: [b for b in idx_fase["previa"] if bloques[b].dia == d]
                       for d in dias_previa}
        self.d = {}
        for pj, ms in self.partidos_pareja.items():
            for d in dias_previa:
                dv = self._nueva_var(f"d[{pj},{d}]", costo=p["W_DIAS"])
                self.d[(pj, d)] = dv
                for mid in ms:
                    coefs = {dv: -1}
                    for b, v in self.vars_de[mid]:
                        if b in bloques_dia[d]:
                            coefs[v] = 1
                    if len(coefs) > 1:
                        self._restriccion(coefs, -np.inf, 0, f"DIA[{pj},{d},{mid}]")
            # el costo real es (dias - 1); el -1 es constante y se ignora

        # ---- Objetivo: compacidad de cada grupo -------------------------------
        # mx[g] >= blk[m], mn[g] <= blk[m]; costo W * (mx - mn)
        # [CP-SAT] model.AddMaxEquality / AddMinEquality
        self.span = {}
        for gid, ms in partidos_de_grupo.items():
            mx = self._nueva_var(f"mx[{gid}]", 0, len(bloques), entera=False,
                                 costo=p["W_COMPACTO"])
            mn = self._nueva_var(f"mn[{gid}]", 0, len(bloques), entera=False,
                                 costo=-p["W_COMPACTO"])
            self.span[gid] = (mx, mn)
            for mid in ms:
                coefs = dict(blk(mid)); coefs[mx] = -1
                self._restriccion(coefs, -np.inf, 0, f"MX[{gid},{mid}]")
                coefs = dict(blk(mid)); coefs[mn] = -1
                self._restriccion(coefs, 0, np.inf, f"MN[{gid},{mid}]")

        # ---- Objetivo: tope blando de bloques seguidos (solo doble categoria) --
        # sum_{ventana de max+1 bloques} x <= max + e ; costo W * e
        # [CP-SAT] model.Add(sum(x) <= max_seguidos + e)
        k = p["max_seguidos"]
        for per in self.dobles:
            ms = [m for m in inst.partidos_potenciales(per)
                  if inst.partidos[m].fase == "previa"]
            if len(ms) <= k:
                continue
            for d in dias_previa:
                bl = bloques_dia[d]
                for i in range(len(bl) - k):
                    ventana = set(bl[i:i + k + 1])
                    e = self._nueva_var(f"e[{per},{d},{i}]", 0, 4, entera=False,
                                        costo=p["W_SEGUIDOS"])
                    coefs = {e: -1}
                    for mid in ms:
                        for b, v in self.vars_de[mid]:
                            if b in ventana:
                                coefs[v] = coefs.get(v, 0) + 1
                    self._restriccion(coefs, -np.inf, k, f"SEG[{per},{d},{i}]")

        # ---- Objetivo: finales no demasiado temprano --------------------------
        # f >= objetivo - blk[final]; costo W * f
        # [CP-SAT] model.AddMaxEquality(f, [0, objetivo - blk])
        for m in inst.partidos_fase("final"):
            if m.ronda != "final":
                continue
            f = self._nueva_var(f"f[{m.id}]", 0, len(bloques), entera=False,
                                costo=p["W_FINAL_TEMPRANA"])
            coefs = dict(blk(m.id)); coefs[f] = 1
            self._restriccion(coefs, p["bloque_final_objetivo"], np.inf, f"FIN[{m.id}]")

        self.n_vars = len(self.var_nombre)
        self.n_rest = len(self.r_lo)

    # ------------------------------------------------------------------
    def resolver(self, verbose=False):
        p = self.p
        A = coo_matrix((self.vals, (self.rows, self.cols)),
                       shape=(self.n_rest, self.n_vars)).tocsr()
        t0 = time.time()
        res = milp(c=np.array(self.costo),
                   constraints=LinearConstraint(A, np.array(self.r_lo), np.array(self.r_hi)),
                   integrality=np.array(self.entera),
                   bounds=Bounds(np.array(self.lb), np.array(self.ub)),
                   options={"time_limit": p["tiempo_max"], "mip_rel_gap": p["gap"],
                            "disp": verbose})
        self.tiempo = time.time() - t0
        self.res = res
        if res.x is None:
            return None
        xs = res.x
        asign = {}
        for (mid, b), v in self.x.items():
            if xs[v] > 0.5:
                asign[mid] = b
        violaciones = [(mid, b) for (mid, b) in self.viol if xs[self.x[(mid, b)]] > 0.5]
        choques = int(round(sum(xs[v] for v in self.choques.values())))
        return {"bloque": asign, "violaciones": violaciones, "choques": choques,
                "objetivo": res.fun, "status": res.status, "mensaje": res.message,
                "gap": getattr(res, "mip_gap", None), "tiempo": self.tiempo}


# ----------------------------------------------------------------------------
# Asignacion de canchas (posterior al motor; las canchas son intercambiables)
# ----------------------------------------------------------------------------
def asignar_canchas(inst, bloque_de):
    """Regla voraz: por bloque, un grupo intenta repetir la cancha del bloque
    anterior; en la final, un partido intenta la cancha de uno de sus
    alimentadores. Devuelve dict partido -> cancha (1..N)."""
    por_bloque = {}
    for mid, b in bloque_de.items():
        por_bloque.setdefault(b, []).append(mid)
    cancha = {}
    cancha_grupo_prev = {}
    for b in sorted(por_bloque):
        libres = list(range(1, inst.n_canchas + 1))
        pendientes = []
        for mid in sorted(por_bloque[b]):
            m = inst.partidos[mid]
            pref = None
            if m.fase == "previa":
                pref = cancha_grupo_prev.get((m.grupo, b - 1))
            else:
                for f in m.alimentadores:
                    if f in cancha and cancha[f] in libres:
                        pref = cancha[f]
                        break
            if pref in libres:
                cancha[mid] = pref
                libres.remove(pref)
            else:
                pendientes.append(mid)
        for mid in pendientes:
            cancha[mid] = libres.pop(0)
        for mid in por_bloque[b]:
            m = inst.partidos[mid]
            if m.fase == "previa":
                cancha_grupo_prev[(m.grupo, b)] = cancha[mid]
    return cancha
