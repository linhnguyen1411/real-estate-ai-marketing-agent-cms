export type AssetType =
  | 'apartment'
  | 'land'
  | 'shophouse'
  | 'warehouse'
  | 'hotel'
  | 'project'
  | 'unknown';

export type AssetIdentity = {
  id: string;
  type: AssetType;
  name: string;
  project: string | null;
  developer: string | null;
  location: string | null;
  stage: string | null;
};

export type AssetIdentitySnapshot = AssetIdentity;
