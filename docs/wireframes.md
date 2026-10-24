# Wireframes (baja fidelidad)

Lineamiento: sobrio, fondo blanco/gris muy claro, azul marino `#0D3B70` para navegación y acción principal, verde `#6BC047` solo para estados positivos/confirmación. Ámbar = SLA en riesgo, rojo = SLA vencido.

## Layout general (IT / Admin)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [LOGO TML]  Sistema de Gestión TLI      🔍 Buscar…        🔔3  AG ▾  │
├──────────────┬───────────────────────────────────────────────────────┤
│ Inicio       │                                                       │
│ Tickets      │                 (contenido)                           │
│ Problemas    │                                                       │
│ Mejoras      │                                                       │
│ Clientes     │                                                       │
│ Integraciones│                                                       │
│ Conocimiento │                                                       │
│ ──────────── │                                                       │
│ Admin ▸      │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```

Usuario: menú reducido a **Mis tickets**, **Nuevo ticket**, **Ayuda (base de conocimiento)**. En celular, el menú lateral pasa a barra inferior.

## Nuevo ticket — paso 1 (usuario)

```
 Nuevo ticket                                         Paso 1 de 3
 ¿Qué querés hacer?

 ┌────────────────────────┐  ┌────────────────────────┐
 │ ⚠ Reportar un problema │  │ 📋 Pedir algo           │
 │ Algo no anda o da error│  │ Accesos, equipos,      │
 └────────────────────────┘  │ reportes               │
                             └────────────────────────┘
 ┌────────────────────────┐  ┌────────────────────────┐
 │ 💡 Proponer una mejora │  │ 🔗 Pedir una integración│
 │ o automatización       │  │ Un cliente necesita    │
 │ Algo que se hace a mano│  │ intercambiar archivos  │
 └────────────────────────┘  └────────────────────────┘
```

## Nuevo ticket — paso 2 (ej. "Proponer una mejora")

```
 Sistema*            [ WMS ▾ ]
 Título*             [______________________________________]
 ¿Cómo se hace hoy?* [______________________________________]
 ¿Cada cuánto?       ( ) Diario ( ) Semanal ( ) Mensual
 ¿Cuánto tiempo lleva cada vez? [ __ ] min
 ¿Qué ganaríamos?    [______________________________________]
 Cliente (opcional)  [ Buscar cliente… ▾ ]   Depósito [ Garín ▾ ]
 Adjuntos            ┌ Arrastrá archivos o pegá una captura (Ctrl+V) ┐
                     └───────────────────────────────────────────────┘
                                             [ Volver ]  [ Siguiente ]
```

## Nuevo ticket — paso 3 (revisión)

```
 ¿Ya está respondido?
 ┌ Artículos que podrían ayudarte ───────────────────────────────┐
 │ • Cómo reimprimir etiquetas en SGL                            │
 │ • Error "Ubicación bloqueada" al confirmar                    │
 └────────────────────────────────────────────────────────────────┘
 Resumen de lo que vas a enviar …
                                    [ Volver ]  [ Enviar ticket ]

 ✔ Ticket TLI-000123 creado. Lo vas a encontrar en "Mis tickets".
```

## Mis tickets (usuario, celular)

```
┌───────────────────────────┐
│ Mis tickets      [+ Nuevo]│
├───────────────────────────┤
│ TLI-000123                │
│ No imprime etiquetas      │
│ ● En curso   hace 2 h     │
├───────────────────────────┤
│ TLI-000118                │
│ Automatizar carga stock   │
│ ● Derivado a mejora       │
├───────────────────────────┤
│ TLI-000101                │
│ Acceso a TMS              │
│ ● Cerrado                 │
└───────────────────────────┘
```

## Bandeja de tickets (IT)

```
 Tickets   [Todos ▾] [Tipo ▾] [Estado ▾] [Prioridad ▾] [Asignado ▾] [🔍     ]
 ☐ │ N°          │ Asunto                  │ Tipo     │ Prio  │ Estado   │ SLA         │ Asignado
 ☐ │ TLI-000123  │ No imprime etiquetas    │ Problema │ Alta  │ En curso │ ▲ 25 min    │ AG
 ☐ │ TLI-000122  │ Integrar pedidos Cli X  │ Integr.  │ —     │ Nuevo    │ 1d 4h       │ —
 ☐ │ TLI-000120  │ WMS lento en Pacheco    │ Problema │ Crít. │ Asignado │ ■ Vencido   │ JP
 ──────────────────────────────────────────────────────────────────────────────────────────
 Con seleccionados: [ Vincular a problema ] [ Crear mejora ] [ Asignar ]
```

`▲` ámbar = en riesgo, `■` rojo = vencido.

## Detalle de ticket (IT)

```
 TLI-000123 · No imprime etiquetas                       [ Acciones ▾ ]
 ┌──────────────────────────────────────────┬─────────────────────────┐
 │ Descripción …                            │ Estado    [En curso ▾]  │
 │                                          │ Prioridad [Alta ▾]      │
 │ ⚑ Similares: TLI-000098, PRB-0004        │ Asignado  [AG ▾]        │
 │                                          │ Cliente   Cliente X     │
 │ ── Actividad ─────────────────────────── │ Problema  —             │
 │ 💬 Juan (público) …                      │ SLA 1ª resp ✔ cumplido  │
 │ 🔒 AG (interno) …                        │ SLA resol.  ▲ 25 min    │
 │ ↺ Estado: Asignado → En curso            │ Tiempo      1 h 30      │
 │                                          │ [+ Registrar tiempo]    │
 │ [ Público | Interno ]                    │                         │
 │ [_____________________________] [Enviar] │ Resolución              │
 │                                          │ Causa / Solución        │
 └──────────────────────────────────────────┴─────────────────────────┘
 Acciones: Derivar a mejora · Derivar a integración · Vincular a problema · Generar artículo
```

## Kanban de mejoras

```
 Mejoras   [WMS | TMS | Todas]   [Lista | Kanban]
 Idea      │ En análisis │ Aprobada │ En desarrollo │ En testing │ Implementada │ Descartada
 ┌───────┐ │ ┌─────────┐ │          │ ┌───────────┐ │            │              │
 │MEJ-012│ │ │MEJ-009  │ │          │ │MEJ-004    │ │            │              │
 │WMS·Alta│ │ │TMS·Media│ │          │ │WMS·Alta   │ │            │              │
 │3 tick.│ │ │1 tick.  │ │          │ │SGL · AG   │ │            │              │
 └───────┘ │ └─────────┘ │          │ └───────────┘ │            │              │
```

## Ficha de cliente

```
 Cliente X S.A.  · CUIT 30-12345678-9 · ● Activo · Garín, Pacheco
 [Datos] [Contactos] [Integraciones] [Documentos] [Tickets] [Mejoras]

 Integraciones                                          [+ Nueva]
 Proceso             │ Sist. │ Sentido │ Canal   │ Estado              │ Objetivo
 Pedidos de salida   │ WMS   │ Entrada │ FTP     │ ● Finalizada        │ —
 Remitos             │ TMS   │ Salida  │ Carpeta │ ● En desarrollo     │ 15/11 ■ vencida
 Stock               │ WMS   │ Salida  │ API     │ ● Cotizada          │ —
 Confirmaciones      │ WMS   │ Salida  │ —       │ ● No realizada      │ (cliente no aprobó)
```

## Ficha de integración

```
 Cliente X · Remitos (TMS → Cliente)                    ● En desarrollo
 [Cómo funciona] [Datos técnicos] [Cotizaciones] [Documentos] [Proyecto]

 Cómo funciona                                  [Editar] [Historial]
 ┌──────────────────────────────────────────────────────────────────┐
 │ Flujo: …   Origen y destino: W:\TMS-IN-REMITOS\CLIX-FTP\IN …      │
 │ Archivo: TXT posicional …  Validaciones y errores: …              │
 │ Monitoreo: …  Contactos: …                                        │
 └──────────────────────────────────────────────────────────────────┘

 Cotizaciones                                      [+ Cotización]
 Proveedor │ Monto       │ Horas │ Fecha  │ Elegida
 SGL       │ USD 1.200   │ 24    │ 02/10  │ ●
 Molipa    │ USD 1.500   │ 30    │ 05/10  │ ○

 Documentos                         ┌ Arrastrá el documento acá ┐
 📄 Especificación v2 (PDF) · Layout remitos (XLSX) · Acta 10/10
```

## Dashboard (IT / Admin)

```
 Inicio    Período [Este mes ▾]   Responsable [Todos ▾]
 ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌──────────┐
 │Abiertos ││SLA venc.││En riesgo││Cerrados ││1ª resp.  │
 │   18    ││  ■ 2    ││  ▲ 3    ││   41    ││ 1 h 12   │
 └─────────┘└─────────┘└─────────┘└─────────┘└──────────┘
 ┌ Abiertos vs cerrados (semanal) ─────┐ ┌ Por categoría ──────────┐
 │ ▁▃▅▂▆▄                              │ │ WMS ████  TMS ██  …     │
 └─────────────────────────────────────┘ └─────────────────────────┘
 ┌ Propuestas ──────┐ ┌ Mejoras WMS / TMS ┐ ┌ Integraciones ─────────┐
 │ Recibidas 6      │ │ Idea 3 · Análisis 2│ │ Pendientes 7 · ■ 2 venc│
 │ Convertidas 4    │ │ Desarrollo 1 …     │ │ Est. vs real: USD …    │
 └──────────────────┘ └────────────────────┘ └────────────────────────┘
```

Cada indicador es un link a la lista filtrada.
