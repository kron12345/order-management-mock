import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MasterDataLayoutComponent } from './components/master-data-layout/master-data-layout.component';
import {
  MasterDataCategoryConfig,
  MasterDataHierarchyConfig,
  MasterDataOption,
  MasterDataTemporalValue,
  MasterDataTabConfig,
} from './master-data.types';
import { DEMO_MASTER_DATA } from '../../data/demo-master-data';
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

@Component({
  selector: 'app-master-data-landing',
  standalone: true,
  imports: [CommonModule, MasterDataLayoutComponent],
  templateUrl: './master-data-landing.component.html',
  styleUrl: './master-data-landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MasterDataLandingComponent {
  private readonly data = DEMO_MASTER_DATA;

  protected readonly title = 'Stammdatenpflege';
  protected readonly subtitle =
    'Verwalten Sie Personal- und Fahrzeugstammdaten zentral. Alle Kategorien folgen demselben Bedienkonzept.';

  private readonly vehicleTypeMap = new Map(
    this.data.vehicleTypes.map((type) => [type.id, type.label] as const),
  );

  private readonly qualificationOptions: MasterDataOption[] = Array.from(
    new Set(
      this.data.personnel
        .flatMap((person) => person.qualifications ?? [])
        .concat(
          this.data.personnelServices.flatMap((service) => service.requiredQualifications ?? []),
        ),
    ),
  )
    .filter((qualification) => qualification)
    .map((qualification) => ({
      label: qualification,
      value: qualification,
    }));

  private readonly personnelServiceOptions: MasterDataOption[] = this.data.personnelServices.map(
    (service) => ({
      label: service.name,
      value: service.id,
    }),
  );

  private readonly vehicleServiceOptions: MasterDataOption[] = this.data.vehicleServices.map(
    (service) => ({
      label: service.name,
      value: service.id,
    }),
  );

  private readonly vehicleTypeOptions: MasterDataOption[] = this.data.vehicleTypes.map((type) => ({
    label: type.label,
    value: type.id,
  }));

  protected readonly tabs: MasterDataTabConfig[] = [
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
          config: this.buildPersonnelServicesHierarchy(),
        },
        {
          type: 'hierarchy',
          id: 'personnel-pools',
          config: this.buildPersonnelHierarchy(),
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
          config: this.buildVehicleServicesHierarchy(),
        },
        {
          type: 'category',
          id: 'vehicle-types',
          title: 'Fahrzeugtypen',
          description: 'Typkatalog mit Kategorien und Kapazitäten für die Einsatzplanung.',
          config: this.buildVehicleTypesCategory(),
        },
        {
          type: 'hierarchy',
          id: 'vehicle-pools',
          config: this.buildVehicleHierarchy(),
        },
        {
          type: 'category',
          id: 'vehicle-compositions',
          title: 'Fahrzeugkompositionen',
          description: 'Standardisierte Garnituren für Umläufe und Verkehrsverträge.',
          config: this.buildVehicleCompositionsCategory(),
        },
      ],
    },
  ];

  private buildPersonnelServicesHierarchy(): MasterDataHierarchyConfig<
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
          {
            key: 'serviceIds',
            label: 'Dienste',
            valueAccessor: (pool) =>
              this.formatCount(pool.serviceIds?.length ?? 0, 'Dienst', 'Dienste'),
          },
        ],
        fields: [
          { key: 'name', label: 'Poolname', type: 'text', placeholder: 'RE1 Berliner Osten' },
          { key: 'description', label: 'Beschreibung', type: 'textarea' },
        ],
        items: this.data.personnelServicePools,
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
          {
            key: 'requiredQualifications',
            label: 'Qualifikationen',
            valueAccessor: (service) =>
              (service.requiredQualifications ?? []).join(', ') || '—',
          },
        ],
        fields: [
          { key: 'name', label: 'Dienstname', type: 'text', placeholder: 'Frühschicht RE1' },
          { key: 'description', label: 'Beschreibung', type: 'textarea' },
          {
            key: 'requiredQualifications',
            label: 'Qualifikationen',
            type: 'multiselect',
            hint: 'Sammeln Sie alle benötigten Berechtigungen für den Dienst.',
            options: this.qualificationOptions,
          },
          {
            key: 'poolId',
            label: 'Pool',
            type: 'text',
            readonly: true,
            hint: 'Wird automatisch über die Pool-Auswahl gesetzt.',
          },
        ],
        items: this.data.personnelServices,
      },
    };
  }

  private buildPersonnelHierarchy(): MasterDataHierarchyConfig<PersonnelPool, Personnel> {
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
          {
            key: 'personnelIds',
            label: 'Mitarbeitende',
            valueAccessor: (pool) =>
              this.formatCount(pool.personnelIds?.length ?? 0, 'Person', 'Personen'),
          },
        ],
        fields: [
          { key: 'name', label: 'Poolname', type: 'text' },
          { key: 'description', label: 'Beschreibung', type: 'textarea' },
        ],
        items: this.data.personnelPools,
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
          {
            key: 'qualifications',
            label: 'Qualifikationen',
            valueAccessor: (person) => (person.qualifications ?? []).join(', ') || '—',
          },
          {
            key: 'serviceIds',
            label: 'Dienste',
            valueAccessor: (person) =>
              this.formatCount(person.serviceIds?.length ?? 0, 'Dienst', 'Dienste'),
          },
        ],
        fields: [
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
            options: this.qualificationOptions,
          },
          {
            key: 'serviceIds',
            label: 'Zugewiesene Dienste',
            type: 'multiselect',
            options: this.personnelServiceOptions,
          },
          {
            key: 'poolId',
            label: 'Pool',
            type: 'text',
            readonly: true,
            hint: 'Wird automatisch über die Pool-Auswahl gesetzt.',
          },
        ],
        items: this.data.personnel,
      },
    };
  }

  private buildVehicleServicesHierarchy(): MasterDataHierarchyConfig<
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
          {
            key: 'serviceIds',
            label: 'Dienste',
            valueAccessor: (pool) =>
              this.formatCount(pool.serviceIds?.length ?? 0, 'Dienst', 'Dienste'),
          },
        ],
        fields: [
          { key: 'name', label: 'Poolname', type: 'text' },
          { key: 'description', label: 'Beschreibung', type: 'textarea' },
        ],
        items: this.data.vehicleServicePools,
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
          {
            key: 'requiredVehicleTypeIds',
            label: 'Fahrzeugtypen',
            valueAccessor: (service) =>
              (service.requiredVehicleTypeIds ?? [])
                .map((typeId) => this.vehicleTypeMap.get(typeId) ?? typeId)
                .join(', ') || '—',
          },
        ],
        fields: [
          { key: 'name', label: 'Dienstname', type: 'text' },
          { key: 'description', label: 'Beschreibung', type: 'textarea' },
          {
            key: 'requiredVehicleTypeIds',
            label: 'Zulässige Fahrzeugtypen',
            type: 'multiselect',
            options: this.vehicleTypeOptions,
          },
          {
            key: 'poolId',
            label: 'Pool',
            type: 'text',
            readonly: true,
            hint: 'Wird automatisch über die Pool-Auswahl gesetzt.',
          },
        ],
        items: this.data.vehicleServices,
      },
    };
  }

  private buildVehicleHierarchy(): MasterDataHierarchyConfig<VehiclePool, Vehicle> {
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
          {
            key: 'vehicleIds',
            label: 'Fahrzeuge',
            valueAccessor: (pool) =>
              this.formatCount(pool.vehicleIds?.length ?? 0, 'Fahrzeug', 'Fahrzeuge'),
          },
        ],
        fields: [
          { key: 'name', label: 'Poolname', type: 'text' },
          { key: 'description', label: 'Beschreibung', type: 'textarea' },
        ],
        items: this.data.vehiclePools,
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
          {
            key: 'typeId',
            label: 'Fahrzeugtyp',
            valueAccessor: (vehicle) => this.vehicleTypeMap.get(vehicle.typeId) ?? vehicle.typeId,
          },
          { key: 'depot', label: 'Depot' },
        ],
        fields: [
          { key: 'vehicleNumber', label: 'Fahrzeugnummer', type: 'text' },
          {
            key: 'typeId',
            label: 'Fahrzeugtyp',
            type: 'select',
            options: this.vehicleTypeOptions,
          },
          { key: 'depot', label: 'Heimatdepot', type: 'text' },
          {
            key: 'serviceIds',
            label: 'Einsatzdienste',
            type: 'multiselect',
            options: this.vehicleServiceOptions,
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
        items: this.data.vehicles,
      },
    };
  }

  private buildVehicleTypesCategory(): MasterDataCategoryConfig<VehicleType> {
    return {
      id: 'vehicle-types',
      icon: 'train',
      title: 'Fahrzeugtypen',
      description: 'Fahrzeugtypen mit Kapazitäten und Kategorien definieren.',
      entityLabel: 'Fahrzeugtyp',
      columns: [
        { key: 'label', label: 'Typ' },
        { key: 'category', label: 'Kategorie' },
        {
          key: 'capacity',
          label: 'Kapazität',
          valueAccessor: (type) => (type.capacity != null ? `${type.capacity}` : '—'),
        },
      ],
      fields: [
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
      ],
      items: this.data.vehicleTypes,
    };
  }

  private buildVehicleCompositionsCategory(): MasterDataCategoryConfig<
    VehicleComposition & { entriesSerialized: string }
  > {
    const items = this.data.vehicleCompositions.map((composition) => ({
      ...composition,
      entriesSerialized: this.serializeCompositionEntries(composition.entries),
    }));

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

  private formatCount(count: number, singular: string, plural: string): string {
    if (count <= 0) {
      return `Keine ${plural}`;
    }
    if (count === 1) {
      return `1 ${singular}`;
    }
    return `${count} ${plural}`;
  }

  private serializeCompositionEntries(entries: VehicleCompositionEntry[]): string {
    return entries.map((entry) => `${entry.typeId}:${entry.quantity}`).join('\n');
  }

  private renderCompositionEntries(entries: VehicleCompositionEntry[] | undefined): string {
    if (!entries || entries.length === 0) {
      return '';
    }

    return entries
      .map((entry) => {
        const label = this.vehicleTypeMap.get(entry.typeId) ?? entry.typeId;
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
}
