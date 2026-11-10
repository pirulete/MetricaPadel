# Guía de operación del motor de agenda de torneos

Versión del prototipo: noviembre 2026
Motor de resolución: HiGHS (incluido en scipy); portable a CP-SAT de OR-Tools.

---

## 1. Qué es y qué no es

El motor es una **librería de cálculo**: recibe la descripción completa de un torneo
y devuelve, para cada partido, un bloque horario y una cancha. Nada más.

- No tiene base de datos ni pantalla. No guarda nada entre corridas.
- No decide la estructura deportiva (grupos, cruces, quién avanza). Eso entra como dato.
- Hoy los datos de entrada los **inventa** el archivo `instancia.py`, con la estructura
  del torneo real que usamos de referencia (8 categorías, 50 grupos, 155 parejas,
  8 canchas). Para usarlo con un torneo real hay que reemplazar esa pieza por un
  cargador de datos (ver sección 6).

Vocabulario usado en este documento:

| Término | Significado |
|---|---|
| Bloque | Unidad de tiempo de la agenda: 75 minutos. Un partido ocupa exactamente un bloque en una cancha. |
| Casilla | Un bloque en una cancha. Es el espacio donde cabe un partido. |
| Previa | Fase de grupos (jueves, viernes y sábado hasta las 18:00). |
| Final | Fase de cuadros (sábado desde las 18:00 y domingo). |
| Extensión | Los 3 bloques del domingo después de las 19:15, usados solo si hace falta. |
| Ocupación | Partidos a agendar dividido por casillas disponibles. Sobre 1 no cabe. |
| Restricción dura | Regla que la agenda nunca puede violar. |
| Restricción blanda | Preferencia: el motor la cumple cuando puede y paga una penalización cuando no. |
| Camino potencial | En la fase final, los partidos donde una persona *podría* estar según cómo avance. |
| Doble categoría | Persona inscrita en dos parejas de categorías distintas. |

---

## 2. Archivos

| Archivo | Función |
|---|---|
| `instancia.py` | Genera la instancia de prueba (calendario, canchas, grupos, parejas, personas, disponibilidad, cuadros). Es el archivo a reemplazar con datos reales. |
| `modelo.py` | El modelo de optimización: variables, restricciones, objetivo, y la asignación de canchas posterior. Aquí viven los parámetros y los pesos. |
| `verificar.py` | Verificador independiente: revisa la agenda contra todas las reglas duras sin usar nada del modelo. |
| `correr.py` | Programa principal: arma la instancia, resuelve, verifica y escribe los archivos de salida. |
| `README.md` | Resumen técnico del modelo. |

---

## 3. Instalación

Requisitos: Python 3.10 o superior.

1. Descomprimir `motor_torneo.zip` en una carpeta, por ejemplo `motor_torneo/`.
2. Abrir una terminal en esa carpeta.
3. Instalar las dependencias:

```
pip install numpy scipy
```

4. Comprobar que funciona:

```
python3 instancia.py
```

Debe imprimir el tamaño de la instancia (38 bloques, 155 parejas, 247 partidos) y el
cuadro de la categoría 2da. Si aparece un error de importación, falta alguna dependencia.

Opcional, recomendado para el producto: `pip install ortools`. El modelo está escrito
para programación entera genérica y cada restricción de `modelo.py` lleva un comentario
`[CP-SAT]` con su equivalente en OR-Tools; la portación es mecánica.

---

## 4. Correr el motor

Corrida básica:

```
python3 correr.py --tiempo 300
```

Opciones:

| Opción | Efecto | Valor por defecto |
|---|---|---|
| `--tiempo S` | Segundos máximos de búsqueda. El motor entrega la mejor agenda que encontró en ese tiempo. | 120 |
| `--canchas N` | Cantidad de canchas. | 8 |
| `--seed N` | Semilla de la instancia de prueba: cambia el sorteo y la disponibilidad. | 7 |
| `--sin-frontera` | Permite que partidos de cuadro se jueguen en bloques de la previa (prueba de la regla "la final empieza el sábado a las 18:00"). | frontera activa |
| `--relajado` | Modo BR-04: publica aunque haya que violar disponibilidades, y las lista. | disponibilidad dura |
| `--salida CARPETA` | Dónde escribir los resultados. | `salida/` |
| `--verbose` | Muestra el avance interno del motor. | apagado |

Sobre el tiempo: con 120 segundos sale una agenda factible y razonable; con 300 sale
una claramente mejor (en la prueba de referencia, pasó de 147 a 153 parejas que vienen
un solo día y de 30 a 36 grupos jugados como unidad). Más allá de 5 minutos la mejora
es marginal con HiGHS. El motor casi nunca llega a demostrar que su agenda es la óptima
absoluta; eso es normal y no afecta la validez de la agenda.

Uso de recursos: el motor ocupa toda la CPU disponible mientras corre y menos de
1 GB de memoria. Una máquina con 2 núcleos y 2 GB alcanza.

---

## 5. Leer los resultados

La carpeta de salida contiene tres archivos.

### `resumen.txt`

Es lo primero que hay que mirar. Secciones, en orden:

1. **Semáforo de admisión.** Ocupación de cada fase antes de resolver.
   - ROJO (sobre 1,0): el torneo no cabe. No tiene sentido correr el motor; hay que
     agregar canchas, bloques o quitar categorías. (El motor igual corre y va a fallar
     o usar extensión.)
   - AMARILLO (0,85 a 1,0): cabe, sin margen. Es la zona del torneo real. Esperar
     agendas apretadas y poca tolerancia a retrasos.
   - VERDE (bajo 0,85): hay holgura; el motor tiene espacio para optimizar.
2. **Estado del motor.** "Time limit reached" es lo habitual y significa que entregó la
   mejor agenda encontrada en el tiempo dado. "Optimal" significa que además demostró
   que no hay mejor. "Infeasible" significa que no existe agenda que cumpla todas las
   reglas duras: ver sección 7.
3. **Verificación independiente.** Debe decir "OK, sin errores". Si lista errores,
   la agenda NO se usa: hay un defecto en el modelo y hay que reportarlo.
4. **Ocupación por tramo.** Partidos agendados por día y fase. Lo que importa:
   "Partidos en extensión del domingo" debería ser 0.
5. **Indicadores de calidad.** Grupos jugados como unidad, grupos en un solo día,
   grupos en una sola cancha, parejas que vienen un solo día a la previa, partidos en
   horario laboral, máximo de bloques seguidos por persona. No hay valores "correctos":
   sirven para comparar corridas y escenarios.
6. **Finales y primer partido de cuadro por categoría.** Para revisar a ojo que el
   cierre del torneo tiene sentido.
7. **Choques posibles de doble categoría.** Pares de partidos de cuartos en adelante
   donde una persona en doble categoría tendría que estar en dos canchas *si gana en
   ambas*. No son errores: se resuelven re-planificando después de cada ronda, cuando
   ya se sabe quién sigue en juego.
8. **Violaciones de disponibilidad** (solo en modo relajado): qué partidos quedaron en
   un bloque que una pareja había bloqueado. Es la lista que el organizador tiene que
   negociar por teléfono.

### `agenda.csv`

Una fila por partido, ordenada por bloque y cancha. Columnas: partido, categoría, fase,
ronda, grupo, pareja 1, pareja 2, grupos de origen (en cuadros), día, hora, bloque,
cancha. Se abre con Excel o Google Sheets. Es la fuente para el tablón del club, los
mensajes a las parejas y cualquier otra vista.

### `grilla.html`

Canchas en filas, bloques en columnas, un color por categoría. Se abre con cualquier
navegador. Al pasar el cursor sobre una celda aparece el identificador del partido. La
última fila muestra ocupación por bloque. Es la forma más rápida de detectar huecos raros
o días desbalanceados.

---

## 6. Conectar datos reales

Es el paso pendiente para usar el motor en un torneo de verdad. Consiste en escribir una
función que arme el objeto `Instancia` (definido en `instancia.py`) a partir de datos
externos, en vez de inventarlos. Los datos necesarios y de dónde salen en el producto:

| Dato | Origen | Forma |
|---|---|---|
| Calendario de bloques | Configuración del torneo | Lista de tramos: día, hora de inicio, cantidad de bloques, fase, si es extensión. |
| Canchas | Configuración del club | Número total; opcionalmente una capacidad menor en bloques puntuales (cancha reservada para socios, cancha sin luz). |
| Categorías y grupos | Sorteo | Por categoría: sexo, lista de grupos, cada grupo con sus 3 o 4 parejas. |
| Parejas | Inscripción | Identificador, categoría, grupo, las dos personas. La identidad de la persona (RUT, correo) debe ser única: es lo que permite detectar la doble categoría. |
| Bloques no disponibles | Inscripción | Por pareja, lista de bloques de la previa marcados como "no puedo". Lista vacía = disponible siempre. |

Formato de intercambio sugerido (JSON), que el servidor del producto arma desde su base
de datos y el motor lee:

```json
{
  "calendario": [
    {"dia": "Jue", "inicio": "14:00", "bloques": 7, "fase": "previa", "extension": false},
    {"dia": "Vie", "inicio": "14:00", "bloques": 7, "fase": "previa", "extension": false},
    {"dia": "Sab", "inicio": "08:00", "bloques": 8, "fase": "previa", "extension": false},
    {"dia": "Sab", "inicio": "18:00", "bloques": 4, "fase": "final",  "extension": false},
    {"dia": "Dom", "inicio": "08:00", "bloques": 9, "fase": "final",  "extension": false},
    {"dia": "Dom", "inicio": "19:15", "bloques": 3, "fase": "final",  "extension": true}
  ],
  "canchas": 8,
  "capacidad_especial": {"14": 7},
  "categorias": {
    "3ra": {"sexo": "H", "grupos": {"G1": ["p101", "p102", "p103"], "G2": ["p104", "p105", "p106", "p107"]}}
  },
  "parejas": {
    "p101": {"personas": ["11111111-1", "22222222-2"], "no_disponible": [0, 1, 2, 3]},
    "p102": {"personas": ["33333333-3", "44444444-4"], "no_disponible": []}
  }
}
```

Reglas que el cargador debe aplicar antes de llamar al motor:

- Cada pareja aparece en exactamente un grupo de su categoría.
- Una persona puede estar en más de una pareja solo si son de categorías distintas.
- Los bloques de `no_disponible` deben ser bloques de la previa.
- Tope de bloques bloqueados por pareja (sugerido: 8 de 22). Más que eso vuelve casi
  imposible ubicar su grupo entero y suele ser la causa de infactibilidad.

La salida del motor para el producto es el espejo de la entrada: por partido, bloque y
cancha, más el diagnóstico (semáforo, estado, violaciones, choques posibles).

Antes de construir cualquier integración, conviene hacer esta prueba a mano: tomar los
datos del último torneo real en una planilla, cargarlos, correr el motor y comparar la
agenda con la que el organizador armó a mano. Si la del motor es comparable o mejor, el
producto tiene su argumento. Si no, faltan reglas por capturar y es el momento de
descubrirlas.

---

## 7. Qué hacer cuando no hay solución

Si el estado del motor es "Infeasible", no existe agenda que cumpla todas las reglas
duras. Causas, de más a menos frecuente:

1. **Disponibilidades incompatibles.** Una pareja bloqueó demasiados bloques, o dos
   parejas del mismo grupo bloquearon bloques complementarios. Es lo que BR-02 pide
   explicar. Procedimiento: `correr.py` reintenta solo en modo relajado y el resumen
   lista las violaciones aceptadas; esas son las parejas con las que hay que hablar.
   Con OR-Tools este diagnóstico sale directo del motor (núcleo mínimo de restricciones
   en conflicto) sin necesitar la segunda corrida.
2. **Ocupación sobre 1.** El semáforo lo avisa antes de resolver. Solución: más
   canchas, más bloques, o menos partidos (quitar consolación, grupos de 3 en vez de 4).
3. **Camino crítico que no cabe.** Una categoría necesita más rondas seguidas de las
   que caben en el domingo. Solución: permitir que esa categoría empiece su cuadro
   antes (interruptor `--sin-frontera`) o usar extensión.

Regla BR-04: el motor nunca debe impedir publicar. El modo relajado es la implementación
de esa regla: siempre entrega una agenda y dice qué se violó.

---

## 8. Ajustar el comportamiento

Todo lo que es política (no dato) está al inicio de `modelo.py`, en `PARAMS`:

| Parámetro | Qué controla |
|---|---|
| `frontera_sabado` | Si la final solo puede usar bloques de final. |
| `descanso_final` | Bloques libres mínimos entre dos rondas de una misma categoría (1 = un bloque libre). |
| `max_seguidos` | Tope blando de bloques consecutivos por persona en la previa. |
| `bloque_final_objetivo` | Bloque antes del cual una final se penaliza (33 = domingo 16:45). |
| `doble_dura_en` | Rondas de la final donde el choque de doble categoría es duro (resto: blando). |
| `disponibilidad_dura` | Si las disponibilidades son duras o penalizadas (modo BR-04). |
| `W_*` | Pesos del objetivo, de mayor a menor prioridad: extensión, disponibilidad violada, choque de doble categoría, días por pareja, final temprana, compacidad de grupos, bloques seguidos, empaquetar la final al inicio. |

Cambiar un peso cambia qué sacrifica el motor cuando no puede tener todo. Por ejemplo,
subir `W_COMPACTO` produce más grupos jugados como unidad a costa de más parejas que
vienen dos días. Conviene cambiar un parámetro a la vez y comparar los indicadores del
resumen entre corridas.

---

## 9. Dónde vive en el producto

El motor tarda entre uno y cinco minutos y ocupa toda la CPU mientras corre. Por eso
**no va dentro del servidor web** que atiende inscripciones y muestra cuadros: lo dejaría
sin responder. Va como un servicio aparte, con este flujo:

1. El organizador aprieta "generar agenda" en el panel.
2. El servidor web arma el JSON de entrada (sección 6) desde la base de datos y lo deja
   en una cola de trabajos.
3. Un proceso trabajador (un contenedor con Python, 2 núcleos, 2 GB) toma el trabajo,
   corre el motor y guarda la agenda en la base de datos con estado "borrador", junto
   con el diagnóstico.
4. El panel muestra el borrador en una grilla como `grilla.html`. El organizador ajusta
   a mano lo que quiera y publica.

El panel le avisa al organizador cuando el borrador está listo; no se queda esperando.

Para hospedar el trabajador sirve cualquier servicio de contenedores (Cloud Run,
Fly.io, Railway, una máquina virtual pequeña). Lo importante es que sea una pieza
separada del servidor web y que la comunicación sea asíncrona (por cola, no por
llamada directa).

### Re-planificación durante el torneo

Es el mismo trabajador y el mismo modelo. El trabajo lleva además:

- la lista de partidos ya jugados, con su resultado (define quién sigue y elimina del
  camino potencial a quien perdió);
- los partidos inminentes (próximos 2 bloques), que se fijan donde están;
- la agenda publicada, para penalizar los cambios y que el motor mueva lo mínimo.

Se dispara después de cada ronda de la final o ante un WO o una retirada. Con la
instancia reducida (la previa ya jugada, los caminos potenciales ya definidos) el tiempo
de respuesta esperable es de segundos, no de minutos. Esta parte no está implementada en
el prototipo; es el siguiente paso.

---

## 10. Lista de verificación antes de publicar una agenda

- [ ] El semáforo no está en rojo.
- [ ] La verificación independiente dice "OK, sin errores".
- [ ] Partidos en extensión del domingo: 0 (o justificados).
- [ ] No hay violaciones de disponibilidad, o están negociadas con las parejas.
- [ ] Las finales caen donde el club quiere el cierre.
- [ ] Las personas en doble categoría conocen sus posibles choques en rondas tardías y aceptaron jugar seguido.
- [ ] La grilla no muestra huecos aislados en medio de un día (si los hay, subir el tiempo de corrida y repetir).
