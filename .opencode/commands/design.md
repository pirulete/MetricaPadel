---
description: UX/UI design workflow — de idea a mockup navegable con alternativas y tradeoffs
template: |
  Ejecuta el workflow design para la siguiente idea: {ARGUMENTS}

  Sigue esta secuencia:
  1. @pm: crear feature-spec.md + release-scope.md
  2. @ui-designer: auditar UI kit, presentar alternativas con tradeoffs, generar design-exploration.md
  3. Usuario: elegir alternativa o rechazar con feedback
  4. @ui-designer: generar mockup navegable en components/preview/
  5. @ponytail-reviewer: revisar mockup por sobreingeniería

  Todos los artifacts van en production_artifacts/YYYY-MM-DD-short-slug/

  Reglas:
  - no crear componentes nuevos si uno existente cubre >80% del caso
  - toda alternativa debe incluir tabla de tradeoffs comparativa
  - el mockup debe cubrir estados: default, empty, loading, error
  - el mockup es efímero — se documenta en artifacts, no es código de producción
---

Cuando el usuario escriba:

/design <idea>

seguir esta secuencia:

## 0. Inicialización

- Crear directorio `production_artifacts/YYYY-MM-DD-short-slug/` (con sufijo -v2, -v3 si ya existe)
- Extraer slug del change_id para usar como nombre del mockup: `components/preview/${slug}.tsx`

## 0.5 Pre-Flight Gate Check

Antes de iniciar el workflow, leer `.validation/status.json`:

```
Leer .validation/status.json
Si status = "fail":
  - NOTIFICAR al usuario: "No puedes iniciar un workflow mientras el validation gate esté en estado 'fail'."
  - Mostrar los gates fallidos: .failed_gates
  - DETENER el workflow.
  - Recomendar: ejecuta /validate primero para diagnosticar y resolver.
Si status = "pass" o "none":
  - CONTINUAR con el workflow.
```

**Gate de bloqueo:** Si `.validation/status.json.status === "fail"`, el workflow se detiene inmediatamente.

## 1. @pm — Especificación

Invoca:
```
task(description="Spec de feature", subagent_type="pm", prompt="
  Actúa como @pm. Sigue las reglas de AGENTS.md para @pm.
  Lee la idea: {ARGUMENTS}.
  Contrasta con FEATURES.md (si existe) para identificar si ya está parcial o totalmente implementada.
  Define: problema, objetivo, alcance, acceptance criteria, edge cases, riesgos, dependencias y out-of-scope.
  Si la idea ya está parcialmente implementada, especifica el gap exacto entre estado actual y estado deseado.
  Genera production_artifacts/YYYY-MM-DD-short-slug/feature-spec.md
  Genera production_artifacts/YYYY-MM-DD-short-slug/release-scope.md
")
```

**Quality Gate 1:** Validar que feature-spec.md tiene:
- [ ] Problema definido
- [ ] Objetivo claro
- [ ] Alcance delimitado
- [ ] Acceptance criteria (mínimo 3)
- [ ] Edge cases identificados
- [ ] Out-of-scope explícito

Si NO pasa el gate → devolver a @pm con feedback específico sobre qué falta.

## 2. @ui-designer — Exploración de Diseño

Invoca:
```
task(description="Exploración de diseño", subagent_type="ui-designer", prompt="
  Actúa como @ui-designer. Sigue las reglas de AGENTS.md para @ui-designer.
  Lee feature-spec.md y release-scope.md generados por @pm.

  Paso 1 — UI Kit Audit:
  - Audita componentes existentes (shadcn/ui + custom) contra los requerimientos de la spec.
  - Documenta qué componentes se reutilizan y qué gaps existen.
  - Genera production_artifacts/YYYY-MM-DD-short-slug/ui-kit-audit.md

  Paso 2 — Alternativas con Tradeoffs:
  - Presenta 2-3 alternativas de diseño.
  - Cada alternativa incluye:
    - Wireframe ASCII del layout principal
    - Lista de componentes a reutilizar vs crear
    - Estados cubiertos: default, empty, loading, error
    - Responsive: mobile + desktop breakpoints
  - Tabla comparativa de tradeoffs:
    | Criterio | Opción A | Opción B | Opción C |
    | Complejidad de implementación | Baja/Media/Alta | ... | ... |
    | Reutilización de componentes existentes | XX% | ... | ... |
    | Impacto visual | Conservador/Moderado/Alto | ... | ... |
    | Accesibilidad WCAG AA | Sí/Needs review | ... | ... |
    | Consistencia con diseño actual | Alta/Media/Baja | ... | ... |
  - Recomendar una opción con justificación clara.
  - Generar production_artifacts/YYYY-MM-DD-short-slug/design-exploration.md
")
```

**Quality Gate 2:** Validar que design-exploration.md tiene:
- [ ] UI kit audit completado
- [ ] Mínimo 2 alternativas presentadas
- [ ] Tabla de tradeoffs comparativa
- [ ] Wireframes ASCII por alternativa
- [ ] Estados cubiertos listados
- [ ] Recomendación con justificación

Si NO pasa el gate → devolver a @ui-designer con feedback específico.

## 3. Decisión del Usuario

Presentar al usuario:
1. Resumen de alternativas con tradeoffs
2. Link al artifact `design-exploration.md`
3. Preguntar: "¿Cuál alternativa prefieres? (A/B/C) o ¿Quieres ajustes?"

**Si el usuario rechaza con feedback:**
- Reenviar feedback a @ui-designer
- @ui-designer genera nueva iteración (máx 1 iteración de ajustes)
- Volver a presentar alternativas ajustadas

**Si el usuario aprueba:**
- Continuar al Step 4
- Generar `production_artifacts/YYYY-MM-DD-short-slug/design-approved.md` con:
  - Alternativa elegida
  - Feedback del usuario (si hubo)
  - Componentes confirmados a reutilizar/crear

## 4. @ui-designer — Mockup Navegable

Invoca:
```
task(description="Mockup navegable", subagent_type="ui-designer", prompt="
  Actúa como @ui-designer. Sigue las reglas de AGENTS.md para @ui-designer.
  Lee design-approved.md para saber qué alternativa fue elegida.

  Crear un mockup navegable en components/preview/${slug}.tsx que:
  - Use el componente PreviewShell como wrapper
  - Incluya TODOS los estados: default, empty, loading, error
  - Sea responsive: mobile (375px) + desktop (1440px)
  - Use SOLO componentes del UI kit existente (shadcn/ui + custom)
  - No contenga lógica de negocio real — usar datos mock
  - Sea interactuable: botones, tabs, toggles funcionales con useState
  - Use colores del sistema (bg-primary, text-muted-foreground, etc.)

  Generar production_artifacts/YYYY-MM-DD-short-slug/mockup-spec.md con:
  - Descripción del mockup
  - Estados implementados
  - Componentes utilizados
  - Viewports soportados
  - Instrucciones para ver: /preview/${slug}
")
```

**Validación post-mockup:**
- Verificar que el archivo `components/preview/${slug}.tsx` existe
- Verificar que importa componentes existentes (no inventados)
- Verificar que usa CSS variables del sistema de colores

## 4.5 @ponytail-reviewer — Filtro de simplicidad del mockup

Invoca:
```
task(description="Ponytail review del mockup", subagent_type="ponytail-reviewer", prompt="
  Actúa como @ponytail-reviewer. Sigue las reglas de AGENTS.md para @ponytail-reviewer.
  Revisa el mockup en components/preview/${slug}.tsx.
  Aplica la Escalera Ponytail:
  1. YAGNI — ¿este estado o interacción necesita existir en el mockup?
  2. Plataforma Nativa — ¿useState simple basta en vez de un hook custom?
  3. Dependencias Existentes — ¿usa componentes shadcn/ui en vez de crear los suyos?
  4. Regla de la Línea Única — ¿puede simplificarse?
  Genera production_artifacts/YYYY-MM-DD-short-slug/ponytail-review-report.md
")
```

## 5. Cierre

Reportar al usuario:
- Diseño completado y mockup disponible en `/preview/${slug}`
- Lista de artifacts generados
- Siguiente paso recomendado: `/ship-feature {idea} --design-ref=${slug}`

**Artifacts generados:**
- [ ] feature-spec.md
- [ ] release-scope.md
- [ ] ui-kit-audit.md
- [ ] design-exploration.md
- [ ] design-approved.md
- [ ] mockup-spec.md
- [ ] ponytail-review-report.md
- [ ] components/preview/${slug}.tsx (mockup efímero)

## Reglas

- no crear componentes nuevos si uno existente cubre >80% del caso de uso
- toda alternativa debe incluir tabla de tradeoffs comparativa
- el mockup debe cubrir estados: default, empty, loading, error
- el mockup es efímero — se documenta en artifacts, no es código de producción
- colores solo del sistema de CSS variables (globals.css)
- accesibilidad WCAG AA obligatoria en todas las alternativas
- máxima 1 iteración de ajustes tras feedback del usuario
