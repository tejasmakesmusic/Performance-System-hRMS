import { prisma } from '@/lib/prisma'
import { resolveFeatureFlag } from '@/lib/db/feature-flags'

export type FeatureFlags = Record<string, boolean>

export async function getFeatureFlags(userId: string, role: string): Promise<FeatureFlags> {
  const flags = await prisma.featureFlag.findMany({ select: { key: true } })
  const entries = await Promise.all(
    flags.map(async ({ key }) => {
      const value = await resolveFeatureFlag(key, userId, role)
      return [key, value] as [string, boolean]
    })
  )
  return Object.fromEntries(entries)
}

export async function getFlag(key: string, userId: string, role: string): Promise<boolean> {
  return resolveFeatureFlag(key, userId, role)
}
