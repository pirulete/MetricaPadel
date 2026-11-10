#!/usr/bin/env python3
"""Exporta las golden fixtures del motor de torneos (one-shot, NO corre en CI).

Importa el prototipo congelado `motor_torneo/{instancia,modelo}.py` (sin resolver:
solo construir) y escribe JSON en `tests/fixtures/torneo/`.

    motor_torneo/.venv/bin/python scripts/torneo-export-fixtures.py

Requiere numpy + scipy (solo para construir el modelo; no se resuelve).
Salidas (semilla 7, 8 canchas — defaults de `generar()`):

    instance.json     instancia completa + derivados (L1/L2)
    structure.json    solo bloques + partidos (L1 exacta)
    model-stats.json  tamaño del modelo (L3: nVars/nRest + familias)

Los tres archivos viven planos en `tests/fixtures/torneo/` (una sola copia: la
carpeta `reference/` del change-map §9 se colapsó aquí para no duplicar 150 KB
de JSON por fixture).
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROTOTIPO = ROOT / "motor_torneo"
sys.path.insert(0, str(PROTOTIPO))

from instancia import Bloque, Partido, generar  # noqa: E402
from modelo import PARAMS, Modelo  # noqa: E402

SEED = 7
CANCHAS = 8
FIXTURES = ROOT / "tests" / "fixtures" / "torneo"


def bloque_a_json(bloque: Bloque) -> dict:
    return {
        "idx": bloque.idx,
        "dayLabel": bloque.dia,
        "startTime": bloque.hora,
        "phase": bloque.fase,
        "isExtension": bloque.extension,
        "capacity": bloque.cap,
    }


def partido_a_json(partido: Partido, grupos_por_id: dict) -> dict:
    return {
        "id": partido.id,
        "categoria": partido.categoria,
        "phase": partido.fase,
        "ronda": partido.ronda,
        "grupo": partido.grupo,
        "parejas": list(partido.parejas) if partido.parejas else None,
        "gruposOrigen": sorted(partido.grupos_origen),
        "alimentadores": list(partido.alimentadores),
        "grupoTam": grupos_por_id.get(partido.grupo, {}).get("tam") if partido.grupo else None,
    }


def partidos_ordenados(partidos: dict) -> list:
    return [partidos[pid] for pid in sorted(partidos)]


def construir_instance_json(inst) -> dict:
    return {
        "meta": {
            "seed": inst.seed,
            "courts": inst.n_canchas,
            "source": "motor_torneo/instancia.py:generar",
            "frase": "golden L1/L2 — no editar a mano",
        },
        "bloques": [bloque_a_json(b) for b in inst.bloques],
        "nCanchas": inst.n_canchas,
        "categorias": {
            cat: {"sex": info["sexo"], "level": info["nivel"], "grupos": list(info["grupos"])}
            for cat, info in inst.categorias.items()
        },
        "grupos": {
            gid: {"categoria": g["cat"], "parejas": list(g["parejas"]), "tam": g["tam"]}
            for gid, g in inst.grupos.items()
        },
        "parejas": {
            pid: {
                "id": pj.id,
                "categoria": pj.categoria,
                "grupo": pj.grupo,
                "personas": list(pj.personas),
                "bloqueados": sorted(pj.bloqueados),
            }
            for pid, pj in inst.parejas.items()
        },
        "personas": {
            pid: {"sexo": p["sexo"], "parejas": list(p["parejas"])}
            for pid, p in inst.personas.items()
        },
        "partidos": [partido_a_json(p, inst.grupos) for p in partidos_ordenados(inst.partidos)],
        "conteos": conteos(inst),
    }


def conteos(inst) -> dict:
    previa = inst.partidos_fase("previa")
    final = inst.partidos_fase("final")
    rondas = Counter(p.ronda for p in final)
    return {
        "blocks": len(inst.bloques),
        "blocksPrevia": len(inst.bloques_fase("previa")),
        "blocksFinal": len(inst.bloques_fase("final")),
        "blocksExtension": sum(1 for b in inst.bloques if b.extension),
        "categories": len(inst.categorias),
        "groups": len(inst.grupos),
        "teams": len(inst.parejas),
        "persons": len(inst.personas),
        "doubleCategoryPersons": len(inst.personas_doble()),
        "matchesPrevia": len(previa),
        "matchesFinal": len(final),
        "matches": len(inst.partidos),
        "rondasFinal": dict(sorted(rondas.items())),
        "capacityTotal": sum(b.cap for b in inst.bloques),
    }


def construir_structure_json(inst) -> dict:
    """Solo lo que el port de `bracket.ts` debe reproducir byte a byte."""
    partidos = partidos_ordenados(inst.partidos)
    return {
        "meta": {
            "seed": inst.seed,
            "source": "motor_torneo/instancia.py",
            "frase": "golden L1 — bloques + partidos, orden determinista por id",
        },
        "bloques": [bloque_a_json(b) for b in inst.bloques],
        "partidos": [
            {
                "id": p.id,
                "categoria": p.categoria,
                "phase": p.fase,
                "ronda": p.ronda,
                "grupo": p.grupo,
                "parejas": list(p.parejas) if p.parejas else None,
                "gruposOrigen": sorted(p.grupos_origen),
                "alimentadores": list(p.alimentadores),
            }
            for p in partidos
        ],
        # Emparejamientos de previa por grupo (lo que genera `_partidos_grupo`).
        "grupos": {
            gid: {
                "categoria": inst.grupos[gid]["cat"],
                "tam": inst.grupos[gid]["tam"],
                "partidos": [p.id for p in partidos if p.grupo == gid],
            }
            for gid in inst.grupos
        },
        "conteos": conteos(inst),
    }


def familias_de_restriccion(modelo: Modelo) -> dict:
    familias = Counter()
    for nombre in modelo.r_nombre:
        familias[nombre.split("[")[0] or "sin_nombre"] += 1
    return dict(sorted(familias.items()))


def indicadores_de_calidad(inst, bloque_de, cancha_de) -> dict:
    """Los 6 indicadores de `correr.resumen_calidad`, en forma estructurada."""
    bl = inst.bloques
    pg: dict = {}
    for m in inst.partidos_fase("previa"):
        pg.setdefault(m.grupo, []).append(bloque_de[m.id])
    enteros = mismo_dia = misma_cancha = 0
    for g, bs in pg.items():
        tam = inst.grupos[g]["tam"]
        minimo = 2 if tam == 3 else 1
        if max(bs) - min(bs) <= minimo and len({bl[b].dia for b in bs}) == 1:
            enteros += 1
        if len({bl[b].dia for b in bs}) == 1:
            mismo_dia += 1
        cs = {cancha_de[m.id] for m in inst.partidos_fase("previa") if m.grupo == g}
        misma_cancha += (len(cs) == 1)
    dias_pj = Counter()
    for m in inst.partidos_fase("previa"):
        for pj in m.parejas:
            dias_pj[(pj, bl[bloque_de[m.id]].dia)] += 1
    por_pj = Counter(pj for pj, _ in dias_pj)
    lab = sum(1 for m in inst.partidos_fase("previa")
              if bl[bloque_de[m.id]].dia in ("Jue", "Vie") and bl[bloque_de[m.id]].hora < "19:00")
    maxseg = 0
    for per in inst.personas:
        bs = sorted(bloque_de[m] for m in inst.partidos_potenciales(per)
                    if inst.partidos[m].fase == "previa")
        run = best = 1
        for i in range(1, len(bs)):
            if bs[i] == bs[i - 1] + 1 and bl[bs[i]].dia == bl[bs[i - 1]].dia:
                run += 1
            else:
                run = 1
            best = max(best, run)
        maxseg = max(maxseg, best)
    return {
        "gruposUnidad": enteros,
        "gruposUnidadTotal": len(pg),
        "gruposMismoDia": mismo_dia,
        "gruposMismaCancha": misma_cancha,
        "parejasUnDia": sum(1 for v in por_pj.values() if v == 1),
        "parejasDosDias": sum(1 for v in por_pj.values() if v == 2),
        "partidosHorarioLaboral": lab,
        "maxBloquesSeguidos": maxseg,
        "partidosExtension": sum(1 for mid, b in bloque_de.items() if bl[b].extension),
    }


def correr_python(inst, tiempo: int) -> dict:
    """Resuelve con el prototipo (HiGHS/scipy), verifica y empaqueta L2."""
    from verificar import verificar
    modelo = Modelo(inst, {"tiempo_max": tiempo})
    sol = modelo.resolver()
    if sol is None:
        return {"status": "infeasible", "mensaje": modelo.res.message}
    from modelo import asignar_canchas
    cancha_de = asignar_canchas(inst, sol["bloque"])
    errores = verificar(inst, sol["bloque"], cancha_de, dict(PARAMS))
    agenda = [
        {"id": mid, "blockIdx": sol["bloque"][mid], "court": cancha_de[mid]}
        for mid in sorted(sol["bloque"])
    ]
    return {
        "meta": {
            "seed": inst.seed,
            "courts": inst.n_canchas,
            "tiempoMax": tiempo,
            "source": "motor_torneo/{instancia,modelo,verificar}.py",
            "frase": "golden L2 — indicadores y verificación; la agenda NO se exige igualdad",
        },
        "modelStats": {
            "nVars": modelo.n_vars,
            "nConstraints": modelo.n_rest,
            "nNonZeros": len(modelo.rows),
        },
        "status": sol["status"],
        "mensaje": sol["mensaje"],
        "objective": sol["objetivo"],
        "mipGap": sol["gap"],
        "tiempo": sol["tiempo"],
        "choquesDobleCategoria": sol["choques"],
        "verificador": errores,
        "indicadores": indicadores_de_calidad(inst, sol["bloque"], cancha_de),
        "agenda": agenda,
    }


def construir_model_stats_json(inst) -> dict:
    modelo = Modelo(inst)  # PARAMS por defecto: no se resuelve
    return {
        "meta": {
            "seed": inst.seed,
            "courts": inst.n_canchas,
            "source": "motor_torneo/modelo.py:Modelo (sin resolver)",
            "frase": "golden L3 — nº de variables y restricciones exacto",
        },
        "params": {k: (list(v) if isinstance(v, tuple) else v) for k, v in PARAMS.items()},
        "nVars": modelo.n_vars,
        "nConstraints": modelo.n_rest,
        "nNonZeros": len(modelo.rows),
        "familias": familias_de_restriccion(modelo),
        "conteos": conteos(inst),
    }


def escribir(ruta: Path, payload: dict) -> int:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return ruta.stat().st_size


def main() -> int:
    correr = "--run" in sys.argv
    tiempo = 240
    if correr:
        i = sys.argv.index("--run")
        if i + 1 < len(sys.argv) and sys.argv[i + 1].isdigit():
            tiempo = int(sys.argv[i + 1])

    inst = generar(seed=SEED, n_canchas=CANCHAS)

    instance_json = construir_instance_json(inst)
    structure_json = construir_structure_json(inst)
    model_stats_json = construir_model_stats_json(inst)

    destinos = {
        "instance.json": instance_json,
        "structure.json": structure_json,
        "model-stats.json": model_stats_json,
    }
    if correr:
        destinos["reference/python-run.json"] = correr_python(inst, tiempo)

    total = 0
    for nombre, payload in destinos.items():
        total += escribir(FIXTURES / nombre, payload)

    print(f"fixtures -> {FIXTURES.relative_to(ROOT)}")
    print(f"  instance.json    {len(instance_json['partidos'])} partidos")
    print(
        "  structure.json   "
        f"{len(structure_json['bloques'])} bloques / {len(structure_json['partidos'])} partidos"
    )
    print(
        f"  model-stats.json nVars={model_stats_json['nVars']} "
        f"nConstraints={model_stats_json['nConstraints']} "
        f"nNonZeros={model_stats_json['nNonZeros']}"
    )
    print(f"  total escrito: {total / 1024:.0f} KB")
    if correr:
        run = destinos["reference/python-run.json"]
        print(
            f"  python-run.json status={run.get('status')} "
            f"obj={run.get('objective')} gap={run.get('mipGap')} "
            f"verificador={len(run.get('verificador', []))} errores"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
