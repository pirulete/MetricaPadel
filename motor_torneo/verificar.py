"""
Verificador independiente: revisa una agenda contra todas las reglas duras,
sin usar nada del modelo. Si el modelo tiene un error, esto lo delata.
"""


def verificar(inst, bloque_de, cancha_de, params):
    errores = []
    bloques = inst.bloques
    sep = 1 + params["descanso_final"]

    # 1. cada partido tiene bloque y cancha
    for mid in inst.partidos:
        if mid not in bloque_de:
            errores.append(f"sin bloque: {mid}")
        if mid not in cancha_de:
            errores.append(f"sin cancha: {mid}")
    if errores:
        return errores

    # 2. capacidad y canchas distintas por bloque
    ocup = {}
    for mid, b in bloque_de.items():
        ocup.setdefault(b, []).append(mid)
    for b, ms in ocup.items():
        if len(ms) > bloques[b].cap:
            errores.append(f"capacidad excedida en bloque {b}: {len(ms)} > {bloques[b].cap}")
        canchas = [cancha_de[m] for m in ms]
        if len(set(canchas)) != len(canchas):
            errores.append(f"dos partidos en la misma cancha, bloque {b}")
        for m in ms:
            if not (1 <= cancha_de[m] <= inst.n_canchas):
                errores.append(f"cancha invalida {cancha_de[m]} en {m}")

    # 3. persona en dos partidos a la vez (previa exacta, final potencial)
    for per, info in inst.personas.items():
        ms = inst.partidos_potenciales(per)
        doble = len(info["parejas"]) > 1
        duras = set(params["doble_dura_en"])
        if not doble:
            # una sola categoria: en la final sus partidos potenciales de una
            # misma ronda son alternativas; solo se revisa la previa
            ms = [m for m in ms if inst.partidos[m].fase == "previa"]
        else:
            ms = [m for m in ms if inst.partidos[m].fase == "previa"
                  or inst.partidos[m].ronda in duras]
        por_b = {}
        for m in ms:
            por_b.setdefault(bloque_de[m], []).append(m)
        for b, lst in por_b.items():
            if len(lst) > 1:
                errores.append(f"persona {per} en dos partidos en bloque {b}: {lst}")

    # 4. disponibilidad (previa)
    for m in inst.partidos_fase("previa"):
        for pj in m.parejas:
            if bloque_de[m.id] in inst.parejas[pj].bloqueados:
                errores.append(f"disponibilidad violada: {m.id} en bloque {bloque_de[m.id]} ({pj})")

    # 5. precedencias
    partidos_de_grupo = {}
    for m in inst.partidos_fase("previa"):
        partidos_de_grupo.setdefault(m.grupo, []).append(m.id)
    for m in inst.partidos_fase("final"):
        feeders = list(m.alimentadores)
        cubiertos = set()
        for f in m.alimentadores:
            cubiertos |= inst.partidos[f].grupos_origen
        for g in m.grupos_origen - cubiertos:
            feeders += partidos_de_grupo[g]
        for f in feeders:
            if bloque_de[m.id] < bloque_de[f] + sep:
                errores.append(f"precedencia: {m.id} (b{bloque_de[m.id]}) antes de {f} (b{bloque_de[f]})")

    # 6. fase
    if params["frontera_sabado"]:
        for m in inst.partidos.values():
            if bloques[bloque_de[m.id]].fase != m.fase:
                errores.append(f"fase incorrecta: {m.id} en bloque {bloque_de[m.id]}")
    else:
        for m in inst.partidos_fase("previa"):
            if bloques[bloque_de[m.id]].fase != "previa":
                errores.append(f"previa fuera de bloques de previa: {m.id}")
    return errores
