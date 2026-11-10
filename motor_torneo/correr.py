"""
Corre el motor sobre la instancia del torneo real y produce:
  salida/agenda.csv      agenda completa (partido, dia, hora, cancha)
  salida/resumen.txt     diagnostico: ocupacion, calidad de la agenda, verificacion
  salida/grilla.html     grilla canchas x bloques para mirar la agenda

Uso:  python3 correr.py [--sin-frontera] [--relajado] [--seed N] [--tiempo S]
"""
import argparse
import csv
import os
import sys
from collections import Counter, defaultdict

from instancia import generar
from modelo import Modelo, asignar_canchas, PARAMS
from verificar import verificar

COLORES = {"2da": "#4e79a7", "3ra": "#f28e2b", "4ta": "#59a14f", "5ta": "#e15759",
           "6ta": "#76b7b2", "A": "#b07aa1", "B": "#edc948", "C": "#ff9da7"}


def semaforo(inst, params):
    """Diagnostico de admision antes de resolver."""
    out = []
    for fase in ("previa", "final"):
        bl = [b for b in inst.bloques_fase(fase) if not b.extension]
        cap = sum(b.cap for b in bl)
        n = len(inst.partidos_fase(fase))
        rho = n / cap
        ext = sum(b.cap for b in inst.bloques_fase(fase) if b.extension)
        color = "ROJO (infactible)" if rho > 1 else "AMARILLO (sin margen)" if rho > 0.85 else "VERDE"
        out.append(f"  {fase:6s}: {n:3d} partidos / {cap:3d} casillas = ocupacion {rho:.2f}  -> {color}"
                   + (f"   (+{ext} casillas de extension)" if ext else ""))
    return "\n".join(out)


def escribir_csv(inst, bloque_de, cancha_de, ruta):
    with open(ruta, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["partido", "categoria", "fase", "ronda", "grupo", "pareja_1", "pareja_2",
                    "grupos_origen", "dia", "hora", "bloque", "cancha"])
        for mid, m in sorted(inst.partidos.items(), key=lambda kv: (bloque_de[kv[0]], cancha_de[kv[0]])):
            b = inst.bloques[bloque_de[mid]]
            w.writerow([mid, m.categoria, m.fase, m.ronda, m.grupo or "",
                        m.parejas[0] if m.parejas else "", m.parejas[1] if m.parejas else "",
                        " ".join(sorted(m.grupos_origen)), b.dia, b.hora, b.idx, cancha_de[mid]])


def escribir_html(inst, bloque_de, cancha_de, ruta, titulo):
    celda = {}
    for mid, b in bloque_de.items():
        celda[(cancha_de[mid], b)] = inst.partidos[mid]
    dias = []
    for b in inst.bloques:
        clave = (b.dia, b.fase)
        if not dias or dias[-1][0] != clave:
            dias.append((clave, []))
        dias[-1][1].append(b)
    h = [f"<html><head><meta charset='utf-8'><title>{titulo}</title><style>",
         "body{font-family:system-ui,sans-serif;font-size:12px;margin:16px}",
         "table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 5px;text-align:center;min-width:52px}",
         "th.dia{background:#eee}th.ext{background:#fdd}td.vacia{background:#fafafa;color:#bbb}",
         ".leyenda span{display:inline-block;padding:2px 8px;margin:2px;color:#fff;border-radius:3px}",
         "</style></head><body>", f"<h2>{titulo}</h2><div class='leyenda'>"]
    for c, col in COLORES.items():
        h.append(f"<span style='background:{col}'>{c}</span>")
    h.append("</div><table><tr><th rowspan='2'>Cancha</th>")
    for (dia, fase), bl in dias:
        h.append(f"<th class='dia' colspan='{len(bl)}'>{dia} · {fase}</th>")
    h.append("</tr><tr>")
    for _, bl in dias:
        for b in bl:
            h.append(f"<th class='{'ext' if b.extension else ''}'>{b.hora}</th>")
    h.append("</tr>")
    for c in range(1, inst.n_canchas + 1):
        h.append(f"<tr><th>{c}</th>")
        for _, bl in dias:
            for b in bl:
                m = celda.get((c, b.idx))
                if m is None:
                    h.append("<td class='vacia'>·</td>")
                else:
                    txt = m.grupo.split("-")[1] if m.fase == "previa" else m.ronda
                    h.append(f"<td style='background:{COLORES[m.categoria]};color:#fff' title='{m.id}'>"
                             f"<b>{m.categoria}</b><br>{txt}</td>")
        h.append("</tr>")
    # fila de ocupacion
    h.append("<tr><th>Ocup.</th>")
    ocup = Counter(bloque_de.values())
    for _, bl in dias:
        for b in bl:
            h.append(f"<td>{ocup.get(b.idx, 0)}/{b.cap}</td>")
    h.append("</tr></table></body></html>")
    with open(ruta, "w") as f:
        f.write("\n".join(h))


def resumen_calidad(inst, bloque_de, cancha_de, sol, params, errores):
    L = []
    bl = inst.bloques
    L.append(f"Estado del motor: {sol['mensaje']}")
    L.append(f"Tiempo: {sol['tiempo']:.1f} s   objetivo: {sol['objetivo']:.0f}   gap: {sol['gap']}")
    L.append("")
    L.append("Verificacion independiente de reglas duras: "
             + ("OK, sin errores" if not errores else f"{len(errores)} ERRORES"))
    for e in errores[:20]:
        L.append("   ! " + e)
    L.append("")
    # ocupacion por dia
    L.append("Ocupacion por tramo (partidos / casillas):")
    por_tramo = defaultdict(lambda: [0, 0])
    for b in bl:
        k = (b.dia, b.fase, b.extension)
        por_tramo[k][1] += b.cap
    for mid, b in bloque_de.items():
        bb = bl[b]
        por_tramo[(bb.dia, bb.fase, bb.extension)][0] += 1
    for (dia, fase, ext), (n, cap) in por_tramo.items():
        L.append(f"   {dia} {fase:6s}{' ext' if ext else '    '}: {n:3d}/{cap:3d}")
    ext_usados = sum(1 for mid, b in bloque_de.items() if bl[b].extension)
    L.append(f"Partidos en extension del domingo: {ext_usados}")
    L.append("")
    # grupos compactos
    pg = defaultdict(list)
    for m in inst.partidos_fase("previa"):
        pg[m.grupo].append(bloque_de[m.id])
    enteros = mismo_dia = 0
    for g, bs in pg.items():
        tam = inst.grupos[g]["tam"]
        minimo = 2 if tam == 3 else 1
        if max(bs) - min(bs) <= minimo and len({bl[b].dia for b in bs}) == 1:
            enteros += 1
        if len({bl[b].dia for b in bs}) == 1:
            mismo_dia += 1
    L.append(f"Grupos jugados como unidad (bloques seguidos, mismo dia): {enteros}/{len(pg)}")
    L.append(f"Grupos cerrados en un solo dia: {mismo_dia}/{len(pg)}")
    # misma cancha
    misma = 0
    for g in pg:
        cs = {cancha_de[m.id] for m in inst.partidos_fase("previa") if m.grupo == g}
        misma += (len(cs) == 1)
    L.append(f"Grupos en una sola cancha: {misma}/{len(pg)}")
    # dias por pareja
    dias_pj = Counter()
    for m in inst.partidos_fase("previa"):
        for pj in m.parejas:
            dias_pj[(pj, bl[bloque_de[m.id]].dia)] += 1
    por_pj = Counter(pj for pj, _ in dias_pj)
    L.append(f"Parejas que vienen 1 dia en la previa: {sum(1 for v in por_pj.values() if v == 1)}/{len(por_pj)}"
             f"   (2 dias: {sum(1 for v in por_pj.values() if v == 2)})")
    # partidos en horario laboral
    lab = sum(1 for m in inst.partidos_fase("previa")
              if bl[bloque_de[m.id]].dia in ("Jue", "Vie") and bl[bloque_de[m.id]].hora < "19:00")
    L.append(f"Partidos de grupos en horario laboral (jue/vie antes de 19:00): {lab}")
    # seguidos por persona
    maxseg = 0
    for per in inst.personas:
        bs = sorted(bloque_de[m] for m in inst.partidos_potenciales(per) if inst.partidos[m].fase == "previa")
        run = best = 1
        for i in range(1, len(bs)):
            if bs[i] == bs[i - 1] + 1 and bl[bs[i]].dia == bl[bs[i - 1]].dia:
                run += 1
            else:
                run = 1
            best = max(best, run)
        maxseg = max(maxseg, best)
    L.append(f"Maximo de bloques seguidos de una misma persona en la previa: {maxseg}")
    # finales
    L.append("Finales:")
    for m in sorted(inst.partidos_fase("final"), key=lambda m: bloque_de[m.id]):
        if m.ronda == "final":
            b = bl[bloque_de[m.id]]
            L.append(f"   {m.categoria:4s} {b.dia} {b.hora} cancha {cancha_de[m.id]}")
    # primer partido de la final por categoria
    L.append("Primer partido de cuadro por categoria:")
    for cat in inst.categorias:
        b = min(bloque_de[m.id] for m in inst.partidos_fase("final") if m.categoria == cat)
        L.append(f"   {cat:4s} {bl[b].dia} {bl[b].hora}")
    L.append(f"Posibles choques de doble categoria en rondas tardias (se resuelven al re-planificar): "
             f"{sol['choques']}")
    if sol["violaciones"]:
        L.append("")
        L.append("Violaciones de disponibilidad aceptadas (modo relajado):")
        for mid, b in sol["violaciones"]:
            L.append(f"   {mid} en {bl[b].dia} {bl[b].hora}")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sin-frontera", action="store_true", help="la final puede usar bloques de previa")
    ap.add_argument("--relajado", action="store_true", help="modo BR-04: publica aunque se violen disponibilidades")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--tiempo", type=int, default=120)
    ap.add_argument("--canchas", type=int, default=8)
    ap.add_argument("--salida", default="salida")
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args()

    params = {"frontera_sabado": not a.sin_frontera, "disponibilidad_dura": not a.relajado,
              "tiempo_max": a.tiempo}
    inst = generar(seed=a.seed, n_canchas=a.canchas)
    os.makedirs(a.salida, exist_ok=True)

    print("Instancia:")
    print(f"  {len(inst.parejas)} parejas, {len(inst.personas)} personas "
          f"({len(inst.personas_doble())} en doble categoria), {len(inst.grupos)} grupos, "
          f"{len(inst.partidos)} partidos, {inst.n_canchas} canchas, {len(inst.bloques)} bloques")
    print("Semaforo de admision:")
    print(semaforo(inst, params))
    sys.stdout.flush()

    modelo = Modelo(inst, params)
    print(f"Modelo: {modelo.n_vars} variables, {modelo.n_rest} restricciones. Resolviendo...")
    sys.stdout.flush()
    sol = modelo.resolver(verbose=a.verbose)
    if sol is None:
        print("INFACTIBLE con disponibilidad dura:", modelo.res.message)
        if not a.relajado:
            print("Reintentando en modo relajado (BR-04) para identificar las parejas en conflicto...")
            params["disponibilidad_dura"] = False
            modelo = Modelo(inst, params)
            sol = modelo.resolver(verbose=a.verbose)
            if sol is None:
                print("Tampoco hay solucion relajada:", modelo.res.message)
                return
    cancha_de = asignar_canchas(inst, sol["bloque"])
    errores = verificar(inst, sol["bloque"], cancha_de, {**PARAMS, **params})
    # en modo relajado las violaciones de disponibilidad son esperadas
    if not params["disponibilidad_dura"]:
        errores = [e for e in errores if not e.startswith("disponibilidad")]

    texto = resumen_calidad(inst, sol["bloque"], cancha_de, sol, params, errores)
    print(texto)
    with open(os.path.join(a.salida, "resumen.txt"), "w") as f:
        f.write("Instancia: " + f"{len(inst.parejas)} parejas, {len(inst.partidos)} partidos, "
                f"{inst.n_canchas} canchas\n" + "Semaforo:\n" + semaforo(inst, params) + "\n\n" + texto)
    escribir_csv(inst, sol["bloque"], cancha_de, os.path.join(a.salida, "agenda.csv"))
    escribir_html(inst, sol["bloque"], cancha_de, os.path.join(a.salida, "grilla.html"),
                  f"Agenda del torneo (semilla {a.seed}, "
                  f"{'con' if params['frontera_sabado'] else 'sin'} frontera del sabado)")


if __name__ == "__main__":
    main()
