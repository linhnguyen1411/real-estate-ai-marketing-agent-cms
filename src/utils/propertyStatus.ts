import { Property } from '../types';

export type PropertySaleStatus = 'available' | 'sold' | 'hidden';

export function getPropertySaleStatus(property: Pick<Property, 'sale_status'>): PropertySaleStatus {
  const status = property.sale_status || 'available';
  if (status === 'sold' || status === 'hidden') return status;
  return 'available';
}

/** Tin hiển thị trên website công khai */
export function isPublicProperty(property: Pick<Property, 'sale_status'>): boolean {
  return getPropertySaleStatus(property) === 'available';
}

/** Tin trong admin mặc định (không ẩn — vẫn gồm đã bán để quản lý) */
export function isAdminVisibleProperty(property: Pick<Property, 'sale_status'>): boolean {
  return getPropertySaleStatus(property) !== 'hidden';
}

export function matchesAdminPropertyStatusFilter(
  property: Pick<Property, 'sale_status'>,
  statusFilter: string,
): boolean {
  const saleStatus = getPropertySaleStatus(property);
  if (statusFilter === 'all') return true;
  if (statusFilter === 'visible') return saleStatus !== 'hidden';
  return saleStatus === statusFilter;
}

export function countPropertyStatuses(properties: Pick<Property, 'sale_status'>[]) {
  let available = 0;
  let sold = 0;
  let hidden = 0;
  for (const property of properties) {
    const status = getPropertySaleStatus(property);
    if (status === 'hidden') hidden += 1;
    else if (status === 'sold') sold += 1;
    else available += 1;
  }
  return {
    available,
    sold,
    hidden,
    total: properties.length,
    adminVisible: available + sold,
    publicVisible: available,
  };
}
