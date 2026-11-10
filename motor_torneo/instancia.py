"""
Generador de instancia: torneo de padel con la estructura del torneo real
(8 categorias, 50 grupos, 155 parejas, 8 canchas, grilla de bloques de 75 min).

Todo lo que aqui se genera son FRONTERAS del problema: vienen de la inscripcion
y del sorteo, el motor no las cuestiona.
"""
import random
from dataclasses import dataclass, field

# ----------------------------------------------------------------------------
# Grilla de bloques (75 minutos, sin huecos)
# ----------------------------------------------------------------------------
BLOQUE_MIN = 75

# (nombre_dia, hora_inicio "HH:MM", cantidad_bloques, fase, es_extension)
CALENDARIO = [
    ("Jue", "14:00", 7, "previa", False),
    ("Vie", "14:00", 7, "previa", False),
    ("Sab", "08:00", 8, "previa", False),
    ("Sab", "18:00", 4, "final",  False),
    ("Dom", "08:00", 9, "final",  False),
    ("Dom", "19:15", 3, "final",  True),
]


@dataclass
class Bloque:
    idx: int
    dia: str
    hora: str          # hora de inicio
    fase: str          # previa | final
    extension: bool
    cap: int           # canchas disponibles en este bloque


def construir_bloques(n_canchas: int, cap_por_bloque: dict | None = None):
    """cap_por_bloque permite bajar la capacidad en bloques puntuales
    (cancha reservada para socios, cancha sin luz, etc.)."""
    bloques = []
    idx = 0
    for dia, hora, n, fase, ext in CALENDARIO:
        h, m = map(int, hora.split(":"))
        t = h * 60 + m
        for _ in range(n):
            cap = n_canchas
            if cap_por_bloque and idx in cap_por_bloque:
                cap = cap_por_bloque[idx]
            bloques.append(Bloque(idx, dia, f"{t // 60:02d}:{t % 60:02d}", fase, ext, cap))
            t += BLOQUE_MIN
            idx += 1
    return bloques


# ----------------------------------------------------------------------------
# Estructura deportiva
# ----------------------------------------------------------------------------
@dataclass
class Pareja:
    id: str
    categoria: str
    grupo: str
    personas: tuple          # (id_persona, id_persona)
    bloqueados: set = field(default_factory=set)   # bloques de previa prohibidos


@dataclass
class Partido:
    id: str
    categoria: str
    fase: str                # previa | final
    ronda: str               # "grupo" | "8vos" | "4tos" | "semi" | "final"
    grupo: str | None        # solo previa
    parejas: tuple | None    # ids de pareja (solo previa; en final no se sabe)
    grupos_origen: frozenset # grupos cuyas parejas podrian jugar este partido
    alimentadores: list      # ids de partidos que deben terminar antes (final)


@dataclass
class Instancia:
    bloques: list
    n_canchas: int
    categorias: dict         # cat -> {"sexo":..., "grupos": [grupo_id,...]}
    grupos: dict             # grupo_id -> {"cat":..., "parejas":[...], "tam":3|4}
    parejas: dict            # id -> Pareja
    personas: dict           # id -> {"sexo":..., "parejas":[ids]}
    partidos: dict           # id -> Partido
    seed: int

    # --- utilidades -------------------------------------------------------
    def bloques_fase(self, fase):
        return [b for b in self.bloques if b.fase == fase]

    def partidos_fase(self, fase):
        return [p for p in self.partidos.values() if p.fase == fase]

    def personas_doble(self):
        return [pid for pid, p in self.personas.items() if len(p["parejas"]) > 1]

    def partidos_potenciales(self, persona_id):
        """Partidos en los que la persona juega (previa) o podria jugar (final)."""
        res = []
        mis_grupos = {self.parejas[pj].grupo for pj in self.personas[persona_id]["parejas"]}
        for p in self.partidos.values():
            if p.fase == "previa":
                if any(pj in p.parejas for pj in self.personas[persona_id]["parejas"]):
                    res.append(p.id)
            else:
                if p.grupos_origen & mis_grupos:
                    res.append(p.id)
        return res


# Estructura del torneo real
ESTRUCTURA = {
    # cat: (sexo, nivel, grupos_de_3, grupos_de_4)
    "2da": ("H", 2, 6, 0),
    "3ra": ("H", 3, 6, 2),
    "4ta": ("H", 4, 6, 2),
    "5ta": ("H", 5, 7, 1),
    "6ta": ("H", 6, 4, 0),
    "A":   ("M", 1, 5, 0),
    "B":   ("M", 2, 6, 0),
    "C":   ("M", 3, 5, 0),
}


def _partidos_grupo(grupo_id, parejas):
    """Grupo de 3: todos contra todos. Grupo de 4: ciclo A-B, B-C, C-D, D-A
    (cada pareja juega exactamente dos partidos)."""
    if len(parejas) == 3:
        a, b, c = parejas
        return [(a, b), (a, c), (b, c)]
    a, b, c, d = parejas
    return [(a, b), (b, c), (c, d), (d, a)]


def _construir_cuadro(cat, grupos):
    """Devuelve la lista de partidos de cuadro de una categoria.
    Avanzan 2 por grupo. Cuadro = potencia de 2 >= 2*g, con pases libres."""
    g = len(grupos)
    S = 1
    while S < 2 * g:
        S *= 2
    byes = S - 2 * g
    # Entrantes ordenados: primeros de grupo, luego segundos
    E = [(gr, 1) for gr in grupos] + [(gr, 2) for gr in grupos]
    # Posiciones del cuadro: los primeros `byes` entrantes tienen pase libre
    posiciones = []
    for i in range(byes):
        posiciones += [E[i], None]
    resto = E[byes:]
    # emparejar 1ro de grupo i con 2do de grupo i+g//2 cuando no hay byes
    if byes == 0:
        resto = []
        for i in range(g):
            resto += [E[i], E[g + (i + g // 2) % g]]
    else:
        # evitar que dos parejas del mismo grupo se crucen en primera ronda
        for k in range(0, len(resto) - 1, 2):
            if resto[k][0] == resto[k + 1][0] and k + 2 < len(resto):
                resto[k + 1], resto[k + 2] = resto[k + 2], resto[k + 1]
    posiciones += resto
    assert len(posiciones) == S

    # Nodos nivel 0: S/2 slots
    nombres = {8: "8vos", 4: "4tos", 2: "semi", 1: "final", 16: "16vos"}
    partidos = []
    nivel = []
    for s in range(S // 2):
        a, b = posiciones[2 * s], posiciones[2 * s + 1]
        nivel.append({"lados": [("entrante", a), ("entrante", b)]})
    n_nodos = S // 2
    while True:
        ronda = nombres[n_nodos]
        nuevos_nodos = []
        for k, nodo in enumerate(nivel):
            lados = nodo["lados"]
            reales = [l for l in lados if not (l[0] == "entrante" and l[1] is None)]
            if len(reales) == 1:
                # pase libre: el nodo "es" ese lado
                nodo["resuelto"] = reales[0]
                continue
            pid = f"{cat}-{ronda}-{k + 1}"
            grupos_origen = set()
            alimentadores = []
            for tipo, val in reales:
                if tipo == "entrante":
                    grupos_origen.add(val[0])
                else:  # nodo hijo
                    grupos_origen |= val["grupos_origen"]
                    if "partido" in val:
                        alimentadores.append(val["partido"])
            nodo["partido"] = pid
            nodo["grupos_origen"] = frozenset(grupos_origen)
            partidos.append(Partido(pid, cat, "final", ronda, None, None,
                                    frozenset(grupos_origen), alimentadores))
        if n_nodos == 1:
            break
        # construir nivel siguiente
        for k in range(0, n_nodos, 2):
            lados = []
            for nodo in (nivel[k], nivel[k + 1]):
                if "partido" in nodo:
                    lados.append(("nodo", nodo))
                else:
                    r = nodo["resuelto"]
                    if r[0] == "entrante":
                        lados.append(("entrante", r[1]))
                    else:
                        lados.append(("nodo", r[1]))
            nuevos_nodos.append({"lados": lados})
        nivel = nuevos_nodos
        n_nodos //= 2
    return partidos


def generar(seed=7, n_canchas=8, pct_doble=0.08, max_bloqueados=8,
            perfil_disponibilidad=(0.20, 0.45, 0.25, 0.10)):
    """
    perfil_disponibilidad: proporcion de parejas (sin bloqueos, bloquea una tarde
    laboral, bloquea ambas tardes laborales, bloquea un dia completo).
    """
    rnd = random.Random(seed)
    bloques = construir_bloques(n_canchas)
    prev = [b for b in bloques if b.fase == "previa"]

    categorias, grupos, parejas, personas = {}, {}, {}, {}
    n_persona = 0

    def nueva_persona(sexo):
        nonlocal n_persona
        n_persona += 1
        pid = f"P{n_persona:03d}"
        personas[pid] = {"sexo": sexo, "parejas": []}
        return pid

    for cat, (sexo, nivel, n3, n4) in ESTRUCTURA.items():
        categorias[cat] = {"sexo": sexo, "nivel": nivel, "grupos": []}
        tamanos = [3] * n3 + [4] * n4
        for gi, tam in enumerate(tamanos, start=1):
            gid = f"{cat}-G{gi}"
            categorias[cat]["grupos"].append(gid)
            ids = []
            for k in range(tam):
                pj = f"{gid}-{'ABCD'[k]}"
                p1, p2 = nueva_persona(sexo), nueva_persona(sexo)
                parejas[pj] = Pareja(pj, cat, gid, (p1, p2))
                personas[p1]["parejas"].append(pj)
                personas[p2]["parejas"].append(pj)
                ids.append(pj)
            grupos[gid] = {"cat": cat, "parejas": ids, "tam": tam}

    # --- doble categoria: una persona de una categoria adyacente (mismo sexo)
    # reemplaza a una persona en otra pareja
    cats = list(ESTRUCTURA)
    n_doble = round(pct_doble * len(personas))
    hechos = 0
    intentos = 0
    while hechos < n_doble and intentos < 10000:
        intentos += 1
        pj = rnd.choice(list(parejas.values()))
        sexo, nivel, *_ = ESTRUCTURA[pj.categoria]
        vecinas = [c for c in cats if ESTRUCTURA[c][0] == sexo
                   and abs(ESTRUCTURA[c][1] - nivel) == 1]
        if not vecinas:
            continue
        cat2 = rnd.choice(vecinas)
        candidatos = [p for p, d in personas.items()
                      if len(d["parejas"]) == 1
                      and parejas[d["parejas"][0]].categoria == cat2]
        if not candidatos:
            continue
        q = rnd.choice(candidatos)
        # persona a reemplazar en pj (debe ser de una sola categoria)
        k = rnd.randrange(2)
        saliente = pj.personas[k]
        if len(personas[saliente]["parejas"]) != 1:
            continue
        nuevas = list(pj.personas)
        nuevas[k] = q
        pj.personas = tuple(nuevas)
        personas[q]["parejas"].append(pj.id)
        del personas[saliente]
        hechos += 1

    # --- disponibilidad (bloques prohibidos en la previa)
    jue_tarde = [b.idx for b in prev if b.dia == "Jue" and b.hora < "19:00"]
    vie_tarde = [b.idx for b in prev if b.dia == "Vie" and b.hora < "19:00"]
    por_dia = {d: [b.idx for b in prev if b.dia == d] for d in ("Jue", "Vie", "Sab")}
    p0, p1, p2, p3 = perfil_disponibilidad
    for pj in parejas.values():
        u = rnd.random()
        if u < p0:
            bl = set()
        elif u < p0 + p1:
            bl = set(rnd.choice([jue_tarde, vie_tarde]))
        elif u < p0 + p1 + p2:
            bl = set(jue_tarde) | set(vie_tarde)
        else:
            bl = set(por_dia[rnd.choice(["Jue", "Vie", "Sab"])])
        # tope del formulario
        while len(bl) > max_bloqueados:
            bl.remove(rnd.choice(sorted(bl)))
        pj.bloqueados = bl

    # --- partidos
    partidos = {}
    for gid, g in grupos.items():
        for k, (a, b) in enumerate(_partidos_grupo(gid, g["parejas"]), start=1):
            pid = f"{gid}-P{k}"
            partidos[pid] = Partido(pid, g["cat"], "previa", "grupo", gid, (a, b),
                                    frozenset([gid]), [])
    for cat, info in categorias.items():
        for p in _construir_cuadro(cat, info["grupos"]):
            partidos[p.id] = p

    return Instancia(bloques, n_canchas, categorias, grupos, parejas, personas,
                     partidos, seed)


if __name__ == "__main__":
    inst = generar()
    prev = inst.partidos_fase("previa")
    fin = inst.partidos_fase("final")
    print(f"bloques: {len(inst.bloques)} (previa {len(inst.bloques_fase('previa'))}, "
          f"final {len(inst.bloques_fase('final'))})")
    print(f"parejas: {len(inst.parejas)}  personas: {len(inst.personas)}  "
          f"doble categoria: {len(inst.personas_doble())}")
    print(f"partidos previa: {len(prev)}  final: {len(fin)}")
    from collections import Counter
    print(Counter(p.ronda for p in fin))
    print("ejemplo cuadro 2da:")
    for p in fin:
        if p.categoria == "2da":
            print(" ", p.id, sorted(p.grupos_origen), p.alimentadores)
