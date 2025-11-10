import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MasterDataLayoutComponent } from './components/master-data-layout/master-data-layout.component';
import {
  MasterDataCategoryConfig,
  MasterDataHierarchyConfig,
  MasterDataOption,
  MasterDataTemporalValue,
  MasterDataFieldConfig,
  MasterDataFieldType,
  MasterDataTabConfig,
} from './master-data.types';
import { MasterDataResourceStoreService } from './master-data-resource.store';
import { MasterDataCollectionsStoreService } from './master-data-collections.store';
import {
  PersonnelService,
  PersonnelServicePool,
  Personnel,
  PersonnelPool,
  VehicleService,
  VehicleServicePool,
  VehicleType,
  Vehicle,
  VehiclePool,
  VehicleComposition,
  VehicleCompositionEntry,
} from '../../models/master-data';
import {
  CustomAttributePrimitiveType,
  CustomAttributeService,
  CustomAttributeState,
} from '../../core/services/custom-attribute.service';
import { PlanningMasterComponent } from '../../planning/planning-master.component';
import { TimetableYearService } from '../../core/services/timetable-year.service';
import { TimetableYearRecord } from '../../core/models/timetable-year.model';

@Component({
  selector: 'app-master-data-landing',
  standalone: true,
  imports: [CommonModule, MasterDataLayoutComponent],
  templateUrl: './master-data-landing.component.html',
  styleUrl: './master-data-landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MasterDataLandingComponent {
  private readonly resources = inject(MasterDataResourceStoreService);
  private readonly collections = inject(MasterDataCollectionsStoreService);
  private readonly timetableYearService = inject(TimetableYearService);

  protected readonly title = 'Stammdatenpflege';
  protected readonly subtitle =
    'Verwalten Sie Personal- und Fahrzeugstammdaten zentral. Alle Kategorien folgen demselben Bedienkonzept.';

  private readonly vehicleTypeMap = computed(() =>
    new Map(this.collections.vehicleTypes().map((type) => [type.id, type.label] as const)),
  );

  private readonly qualificationOptions = computed<MasterDataOption[]>(() => {
    const values = new Set<string>();
    this.resources.personnel().forEach((person) =>
      (person.qualifications ?? []).forEach((qualification) => {
        if (qualification) {
          values.add(qualification);
        }
      }),
    );
    this.resources.personnelServices().forEach((service) =>
      (service.requiredQualifications ?? []).forEach((qualification) => {
        if (qualification) {
          values.add(qualification);
        }
      }),
    );
    return Array.from(values).map((qualification) => ({
      label: qualification,
      value: qualification,
    }));
  });

  private readonly personnelServiceOptions = computed<MasterDataOption[]>(() =>
    this.resources.personnelServices().map((service) => ({
      label: service.name || service.id,
      value: service.id,
    })),
  );

  private readonly vehicleServiceOptions = computed<MasterDataOption[]>(() =>
    this.resources.vehicleServices().map((service) => ({
      label: service.name || service.id,
      value: service.id,
    })),
  );

  private readonly vehicleTypeOptions = computed<MasterDataOption[]>(() =>
    this.collections
      .vehicleTypes()
      .map((type) => ({
        label: type.label,
        value: type.id,
      })),
  );

  private readonly tiltingOptions: MasterDataOption[] = [
    { label: 'Keine', value: 'none' },
    { label: 'Passiv', value: 'passive' },
    { label: 'Aktiv', value: 'active' },
  ];

  private readonly powerSupplyOptions: MasterDataOption[] = [
    { label: '15 kV / 16.7 Hz AC', value: '15 kV / 16.7 Hz AC' },
    { label: '25 kV / 50 Hz AC', value: '25 kV / 50 Hz AC' },
    { label: 'Zugsammelschiene 1000 V AC', value: 'Zugsammelschiene 1000 V AC' },
    { label: '750 V DC Stromschiene', value: '750 V DC Stromschiene' },
  ];

  private readonly trainProtectionOptions: MasterDataOption[] = [
    { label: 'PZB 90', value: 'PZB 90' },
    { label: 'LZB', value: 'LZB' },
    { label: 'ETCS Level 2', value: 'ETCS Level 2' },
    { label: 'ZBS', value: 'ZBS' },
  ];

  private readonly etcsLevelOptions: MasterDataOption[] = [
    { label: 'Kein ETCS', value: 'Kein ETCS' },
    { label: 'ETCS Level 1', value: 'ETCS Level 1' },
    { label: 'ETCS Level 2 Baseline 3', value: 'ETCS Level 2 Baseline 3' },
  ];

  private readonly gaugeProfileOptions: MasterDataOption[] = [
    { label: 'G1', value: 'G1' },
    { label: 'G2', value: 'G2' },
    { label: 'GA', value: 'GA' },
    { label: 'GB1', value: 'GB1' },
    { label: 'GB2', value: 'GB2' },
    { label: 'S-Bahn Berlin', value: 'S-Bahn Berlin' },
  ];

  private readonly brakeTypeOptions: MasterDataOption[] = [
    { label: 'KE-GPR-E mZ', value: 'KE-GPR-E mZ' },
    { label: 'KE-GPR mZ', value: 'KE-GPR mZ' },
    { label: 'KE-RA-Mg', value: 'KE-RA-Mg' },
    { label: 'KE-R-A (S-Bahn)', value: 'KE-R-A (S-Bahn)' },
  ];

  private readonly customAttributes = inject(CustomAttributeService);

  protected readonly tabs = computed<MasterDataTabConfig[]>(() =>
    this.buildTabs(
      this.customAttributes.definitions(),
      this.timetableYearService.listManagedYearRecords(),
    ),
  );

  private buildTabs(
    definitions: CustomAttributeState,
    timetableYears: TimetableYearRecord[],
  ): MasterDataTabConfig[] {
    return [
      {
        id: 'personnel',
        icon: 'badge',
        title: 'Personal',
        description:
          'Dienste und Mitarbeitende werden hierarchisch nach Pools organisiert – zuerst den Pool anlegen, dann die zugehörigen Ressourcen pflegen.',
        sections: [
          {
            type: 'hierarchy',
            id: 'personnel-services',
            config: this.buildPersonnelServicesHierarchy(definitions),
          },
          {
            type: 'hierarchy',
            id: 'personnel-pools',
            config: this.buildPersonnelHierarchy(definitions),
          },
        ],
      },
      {
        id: 'timetable-years',
        icon: 'event',
        title: 'Fahrplanjahre',
        description:
          'Definiere hier die gültigen Fahrplanjahre. Alle Auftrags- und Kalenderdialoge greifen auf diese Liste zurück.',
        sections: [
          {
            type: 'category',
            id: 'timetable-year-management',
            title: 'Fahrplanjahre',
            description:
              'Start- und Enddatum sind inklusive. Über die Beschreibung kannst du z. B. Quelle oder Besonderheiten dokumentieren.',
            config: this.buildTimetableYearCategory(timetableYears),
          },
        ],
      },
      {
        id: 'vehicles',
        icon: 'directions_transit',
        title: 'Fahrzeuge',
        description:
          'Fahrzeugdienste, Pools und Fahrzeugtypen lassen sich in klarer Reihenfolge anlegen: erst Pools, dann Fahrzeuge und Begleitdaten.',
        sections: [
          {
            type: 'hierarchy',
            id: 'vehicle-services',
            config: this.buildVehicleServicesHierarchy(definitions),
          },
          {
            type: 'category',
            id: 'vehicle-types',
            title: 'Fahrzeugtypen',
            description: 'Typkatalog mit Kategorien und Kapazitäten für die Einsatzplanung.',
            config: this.buildVehicleTypesCategory(definitions),
          },
          {
            type: 'hierarchy',
            id: 'vehicle-pools',
            config: this.buildVehicleHierarchy(definitions),
          },
          {
            type: 'category',
            id: 'vehicle-compositions',
            title: 'Fahrzeugkompositionen',
            description: 'Standardisierte Garnituren für Umläufe und Verkehrsverträge.',
            config: this.buildVehicleCompositionsCategory(definitions),
          },
        ],
      },
      {
        id: 'topology',
        icon: 'share_location',
        title: 'Topologie',
        description:
          'Planungs-Masterdaten wie Betriebsstellen, Strecken und Ersatzverkehre zentral pflegen.',
        sections: [
          {
            type: 'component',
            id: 'planning-topology',
            title: 'Planungs-Masterdaten',
            description:
              'Der Topologie-Editor bündelt alle Netz- und Ersatzverkehrsstrukturen für die Planung.',
            component: PlanningMasterComponent,
          },
        ],
      },
    ];
  }

  private buildTimetableYearCategory(
    items: TimetableYearRecord[],
  ): MasterDataCategoryConfig<TimetableYearRecord> {
    return {
      id: 'managed-timetable-years',
      icon: 'event',
      title: 'Fahrplanjahre',
      description:
        'Die hier gepflegten Fahrplanjahre stehen in allen Dialogen als Auswahl zur Verfügung.',
      entityLabel: 'Fahrplanjahr',
      columns: [
        { key: 'label', label: 'Label' },
        {
          key: 'range',
          label: 'Zeitraum',
          valueAccessor: (item) => this.formatTimetableYearRange(item),
        },
        {
          key: 'description',
          label: 'Beschreibung',
          valueAccessor: (item) => item.description ?? '—',
        },
      ],
      fields: [
        {
          key: 'label',
          label: 'Label',
          type: 'text',
          placeholder: 'z. B. 2024/25',
          hint: 'Anzeigetext in Filtern und Dialogen.',
        },
        {
          key: 'startIso',
          label: 'Beginn (inkl.)',
          type: 'date',
          hint: 'Erster Verkehrstag des Fahrplanjahres.',
        },
        {
          key: 'endIso',
          label: 'Ende (inkl.)',
          type: 'date',
          hint: 'Letzter Verkehrstag des Fahrplanjahres.',
        },
        {
          key: 'description',
          label: 'Beschreibung',
          type: 'textarea',
          placeholder: 'Optionaler Hinweis (z. B. Quelle, Besonderheiten)',
        },
      ],
      items,
      defaultValues: () => this.timetableYearService.nextDefaultRecord(),
      fromFormValue: (value, previous) =>
        this.normalizeTimetableYearFormValue(value, previous),
      onItemsChange: (nextItems) => this.timetableYearService.syncManagedYears(nextItems),
    };
  }

  private formatTimetableYearRange(item: TimetableYearRecord): string {
    if (item.startIso && item.endIso) {
      return `${item.startIso} – ${item.endIso}`;
    }
    if (item.startIso) {
      return `${item.startIso} – ?`;
    }
    if (item.endIso) {
      return `? – ${item.endIso}`;
    }
    return '—';
  }

  private normalizeTimetableYearFormValue(
    value: Record<string, unknown>,
    previous?: TimetableYearRecord | null,
  ): TimetableYearRecord {
    const rawId = typeof value['id'] === 'string' ? value['id'].trim() : '';
    const id =
      rawId || previous?.id || `ty-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
    const startIso = this.coerceIsoDate(value['startIso']);
    const endIso = this.coerceIsoDate(value['endIso']);
    return {
      id,
      label: (value['label'] as string | undefined)?.trim() ?? '',
      startIso,
      endIso,
      description: (value['description'] as string | undefined)?.trim() || undefined,
    };
  }

  private coerceIsoDate(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
  }

  private buildPersonnelServicesHierarchy(
    definitions: CustomAttributeState,
  ): MasterDataHierarchyConfig<
    PersonnelServicePool,
    PersonnelService
  > {
    return {
      id: 'personnel-service-hierarchy',
      title: 'Personaldienstpools & Dienste',
      description: 'Dienste logisch bündeln und direkt im ausgewählten Pool pflegen.',
      relationKey: 'poolId',
      parentRelationKey: 'serviceIds',
      parent: {
        id: 'personnel-service-pools',
        icon: 'group_work',
        title: 'Personaldienstpools',
      description: 'Thematische Dienstpools, z. B. nach Linie oder Einsatzgebiet.',
      entityLabel: 'Dienstpool',
      columns: [
        { key: 'name', label: 'Pool' },
      ],
        fields: this.extendFields(
          [
            { key: 'name', label: 'Poolname', type: 'text', placeholder: 'RE1 Berliner Osten' },
            { key: 'description', label: 'Beschreibung', type: 'textarea' },
          ],
        'personnel-service-pools',
        definitions,
      ),
      items: this.collections.personnelServicePools(),
      defaultValues: () => ({ serviceIds: [] }),
    },
    child: {
      id: 'personnel-services',
        icon: 'event',
        title: 'Personaldienste',
        description: 'Standardisierte Dienste, die einem Pool zugewiesen sind.',
        entityLabel: 'Personaldienst',
        columns: [
          { key: 'name', label: 'Dienst' },
        ],
        fields: this.extendFields(
          [
            { key: 'name', label: 'Dienstname', type: 'text', placeholder: 'Frühschicht RE1' },
            { key: 'description', label: 'Beschreibung', type: 'textarea' },
            {
              key: 'requiredQualifications',
              label: 'Qualifikationen',
              type: 'multiselect',
              hint: 'Sammeln Sie alle benötigten Berechtigungen für den Dienst.',
              options: this.qualificationOptions(),
            },
            {
              key: 'poolId',
              label: 'Pool',
              type: 'text',
              readonly: true,
              hint: 'Wird automatisch über die Pool-Auswahl gesetzt.',
            },
          ],
          'personnel-services',
          definitions,
        ),
      items: this.resources.personnelServices(),
      },
      onParentItemsChange: (items) => {
        this.collections.syncPersonnelServicePools(items);
        this.resources.syncPersonnelServices(this.resources.personnelServices());
      },
      onChildItemsChange: (items) => this.resources.syncPersonnelServices(items),
    };
  }

  private buildPersonnelHierarchy(
    definitions: CustomAttributeState,
  ): MasterDataHierarchyConfig<PersonnelPool, Personnel> {
    return {
      id: 'personnel-pool-hierarchy',
      title: 'Personalpools & Mitarbeitende',
      description: 'Mitarbeitende zunächst einem Pool zuordnen und dann Qualifikationen pflegen.',
      relationKey: 'poolId',
      parentRelationKey: 'personnelIds',
      parent: {
        id: 'personnel-pools',
        icon: 'groups',
        title: 'Personalpools',
        description: 'Taktische Bündelung von Mitarbeitenden nach Standort oder Team.',
        entityLabel: 'Personalpool',
        columns: [
          { key: 'name', label: 'Pool' },
        ],
        fields: this.extendFields(
          [
            { key: 'name', label: 'Poolname', type: 'text' },
            { key: 'description', label: 'Beschreibung', type: 'textarea' },
          ],
          'personnel-pools',
          definitions,
        ),
        items: this.collections.personnelPools(),
        defaultValues: () => ({ personnelIds: [] }),
      },
      child: {
        id: 'personnel',
        icon: 'badge',
        title: 'Personal',
        description: 'Einzelne Mitarbeitende mit Qualifikationen und Diensten pflegen.',
        entityLabel: 'Mitarbeiter:in',
        columns: [
          {
            key: 'lastName',
            label: 'Name',
            valueAccessor: (person) => this.resolvePersonnelFullName(person),
          },
        ],
        fields: this.extendFields(
          [
            {
              key: 'firstName',
              label: 'Vorname',
              type: 'text',
              temporal: true,
              hint: 'Mehrere Namen mit zeitlicher Gültigkeit pflegen.',
            },
            { key: 'lastName', label: 'Nachname', type: 'text' },
            { key: 'preferredName', label: 'Rufname', type: 'text', placeholder: 'Optional' },
            {
              key: 'qualifications',
              label: 'Qualifikationen',
              type: 'multiselect',
              options: this.qualificationOptions(),
            },
            {
              key: 'serviceIds',
              label: 'Zugewiesene Dienste',
              type: 'multiselect',
              options: this.personnelServiceOptions(),
            },
            {
              key: 'poolId',
              label: 'Pool',
              type: 'text',
              readonly: true,
              hint: 'Wird automatisch über die Pool-Auswahl gesetzt.',
            },
          ],
          'personnel',
          definitions,
        ),
        items: this.resources.personnel(),
      },
      onParentItemsChange: (items) => {
        this.collections.syncPersonnelPools(items);
        this.resources.syncPersonnel(this.resources.personnel());
      },
      onChildItemsChange: (items) => this.resources.syncPersonnel(items),
    };
  }

  private buildVehicleServicesHierarchy(
    definitions: CustomAttributeState,
  ): MasterDataHierarchyConfig<
    VehicleServicePool,
    VehicleService
  > {
    return {
      id: 'vehicle-service-hierarchy',
      title: 'Fahrzeugdienstpools & Dienste',
      description: 'Fahrzeugdienste zuerst in Pools strukturieren, dann Umläufe pflegen.',
      relationKey: 'poolId',
      parentRelationKey: 'serviceIds',
      parent: {
        id: 'vehicle-service-pools',
        icon: 'layers',
        title: 'Fahrzeugdienstpools',
        description: 'Sammlung von Diensten je Linie oder Verkehrsvertrag.',
        entityLabel: 'Dienstpool',
        columns: [
          { key: 'name', label: 'Pool' },
        ],
        fields: this.extendFields(
          [
            { key: 'name', label: 'Poolname', type: 'text' },
            { key: 'description', label: 'Beschreibung', type: 'textarea' },
          ],
          'vehicle-service-pools',
          definitions,
        ),
        items: this.collections.vehicleServicePools(),
        defaultValues: () => ({ serviceIds: [] }),
      },
      child: {
        id: 'vehicle-services',
        icon: 'calendar_month',
        title: 'Fahrzeugdienste',
        description: 'Einzelne Umläufe und Dienste samt benötigter Fahrzeugtypen pflegen.',
        entityLabel: 'Fahrzeugdienst',
        columns: [
          { key: 'name', label: 'Dienst' },
        ],
        fields: this.extendFields(
          [
            { key: 'name', label: 'Dienstname', type: 'text' },
            { key: 'description', label: 'Beschreibung', type: 'textarea' },
            {
              key: 'requiredVehicleTypeIds',
              label: 'Zulässige Fahrzeugtypen',
              type: 'multiselect',
              options: this.vehicleTypeOptions(),
            },
            {
              key: 'poolId',
              label: 'Pool',
              type: 'text',
              readonly: true,
              hint: 'Wird automatisch über die Pool-Auswahl gesetzt.',
            },
          ],
          'vehicle-services',
          definitions,
        ),
        items: this.resources.vehicleServices(),
      },
      onParentItemsChange: (items) => {
        this.collections.syncVehicleServicePools(items);
        this.resources.syncVehicleServices(this.resources.vehicleServices());
      },
      onChildItemsChange: (items) => this.resources.syncVehicleServices(items),
    };
  }

  private buildVehicleHierarchy(
    definitions: CustomAttributeState,
  ): MasterDataHierarchyConfig<VehiclePool, Vehicle> {
    return {
      id: 'vehicle-pool-hierarchy',
      title: 'Fahrzeugpools & Fahrzeuge',
      description: 'Fahrzeuge im passenden Pool verwalten und Einsätze zuweisen.',
      relationKey: 'poolId',
      parentRelationKey: 'vehicleIds',
      parent: {
        id: 'vehicle-pools',
        icon: 'warehouse',
        title: 'Fahrzeugpools',
        description: 'Gruppierungen von Fahrzeugen nach Einsatzgebiet oder Standort.',
        entityLabel: 'Fahrzeugpool',
        columns: [
          { key: 'name', label: 'Pool' },
        ],
        fields: this.extendFields(
          [
            { key: 'name', label: 'Poolname', type: 'text' },
            { key: 'description', label: 'Beschreibung', type: 'textarea' },
          ],
          'vehicle-pools',
          definitions,
        ),
        items: this.collections.vehiclePools(),
        defaultValues: () => ({ vehicleIds: [] }),
      },
      child: {
        id: 'vehicles',
        icon: 'directions_transit',
        title: 'Fahrzeuge',
        description: 'Einzelne Fahrzeuge mitsamt Typ, Depot und Einsätzen pflegen.',
        entityLabel: 'Fahrzeug',
        columns: [
          { key: 'vehicleNumber', label: 'Fahrzeugnummer' },
        ],
        fields: this.extendFields(
          [
            { key: 'vehicleNumber', label: 'Fahrzeugnummer', type: 'text' },
            {
              key: 'typeId',
              label: 'Fahrzeugtyp',
              type: 'select',
              options: this.vehicleTypeOptions(),
            },
            { key: 'depot', label: 'Heimatdepot', type: 'text' },
            {
              key: 'serviceIds',
              label: 'Einsatzdienste',
              type: 'multiselect',
              options: this.vehicleServiceOptions(),
            },
            { key: 'description', label: 'Notiz', type: 'textarea', placeholder: 'Optional' },
            {
              key: 'poolId',
              label: 'Pool',
              type: 'text',
              readonly: true,
              hint: 'Wird automatisch über die Pool-Auswahl gesetzt.',
            },
          ],
          'vehicles',
          definitions,
        ),
        items: this.resources.vehicles(),
      },
      onParentItemsChange: (items) => {
        this.collections.syncVehiclePools(items);
        this.resources.syncVehicles(this.resources.vehicles());
      },
      onChildItemsChange: (items) => this.resources.syncVehicles(items),
    };
  }

  private buildVehicleTypesCategory(
    definitions: CustomAttributeState,
  ): MasterDataCategoryConfig<VehicleType> {
    return {
      id: 'vehicle-types',
      icon: 'train',
      title: 'Fahrzeugtypen',
      description: 'Fahrzeugtypen mit Kapazitäten und Kategorien definieren.',
      entityLabel: 'Fahrzeugtyp',
      columns: [
        { key: 'label', label: 'Typ' },
      ],
      fields: this.extendFields(
        [
          { key: 'label', label: 'Bezeichnung', type: 'text' },
          {
            key: 'category',
            label: 'Kategorie',
            type: 'select',
            options: [
              { label: 'Lokomotive', value: 'Lokomotive' },
              { label: 'Wagen', value: 'Wagen' },
              { label: 'Triebzug', value: 'Triebzug' },
            ],
          },
          { key: 'capacity', label: 'Kapazität (Sitzplätze)', type: 'number' },
          {
            key: 'trainTypeCode',
            label: 'TTT Train Type',
            type: 'text',
            placeholder: 'z. B. LOC-E',
          },
          { key: 'lengthMeters', label: 'Länge (m)', type: 'number' },
          { key: 'weightTons', label: 'Masse (t)', type: 'number' },
          {
            key: 'brakeType',
            label: 'Bremssystem',
            type: 'select',
            options: this.brakeTypeOptions,
          },
          { key: 'brakePercentage', label: 'Bremshundertstel (%)', type: 'number' },
          {
            key: 'tiltingCapability',
            label: 'Neigetechnik',
            type: 'select',
            options: this.tiltingOptions,
          },
          {
            key: 'powerSupplySystems',
            label: 'Energieversorgung',
            type: 'multiselect',
            options: this.powerSupplyOptions,
          },
          {
            key: 'trainProtectionSystems',
            label: 'Zugsicherungssysteme',
            type: 'multiselect',
            options: this.trainProtectionOptions,
          },
          {
            key: 'etcsLevel',
            label: 'ETCS-Level',
            type: 'select',
            options: this.etcsLevelOptions,
          },
          {
            key: 'gaugeProfile',
            label: 'Lichtraumprofil',
            type: 'select',
            options: this.gaugeProfileOptions,
          },
          { key: 'maxAxleLoad', label: 'Max. Achslast (t)', type: 'number' },
          { key: 'noiseCategory', label: 'Lärmkategorie', type: 'text' },
          { key: 'remarks', label: 'Hinweise', type: 'textarea' },
        ],
        'vehicle-types',
        definitions,
      ),
      items: this.collections.vehicleTypes(),
      onItemsChange: (items) => this.collections.syncVehicleTypes(items),
    };
  }

  private buildVehicleCompositionsCategory(
    definitions: CustomAttributeState,
  ): MasterDataCategoryConfig<
    VehicleComposition & { entriesSerialized: string }
  > {
    const items = this.collections.vehicleCompositions().map((composition) => ({
      ...composition,
      entriesSerialized: this.serializeCompositionEntries(composition.entries),
    }));

    const customFields = this.mapCustomFields('vehicle-compositions', definitions);

    return {
      id: 'vehicle-compositions',
      icon: 'stacked_bar_chart',
      title: 'Fahrzeugkompositionen',
      description: 'Standardisierte Fahrzeugzusammenstellungen für Umläufe definieren.',
      entityLabel: 'Komposition',
      columns: [
        { key: 'name', label: 'Komposition' },
        {
          key: 'entriesSerialized',
          label: 'Zusammenstellung',
          valueAccessor: (composition) =>
            this.renderCompositionEntries(composition.entries) || '—',
        },
      ],
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        {
          key: 'entriesSerialized',
          label: 'Zusammenstellung',
          type: 'textarea',
          hint: 'Format: <Typ-ID>:<Anzahl> pro Zeile, z. B. VT-TRAXX-AC3:1',
        },
        ...customFields,
      ],
      items,
      toFormValue: (item) => ({
        ...item,
        entriesSerialized: item.entriesSerialized,
      }),
      fromFormValue: (value, previous) => {
        const entriesSerialized = String(value['entriesSerialized'] ?? '');
        const entries = this.parseCompositionEntries(entriesSerialized);
        return {
          id: String(value['id'] ?? previous?.id ?? ''),
          name: String(value['name'] ?? ''),
          entries,
          entriesSerialized,
        };
      },
      onItemsChange: (entries) => {
        const normalized = entries.map((entry) => {
          const { entriesSerialized, ...rest } = entry;
          const hasEntries = entry.entries && entry.entries.length > 0;
          return {
            ...(rest as VehicleComposition),
            entries: hasEntries
              ? entry.entries
              : this.parseCompositionEntries(String(entriesSerialized ?? '')),
          };
        }) as VehicleComposition[];
        this.collections.syncVehicleCompositions(normalized);
      },
    };
  }

  private resolvePersonnelFullName(person: Personnel): string {
    const lastName = this.resolveTemporalText(person.lastName);
    const firstName = this.resolveTemporalText(person.firstName);

    if (lastName && firstName) {
      return `${lastName}, ${firstName}`;
    }
    if (lastName) {
      return lastName;
    }
    if (firstName) {
      return firstName;
    }
    return '—';
  }

  private resolveTemporalText(
    value: string | MasterDataTemporalValue<string>[] | undefined,
  ): string {
    if (!value) {
      return '';
    }
    if (Array.isArray(value)) {
      return this.resolveTemporalCurrentValue(value);
    }
    return value;
  }

  private resolveTemporalCurrentValue(entries: MasterDataTemporalValue<string>[]): string {
    if (!entries || entries.length === 0) {
      return '';
    }
    const today = this.currentDate();
    const sorted = [...entries].sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
    const active =
      sorted.find((entry) => this.isDateInRange(today, entry.validFrom, entry.validTo)) ?? sorted[0];
    return String(active.value);
  }

  private currentDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private isDateInRange(date: string, from?: string | null, to?: string | null): boolean {
    const afterStart = !from || date >= from;
    const beforeEnd = !to || date <= to;
    return afterStart && beforeEnd;
  }

  private serializeCompositionEntries(entries: VehicleCompositionEntry[]): string {
    return entries.map((entry) => `${entry.typeId}:${entry.quantity}`).join('\n');
  }

  private renderCompositionEntries(entries: VehicleCompositionEntry[] | undefined): string {
    if (!entries || entries.length === 0) {
      return '';
    }

    const vehicleTypeMap = this.vehicleTypeMap();
    return entries
      .map((entry) => {
        const label = vehicleTypeMap.get(entry.typeId) ?? entry.typeId;
        return `${entry.quantity}× ${label}`;
      })
      .join(', ');
  }

  private parseCompositionEntries(value: string): VehicleCompositionEntry[] {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [typeIdPart, quantityPart] = line.split(':').map((part) => part.trim());
        const typeId = typeIdPart ?? '';
        const quantity = Number.parseInt(quantityPart ?? '1', 10);
        return {
          typeId,
          quantity: Number.isNaN(quantity) ? 1 : quantity,
        };
      })
      .filter((entry) => entry.typeId.length > 0);
  }

  private extendFields(
    baseFields: MasterDataFieldConfig[],
    entityId: string,
    definitions: CustomAttributeState,
  ): MasterDataFieldConfig[] {
    const customFields = this.mapCustomFields(entityId, definitions);
    if (customFields.length === 0) {
      return baseFields;
    }
    return [...baseFields, ...customFields];
  }

  private mapCustomFields(
    entityId: string,
    definitions: CustomAttributeState,
  ): MasterDataFieldConfig[] {
    const entries = definitions[entityId] ?? [];
    return entries.map((definition) => ({
      key: definition.key,
      label: definition.label,
      type: this.mapPrimitiveToFieldType(definition.type),
      hint: definition.description,
      placeholder: this.placeholderForCustomType(definition.type),
      custom: true,
    }));
  }

  private mapPrimitiveToFieldType(type: CustomAttributePrimitiveType): MasterDataFieldType {
    switch (type) {
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
        return 'date';
      case 'time':
        return 'time';
      default:
        return 'text';
    }
  }

  private placeholderForCustomType(type: CustomAttributePrimitiveType): string | undefined {
    switch (type) {
      case 'time':
        return 'HH:MM';
      case 'date':
        return 'JJJJ-MM-TT';
      case 'number':
        return '0';
      default:
        return undefined;
    }
  }

}
