export interface PersonnelService {
  id: string;
  name: string;
  description?: string;
  requiredQualifications?: string[];
  poolId?: string;
}

export interface PersonnelServicePool {
  id: string;
  name: string;
  description?: string;
  serviceIds: string[];
}

export interface Personnel {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  qualifications?: string[];
  serviceIds?: string[];
  poolId?: string;
}

export interface PersonnelPool {
  id: string;
  name: string;
  description?: string;
  personnelIds: string[];
}

export interface VehicleService {
  id: string;
  name: string;
  description?: string;
  requiredVehicleTypeIds?: string[];
  poolId?: string;
}

export interface VehicleServicePool {
  id: string;
  name: string;
  description?: string;
  serviceIds: string[];
}

export interface VehicleType {
  id: string;
  label: string;
  category?: string;
  capacity?: number;
}

export interface Vehicle {
  id: string;
  vehicleNumber: string;
  typeId: string;
  depot?: string;
  serviceIds?: string[];
  description?: string;
  poolId?: string;
}

export interface VehiclePool {
  id: string;
  name: string;
  description?: string;
  vehicleIds: string[];
}

export interface VehicleCompositionEntry {
  typeId: string;
  quantity: number;
}

export interface VehicleComposition {
  id: string;
  name: string;
  entries: VehicleCompositionEntry[];
}
