# Motor de agenda para torneos de padel (prototipo)

Prototipo del problema de optimizacion discutido: asignar los partidos de un
torneo (fase de grupos + cuadros) a una grilla de bloques de 75 minutos y canchas.

## Archivos

| Archivo | Que hace |
|---|---|
| `instancia.py` | Genera la instancia con la estructura del torneo real: 8 categorias, 50 grupos (45 de 3, 5 de 4), 155 parejas, ~8% de personas en doble categoria, disponibilidad por pareja, grilla de 38 bloques (35 + 3 de extension), cuadros con pases libres. |
| `modelo.py` | El modelo de optimizacion (programa entero) y la asignacion de canchas posterior. Cada restriccion lleva un comentario `[CP-SAT]` con su equivalente en OR-Tools. |
| `verificar.py` | Verificador independiente: revisa la agenda contra todas las reglas duras sin usar nada del modelo. |
| `correr.py` | Corre todo y escribe `agenda.csv`, `resumen.txt` y `grilla.html` en la carpeta de salida. |

## Uso

```
python3 correr.py                      # caso base
python3 correr.py --sin-frontera       # la final puede empezar antes del sabado 18:00
python3 correr.py --relajado           # modo BR-04: publica aunque viole disponibilidades
python3 correr.py --tiempo 300 --seed 3 --canchas 7
```

Requiere `numpy` y `scipy` (el motor es HiGHS, incluido en scipy). Para usar
OR-Tools: `pip install ortools` y portar `modelo.py` siguiendo los comentarios `[CP-SAT]`.

## Modelo

Variable: `x[m, b] = 1` si el partido `m` va en el bloque `b`. El bloque de un
partido es `blk[m] = sum_b b * x[m, b]`. Las canchas se asignan despues (son
intercambiables): el motor solo cuida que no haya mas partidos que canchas por bloque.

Restricciones duras:
1. Cada partido en exactamente un bloque.
2. Por bloque, a lo mas tantos partidos como canchas disponibles (capacidad por bloque, puede variar).
3. Ninguna persona en dos partidos del mismo bloque. En la previa es exacto; en la final se aplica al "camino potencial" (partidos donde la persona podria estar). Para doble categoria es duro en octavos y blando de cuartos en adelante (se resuelve al re-planificar tras cada ronda).
4. Ningun partido de grupos en un bloque que una de sus parejas marco como no disponible. En modo relajado pasa a penalizacion (BR-04).
5. Cada partido de cuadro va al menos un bloque libre despues de los que lo alimentan (octavos: despues del cierre de sus grupos de origen).
6. Previa en bloques de previa, final en bloques de final (interruptor `frontera_sabado`).

Objetivo (pesos en `PARAMS`, de mayor a menor prioridad): no usar extension del
domingo; cada pareja viene la menor cantidad de dias en la previa; finales no
antes del bloque objetivo; grupos en bloques seguidos; nadie mas de 3 bloques
seguidos; pocos choques posibles de doble categoria; fase final empaquetada
hacia el inicio (casillas vacias al final del domingo).

## Pendiente para el producto real

- Infactibilidad explicable: aqui se resuelve corriendo el modo relajado y leyendo que disponibilidades se violaron. Con CP-SAT se obtiene directo el nucleo minimo de restricciones en conflicto (resolver bajo supuestos).
- Re-planificacion del dia T: mismo modelo con los partidos jugados o inminentes fijados y un termino en el objetivo que penaliza mover lo publicado.
- Tiempos: HiGHS llega a una buena solucion en 1-2 minutos pero tarda en demostrar que es optima. CP-SAT suele ser bastante mas rapido en este tipo de problema (todo "no se solapan" y precedencias).
