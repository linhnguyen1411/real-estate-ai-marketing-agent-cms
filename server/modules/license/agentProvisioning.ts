/**
 * Auto-provisioning of HMAC ingest credentials for the desktop agent.
 *
 * A license activation is the only trusted moment we can hand the device a
 * long-lived signing secret, so each licensed device gets its own
 * AgentApiCredential row (visible in the CMS credential list). Scope grants are
 * derived from the account role, and expiry follows the tool entitlement.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import {
  decryptApiSecret,
  encryptApiSecret,
  generateApiKeyPair,
  hashApiSecret,
} from '../../agentIngest/hmacAuth';
import { capabilityScopes, type AgentCapabilities } from './agentCapabilities';

export const DESKTOP_CREDENTIAL_PREFIX = 'desktop-agent:';

export interface ProvisionedIngestCredential {
  credentialId: string;
  keyId: string;
  secret: string;
  scopes: string[];
  expiresAt: string | null;
}

function credentialName(deviceId: string): string {
  return `${DESKTOP_CREDENTIAL_PREFIX}${deviceId}`;
}

async function writeCredentialSecret(credentialId: string): Promise<string> {
  const { secret } = generateApiKeyPair();
  await prisma.agentApiCredential.update({
    where: { id: credentialId },
    data: {
      secretHash: hashApiSecret(secret),
      encryptedSecret: encryptApiSecret(secret),
    },
  });
  return secret;
}

export async function provisionDesktopIngestCredential(params: {
  userId: string;
  deviceId: string;
  companyId: string | null;
  capabilities: AgentCapabilities;
  expiresAt?: Date | null;
}): Promise<ProvisionedIngestCredential> {
  const name = credentialName(params.deviceId);
  const scopes = capabilityScopes(params.capabilities);
  const expiresAt = params.expiresAt ?? null;

  const existing = await prisma.agentApiCredential.findFirst({
    where: { createdBy: params.userId, name },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    let secret = decryptApiSecret(existing.encryptedSecret);
    if (!secret) {
      secret = await writeCredentialSecret(existing.id);
    }
    await prisma.agentApiCredential.update({
      where: { id: existing.id },
      data: {
        companyId: params.companyId,
        status: 'active',
        revokedAt: null,
        scopes: scopes as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    return {
      credentialId: existing.id,
      keyId: existing.keyId,
      secret,
      scopes,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
  }

  const { keyId, secret } = generateApiKeyPair();
  const created = await prisma.agentApiCredential.create({
    data: {
      companyId: params.companyId,
      keyId,
      secretHash: hashApiSecret(secret),
      encryptedSecret: encryptApiSecret(secret),
      name,
      status: 'active',
      scopes: scopes as Prisma.InputJsonValue,
      expiresAt,
      createdBy: params.userId,
    },
  });

  return {
    credentialId: created.id,
    keyId: created.keyId,
    secret,
    scopes,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

/** Revoke every auto-provisioned desktop credential of an account. */
export async function revokeDesktopIngestCredentials(userId: string): Promise<number> {
  const result = await prisma.agentApiCredential.updateMany({
    where: {
      createdBy: userId,
      name: { startsWith: DESKTOP_CREDENTIAL_PREFIX },
      status: 'active',
    },
    data: { status: 'revoked', revokedAt: new Date() },
  });
  return result.count;
}
