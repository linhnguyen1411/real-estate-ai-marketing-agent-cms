/**
 * Unified deterministic extraction for a Facebook post body.
 * Runs BEFORE AI so raw evidence (phone/money/location/area/type) is never lost.
 */

import { extractPhoneData, type PhoneExtractionResult } from './phoneExtractor';
import { extractMoneyData, type MoneyExtractionResult } from './moneyExtractor';
import { extractLocation, type LocationExtractionResult } from './locationExtractor';
import { extractPropertyData, type PropertyExtractionResult } from './propertyExtractor';
import { extractContactData, type ContactExtractionResult } from './contactExtractor';

export * from './phoneExtractor';
export * from './moneyExtractor';
export * from './locationExtractor';
export * from './propertyExtractor';
export * from './contactExtractor';

export const EXTRACTION_VERSION = 'facebook-extract-2';

export interface DeterministicExtraction {
  phone: PhoneExtractionResult;
  money: MoneyExtractionResult;
  location: LocationExtractionResult;
  property: PropertyExtractionResult;
  contact: ContactExtractionResult;
  extractionVersion: string;
  status: 'succeeded' | 'partial' | 'failed';
}

/** Run all deterministic extractors over the ORIGINAL post body. */
export function extractLeadData(contentText: string): DeterministicExtraction {
  const text = (contentText || '').trim();
  const phone = extractPhoneData(text);
  const money = extractMoneyData(text);
  const location = extractLocation(text);
  const property = extractPropertyData(text);
  const contact = extractContactData(text);

  if (contact.primaryContact?.associatedPhone) {
    phone.primaryPhone = contact.primaryContact.associatedPhone;
    phone.phones = phone.phones.map(p =>
      p.normalized === contact.primaryContact!.associatedPhone
        ? {
            ...p,
            label: p.label || 'zalo',
            contactName: contact.primaryContact!.displayName,
            confidence: Math.max(p.confidence, 0.97),
          }
        : p,
    );
  }

  const signals =
    phone.phones.length +
    money.money.length +
    location.normalizedLocations.length +
    property.propertyTypes.length +
    (property.classification !== 'unknown' ? 1 : 0) +
    (contact.primaryContact ? 1 : 0);

  let status: DeterministicExtraction['status'] = 'failed';
  if (!text) status = 'failed';
  else if (signals >= 2) status = 'succeeded';
  else if (signals >= 1) status = 'partial';
  else status = 'partial';

  return {
    phone,
    money,
    location,
    property,
    contact,
    extractionVersion: EXTRACTION_VERSION,
    status,
  };
}

/** Flatten to a compact object suitable for ScannedContent.rawData.extracted */
export function toRawExtracted(x: DeterministicExtraction) {
  return {
    version: x.extractionVersion,
    status: x.status,
    phones: x.phone.phones,
    primaryPhone: x.phone.primaryPhone,
    contactName: x.contact.primaryContact?.displayName ?? null,
    contacts: x.contact.contacts,
    money: x.money.money,
    askingPrice: x.money.askingPrice,
    budgetMin: x.money.budgetMin,
    budgetMax: x.money.budgetMax,
    rentPrice: x.money.rentPrice,
    location: {
      primary: x.location.primaryLocation,
      city: x.location.city,
      district: x.location.district,
      ward: x.location.ward,
      street: x.location.street,
      normalized: x.location.normalizedLocations,
      raw: x.location.rawMentions,
    },
    propertyTypes: x.property.propertyTypes,
    area: x.property.area,
    classification: x.property.classification,
    intent: x.property.intent,
    requirements: x.property.requirements,
  };
}
