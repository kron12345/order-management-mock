# OrderManagementMock

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.2.11 and erweitert um einen planungsfähigen Gantt-Bereich für Ressourcen- und Aktivitätsplanung.

## Wie starten?

1. `npm install`
2. `npm start`
3. Browser öffnen unter `http://localhost:4200/`
4. Für den bestehenden Ressourcen-Gantt links „Planung“ anwählen.
5. Die Planungs-Masterdaten finden Sie jetzt unter „Stammdaten“ → Tab „Topologie“.

Der Vite-Dev-Server kompiliert im Strict-Modus (Angular Signals + Standalone Components). Anpassungen an Store/Editoren werden ohne Neustart sofort sichtbar.

## Planungsgantt ausprobieren

1. `npm install`
2. `npm start`
3. Browser öffnen unter `http://localhost:4200/`
4. In der linken Navigation „Planung“ auswählen.

Der Gantt-Bereich zeigt 30 Demo-Ressourcen mit über 1 000 Aktivitäten. Linke Spalte (Ressourcen) bleibt beim horizontalen Scrollen sichtbar, die Zeitleiste kann per Maus oder Tastatur gezoomt werden. Vertikales Scrollen nutzt Angular CDK Virtual Scroll und bleibt auch bei großen Datenmengen flüssig.

### Bedienung & Shortcuts

| Aktion | Interaktion |
| --- | --- |
| Horizontal scrollen | `Shift` + Mausrad oder Trackpad-Geste |
| Zoomen | `Ctrl` + Mausrad, `+` zoomt ein, `-` zoomt aus, Zoomauswahl im Menü |
| Heute springen | Button „Heute“ oder Taste `H` |
| Datumssprung | Datepicker im Menü |
| Cursorzeit | Maus über Timeline bewegen — Statusleiste zeigt den Zeitstempel |

### Hinweise

- Ticks und Raster passen sich der Zoomstufe an (Monat → Tage, Woche/Tag → Stunden, Stunde → 15/5-Minuten).
- Wochenenden werden als graue Bänder hervorgehoben, die aktuelle Zeit als rote Linie.
- Ressourcenfilter durchsucht ID, Namen und Attribute.

## Masterdaten für Planung (RINF/SEV)

Innerhalb der Stammdaten (Tab „Topologie“) steht ein tab-basiertes Backend-loses CRUD-Frontend bereit. Folgende Domänen werden unterstützt:

- Operational Points (RINF-Knoten) inkl. Geokoordinaten.
- Sections of Line (gerichtete Kanten) mit Validierung start≠end.
- Personnel Sites (Personalstandorte) mit optionalem OP-Bezug.
- Replacement Stops & Routes inklusive Edges (SEV-Topologie).
- OP ↔ Replacement Stop Links (Relationen gemäß Vorgaben).
- Transfer Edges (Umsteigewege) zwischen OP/Sites/SEV.

Die Datenspeicherung erfolgt rein im Browser über `PlanningStoreService` (Signals). Mockdaten werden beim ersten Öffnen per `loadMockData()` geladen.

## Wie Daten erweitern?

- **In-Memory Store:** `src/app/shared/planning-store.service.ts` bietet CRUD-Methoden pro Entität sowie Kaskadenlogik (z. B. Löschen von abhängigen Edges). Für Backend-Anbindung können die Methoden 1:1 an HTTP-Aufrufe adaptiert werden.
- **Initialdaten:** `src/app/shared/planning-mocks.ts` enthält ein kleines Demo-Netz inkl. SEV. Eigene Datensätze einfach ergänzen oder per Store-Methoden nachladen.
- **Datenmodell:** Alle Typen, Enums und Regeln liegen in `src/app/shared/planning-types.ts`. Bei Erweiterungen (z. B. weitere TransferModes) hier ergänzen.
- **UI-Module:** Die Tab-Editoren leben unter `src/app/planning/components`. Jeder Editor kapselt Listen-UI + Formular inkl. Validierung. Neue Domänen lassen sich durch Kopieren eines Editors schnell ergänzen.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io). Die Tests prüfen u. a. die Zeit/Pixelfunktionen und Tick-Generierung des neuen TimeScaleService.

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
