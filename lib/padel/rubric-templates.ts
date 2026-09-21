/**
 * Plantilla "Rúbrica Integral de Pádel" — 6 dimensiones × 4 niveles × 1 criterio cada una.
 * Uso: seed manual o API POST /api/rubrics con esta estructura.
 *
 * Dimensiones cubiertas:
 *   1. Reglas y conocimiento del juego
 *   2. Técnica básica (agarre, golpes de fondo, voleas)
 *   3. Técnica específica (bandejas, víboras, remates, globo)
 *   4. Táctica y toma de decisiones
 *   5. Condición física y resistencia
 *   6. Actitud, cooperación y trabajo en equipo
 */
export const RUBRICA_INTEGRAL_TEMPLATE = {
  title: "Rúbrica Integral de Pádel",
  category: "reglas",
  criteria: [
    {
      name: "Reglas y conocimiento del juego",
      descriptors: [
        "Conoce y aplica correctamente todas las reglas en juego real (puntuación, saque, faltas, posiciones, rotaciones).",
        "Conoce la mayoría de las reglas y las aplica bien en la mayoría de las situaciones.",
        "Conoce las reglas básicas, pero comete errores frecuentes al aplicarlas.",
        "Tiene conocimientos muy limitados de las reglas y no las aplica correctamente.",
      ],
    },
    {
      name: "Técnica de golpes básicos",
      descriptors: [
        "Ejecuta los golpes con técnica adecuada, control, dirección y consistencia en situaciones de juego (derecha, revés, volea, saque).",
        "Ejecuta correctamente la mayoría de los golpes básicos con control aceptable.",
        "Ejecuta algunos golpes básicos, pero con errores técnicos y poca consistencia.",
        "No logra ejecutar correctamente los golpes básicos de forma consistente.",
      ],
    },
    {
      name: "Golpes específicos de pádel",
      descriptors: [
        "Usa con fluidez y precisión golpes específicos según la situación (bandeja, víbora, remate, globo, salida de pared), con buena lectura y timing.",
        "Usa varios golpes específicos de forma correcta en situaciones típicas de juego.",
        "Intenta usar golpes específicos, pero con muchos errores de timing o ejecución.",
        "Apenas utiliza golpes específicos; se limita a golpes básicos.",
      ],
    },
    {
      name: "Táctica y toma de decisiones",
      descriptors: [
        "Elige el golpe y la posición óptimos, ajusta su estrategia según el rival y el desarrollo del punto.",
        "Toma decisiones tácticas adecuadas en la mayoría de los puntos.",
        "Muestra cierta intención táctica, pero con decisiones poco eficaces o tardías.",
        "Juega de forma reactiva, sin planificación táctica clara.",
      ],
    },
    {
      name: "Desplazamiento y condición física",
      descriptors: [
        "Se mueve de forma eficiente, llega a la mayoría de las bolas y mantiene buen nivel físico durante el juego.",
        "Se desplaza bien en la mayoría de las situaciones y mantiene un nivel físico aceptable.",
        "Se cansa con facilidad o llega tarde a varias bolas por falta de desplazamiento.",
        "Presenta dificultades importantes de movilidad y resistencia en pista.",
      ],
    },
    {
      name: "Trabajo en pareja y actitud",
      descriptors: [
        "Se comunica constantemente con su pareja, muestra liderazgo positivo, respeta y acepta correcciones.",
        "Se comunica y colabora bien, con actitud positiva la mayor parte del tiempo.",
        "Colabora de forma intermitente; a veces le cuesta comunicarse o mantener actitud constructiva.",
        "Muestra poca colaboración, comunicación deficiente o actitud negativa.",
      ],
    },
  ],
} as const;
