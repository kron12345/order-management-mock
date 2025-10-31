import {
  Personnel,
  PersonnelPool,
  PersonnelService,
  PersonnelServicePool,
  Vehicle,
  VehicleComposition,
  VehicleService,
  VehicleServicePool,
  VehicleType,
  VehiclePool,
} from '../models/master-data';

export interface DemoMasterData {
  personnelServices: PersonnelService[];
  personnelServicePools: PersonnelServicePool[];
  personnel: Personnel[];
  personnelPools: PersonnelPool[];
  vehicleServices: VehicleService[];
  vehicleServicePools: VehicleServicePool[];
  vehicleTypes: VehicleType[];
  vehicles: Vehicle[];
  vehiclePools: VehiclePool[];
  vehicleCompositions: VehicleComposition[];
}

export const DEMO_MASTER_DATA: DemoMasterData = {
  personnelServices: [
    {
      id: 'PS-001',
      name: 'Frühschicht RE1 Berlin',
      requiredQualifications: ['Triebfahrzeugführer Klasse 3', 'ETCS Level 2'],
      description: 'Lokführer-Dienst für die Frühschicht ab Berlin Ostbahnhof.',
      poolId: 'PSP-RE1',
    },
    {
      id: 'PS-002',
      name: 'Spätschicht RE1 Potsdam',
      requiredQualifications: ['Triebfahrzeugführer Klasse 3'],
      description: 'Übernahme des RE1 am frühen Abend inkl. Übergabe in Potsdam.',
      poolId: 'PSP-RE1',
    },
    {
      id: 'PS-003',
      name: 'IC Nord-Süd Tagesumlauf',
      requiredQualifications: ['Triebfahrzeugführer Klasse 4', 'Zugchef Berechtigung'],
      description: 'Fernverkehrsdienst auf der Nord-Süd-Achse mit zwei Umläufen.',
      poolId: 'PSP-IC',
    },
  ],
  personnelServicePools: [
    {
      id: 'PSP-RE1',
      name: 'RE1 Lokführer Dienste',
      description: 'Standardisierte Dienste für den Regionalexpress 1.',
      serviceIds: ['PS-001', 'PS-002'],
    },
    {
      id: 'PSP-IC',
      name: 'IC Tagesdienste',
      description: 'Fernverkehrsdienste für durchgehende Tagesumläufe.',
      serviceIds: ['PS-003'],
    },
  ],
  personnel: [
    {
      id: 'P-001',
      firstName: 'Julia',
      lastName: 'Meier',
      preferredName: 'Jule',
      qualifications: ['Triebfahrzeugführer Klasse 3', 'ETCS Level 2'],
      serviceIds: ['PS-001', 'PS-002'],
      poolId: 'PP-BER',
    },
    {
      id: 'P-002',
      firstName: 'Lukas',
      lastName: 'Schmidt',
      qualifications: ['Triebfahrzeugführer Klasse 3'],
      serviceIds: ['PS-002'],
      poolId: 'PP-BER',
    },
    {
      id: 'P-003',
      firstName: 'Mira',
      lastName: 'Hassan',
      qualifications: ['Triebfahrzeugführer Klasse 4', 'Zugchef Berechtigung'],
      serviceIds: ['PS-003'],
      poolId: 'PP-HH',
    },
  ],
  personnelPools: [
    {
      id: 'PP-BER',
      name: 'Lokführer Berlin',
      description: 'Regional aus Berlin stationierte Lokführer.',
      personnelIds: ['P-001', 'P-002'],
    },
    {
      id: 'PP-HH',
      name: 'Lokführer Hamburg',
      description: 'Fernverkehr-Lokführer mit Heimatdienststelle Hamburg-Eidelstedt.',
      personnelIds: ['P-003'],
    },
  ],
  vehicleServices: [
    {
      id: 'VS-001',
      name: 'RE1 Umlauf 12',
      description: 'Tagesumlauf mit Wende in Brandenburg und Cottbus.',
      requiredVehicleTypeIds: ['VT-TRAXX-AC3', 'VT-DOSTO-TWIN'],
      poolId: 'VSP-RE1',
    },
    {
      id: 'VS-002',
      name: 'RE1 Verstärker',
      description: 'Kurzfristiger Verstärkerumlauf zur HVZ.',
      requiredVehicleTypeIds: ['VT-TRAXX-AC3', 'VT-DOSTO-TWIN'],
      poolId: 'VSP-RE1',
    },
    {
      id: 'VS-003',
      name: 'IC 2020',
      description: 'Tagesumlauf Berlin - Köln für IC2 Garnitur.',
      requiredVehicleTypeIds: ['VT-147-AC', 'VT-IC2-COACH'],
      poolId: 'VSP-IC',
    },
  ],
  vehicleServicePools: [
    {
      id: 'VSP-RE1',
      name: 'RE1 Regelumläufe',
      description: 'Standardumläufe für den RE1 zwischen Brandenburg und Frankfurt (Oder).',
      serviceIds: ['VS-001', 'VS-002'],
    },
    {
      id: 'VSP-IC',
      name: 'IC Nord-Süd',
      description: 'IC Umläufe auf der Nord-Süd-Achse.',
      serviceIds: ['VS-003'],
    },
  ],
  vehicleTypes: [
    {
      id: 'VT-TRAXX-AC3',
      label: 'BR 147 (TRAXX AC3)',
      category: 'Lokomotive',
      capacity: 0,
    },
    {
      id: 'VT-DOSTO-TWIN',
      label: 'Doppelstockwagen Twindexx',
      category: 'Wagen',
      capacity: 120,
    },
    {
      id: 'VT-147-AC',
      label: 'BR 147.5',
      category: 'Lokomotive',
      capacity: 0,
    },
    {
      id: 'VT-IC2-COACH',
      label: 'IC2 Mittelwagen',
      category: 'Wagen',
      capacity: 96,
    },
  ],
  vehicles: [
    {
      id: 'V-1001',
      vehicleNumber: '147 521-9',
      typeId: 'VT-TRAXX-AC3',
      depot: 'Berlin-Rummelsburg',
      serviceIds: ['VS-001'],
      poolId: 'VP-RE1-BR',
    },
    {
      id: 'V-1002',
      vehicleNumber: '147 522-7',
      typeId: 'VT-TRAXX-AC3',
      depot: 'Berlin-Rummelsburg',
      serviceIds: ['VS-002'],
      poolId: 'VP-RE1-BR',
    },
    {
      id: 'V-2001',
      vehicleNumber: 'Dosto Steuerwagen 1. Klasse',
      typeId: 'VT-DOSTO-TWIN',
      depot: 'Berlin-Grunewald',
      serviceIds: ['VS-001', 'VS-002'],
      poolId: 'VP-RE1-BR',
    },
    {
      id: 'V-2002',
      vehicleNumber: 'Dosto Mittelwagen 2. Klasse A',
      typeId: 'VT-DOSTO-TWIN',
      depot: 'Berlin-Grunewald',
      serviceIds: ['VS-001'],
      poolId: 'VP-RE1-BR',
    },
    {
      id: 'V-3001',
      vehicleNumber: '147 560-9',
      typeId: 'VT-147-AC',
      depot: 'Hamburg-Eidelstedt',
      serviceIds: ['VS-003'],
      poolId: 'VP-IC-NORD',
    },
    {
      id: 'V-4001',
      vehicleNumber: 'IC2 Mittelwagen 2. Klasse B',
      typeId: 'VT-IC2-COACH',
      depot: 'Hamburg-Eidelstedt',
      serviceIds: ['VS-003'],
      poolId: 'VP-IC-NORD',
    },
    {
      id: 'V-4002',
      vehicleNumber: 'IC2 Steuerwagen',
      typeId: 'VT-IC2-COACH',
      depot: 'Hamburg-Eidelstedt',
      serviceIds: ['VS-003'],
      poolId: 'VP-IC-NORD',
    },
  ],
  vehiclePools: [
    {
      id: 'VP-RE1-BR',
      name: 'RE1 Brandenburg Pool',
      description: 'Fahrzeuge für die Umläufe des RE1 in Brandenburg.',
      vehicleIds: ['V-1001', 'V-1002', 'V-2001', 'V-2002'],
    },
    {
      id: 'VP-IC-NORD',
      name: 'IC Nord-Süd Pool',
      description: 'IC2 Fahrzeuge für den Umlauf Berlin - Köln.',
      vehicleIds: ['V-3001', 'V-4001', 'V-4002'],
    },
  ],
  vehicleCompositions: [
    {
      id: 'VC-RE1-4TLG',
      name: 'RE1 4-teilig',
      entries: [
        { typeId: 'VT-TRAXX-AC3', quantity: 1 },
        { typeId: 'VT-DOSTO-TWIN', quantity: 4 },
      ],
    },
    {
      id: 'VC-IC2-5TLG',
      name: 'IC2 5-teilig',
      entries: [
        { typeId: 'VT-147-AC', quantity: 1 },
        { typeId: 'VT-IC2-COACH', quantity: 4 },
      ],
    },
  ],
};
