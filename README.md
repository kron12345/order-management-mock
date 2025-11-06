# OrderManagementMock

Ein Angular-18-Mock, der einen vollständigen Ressourcen- und Aktivitäts-Gantt für Bahn-/SEV-Planung liefert. Das Frontend richtet sich auf eine NestJS-REST-API aus, damit mehrere Disponenten denselben Datenbestand bearbeiten können und Validierungen (Orts-, Kapazitäts-, Arbeitszeit-, Qualifikationskonflikte) serverseitig laufen.

## Inhalt

- [Technologie-Stack](#technologie-stack)
- [Systemvoraussetzungen](#systemvoraussetzungen)
- [Installation & Erstinbetriebnahme](#installation--erstinbetriebnahme)
- [Frontend-Entwicklung](#frontend-entwicklung)
- [Backend-Anbindung (NestJS)](#backend-anbindung-nestjs)
- [Aktueller Funktionsumfang](#aktueller-funktionsumfang)
- [Masterdatenbereich](#masterdatenbereich)
- [OpenAPI & Datenmodell](#openapi--datenmodell)
- [Tests & bekannte Einschränkungen](#tests--bekannte-einschränkungen)

## Technologie-Stack

- Angular 18 (Standalone Components, Signals, CDK Drag&Drop/Virtual Scroll)
- Angular Material 18
- RxJS 7.8
- Node.js 20 LTS (empfohlen) / npm 10+
- NestJS (geplant) als REST-Backend, angebunden über OpenAPI-Spezifikation

## Systemvoraussetzungen

| Komponente | Version | Hinweis |
| --- | --- | --- |
| Node.js | >= 20.x LTS | Node 25 funktioniert lokal, ist aber nicht LTS. |
| npm | >= 10 | Kommt mit Node 20+. |
| Browser | Chromium/Chrome, Edge, Firefox | Angular dev-server kompiliert im Strict-Modus. |

## Installation & Erstinbetriebnahme

1. Repository klonen oder als ZIP entpacken.
2. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
3. Backend-Endpunkt konfigurieren (optional):
   - Standardmäßig ruft das Frontend `/api/v1` auf.
   - Anpassbar, indem `API_CONFIG` überschrieben wird, z. B. in `main.ts`:
     ```ts
     bootstrapApplication(AppComponent, {
       providers: [
         { provide: API_CONFIG, useValue: { baseUrl: 'http://localhost:3333/api/v1' } },
       ],
     });
     ```
4. Frontend starten:
   ```bash
   npm start
   ```
5. Browser öffnen: http://localhost:4200/ und im linken Menü „Planung“ wählen.

Ohne laufendes Backend bleibt der Gantt leer, die Anwendung selbst startet aber fehlerfrei.

## Frontend-Entwicklung

- Dev-Server: `npm start` (alias `ng serve`). Hot Reload und strenge Signals-Checks sind aktiv.
- Build: `npm run build`. Achtung: Fonts werden standardmäßig von Google Fonts geladen; offline Builds benötigen ein lokales Stylesheet.
- Tests: `npm test` (Karma) – deckt Kernlogik wie Tick-Erzeugung ab.
- Codegen/Scaffolding: `ng generate component|service|...`

## Backend-Anbindung (NestJS)

Der aktuelle Stand sieht eine REST-Brücke vor, die alle Activities/Resources verwaltet.

1. NestJS-Projekt anlegen (z. B. `nest new planning-api`).
2. OpenAPI übernehmen: `external_documents/openapi/planning-activities.yaml` importieren (Swagger/`@nestjs/swagger`).
3. Controller anlegen:
   - `GET /planning/stages/:stageId` liefert Ressourcen, Aktivitäten, Timeline & Version.
   - `GET /planning/stages/:stageId/activities` für Filterabfragen.
   - `PUT /planning/stages/:stageId/activities` akzeptiert Batch-Upserts/Deletes (Optimistic Locking optional über `version`).
   - `POST /planning/stages/:stageId/activities:validate` führt Prüfregeln aus (Orts-, Kapazitäts-, Arbeitszeit-, Qualifikationskonflikte; erweiterbar über `rule = custom`).
4. Datenhaltung: beliebig (Postgres, Mongo, In-Memory). Wichtig ist, dass IDs stabil bleiben, damit mehrere Clients identische Activities sehen.
5. Optional: Authentifizierung (z. B. per JWT) lässt sich über einen HTTP-Interceptor ergänzen.

## Aktueller Funktionsumfang

- **Gantt-Board:**
  - Mehrere Planungsstufen (`base`, `operations`, `dispatch`).
  - Ressourcen-Gruppierung, Zoomlevels von Monat bis 5-Minuten-Raster, Now-Linie, Wochenenden, Drag&Drop.
  - Multi-Selection, Boards, Service-Zuordnung zwischen Ressourcen.
  - REST-basierte Datenquelle (`PlanningDataService` synchronisiert lokale Änderungen sofort mittels `ActivityApiService`).

- **Validierungen (Client-Hooks):**
  - Frontend kann via `requestActivityValidation` gezielt Prüfungen triggern; Ergebnis-Typ `ActivityValidationIssue` deckt Orte, Kapazität, Arbeitszeit, Qualifikationen ab.

- **Masterdatenbereich:**
  - Eigenständiges CRUD für RINF/SEV-Objekte (Operational Points, Sections of Line, Personnel Sites usw.).
  - Speicherung clientseitig via `PlanningStoreService`, sofortige Validierung (z. B. Start≠Ende, Referenzen).

- **Internationalisierung:** UI deutsch, Datenfelder unterstützen Mehrsprachigkeit via `TemporalValue`-Listen.

## Masterdatenbereich

Navigationspfad: „Stammdaten“ → Tab „Topologie“.

Bereiche:

- Operational Points (mit Geo-Koordinaten, Unique IDs)
- Sections of Line (gerichtete Strecken, Längen, Referenzen)
- Personnel Sites
- Replacement Stops, Routes & Edges (SEV)
- OP ↔ Replacement Stop Links
- Transfer Edges (OP ↔ Site ↔ SEV)

Die Komponenten unter `src/app/planning/components/**` sind modular aufgebaut und lassen sich leicht auf weitere Domänen übertragen. Mockdaten stehen in `src/app/shared/planning-mocks.ts` bereit und können per Store geladen oder ersetzt werden.

## OpenAPI & Datenmodell

- **OpenAPI:** `external_documents/openapi/planning-activities.yaml` dokumentiert alle Endpunkte sowie Schemas für Activities, Resources, Timeline, Validierungsergebnisse.
- **Activity-Modell (`src/app/models/activity.ts`):**
  - Enthält IDs, Zeitfenster, Service-Zuordnung, Ort (`locationId`), Kapazität (`capacityGroupId`), Qualifikationen, Work-Rule-Tags, Client-ID für Mandantenfähigkeit.
  - `participantResourceIds` erlaubt Multi-Assign (z. B. Fahrzeug + Personal auf derselben Aktivität).
- **Validierung (`src/app/models/activity-validation.ts`):** standardisierte Rules (`location-conflict`, `capacity-conflict`, `working-time`, `qualification`, `custom`).
- **API-Config:** `API_CONFIG` (unter `src/app/core/config/api-config.ts`) definiert die Basis-URL und kann überschrieben werden.

## Tests & bekannte Einschränkungen

- `npm run build` benötigt Onlinezugriff auf Google Fonts oder eine lokale Kopie.
- Ohne Backend keine Activities im Gantt (Designentscheidung, da Mockdaten entfernt wurden).
- Validierungsergebnisse müssen serverseitig umgesetzt werden; Client zeigt momentan nur das Interface an.
- Für produktive Nutzung fehlen Authentifizierung/Autorisierung sowie Persistenzschicht – Fokus liegt aktuell auf der UI-Referenz und API-Vertrag.

## Quick Reference

- Dev-Server: `npm start`
- Build: `npm run build`
- Tests: `npm test`
- Offizielle Angular-Hilfe: `ng help`
