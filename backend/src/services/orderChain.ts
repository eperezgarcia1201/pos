import { Prisma } from "@prisma/client";

export type OrderChainMeta = {
  chainGroupId?: string;
  chainRootOrderId?: string;
  chainIndex?: number;
};

export function getLegacyPayloadObject(
  payload: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
): Record<string, Prisma.JsonValue | Prisma.InputJsonValue> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, Prisma.JsonValue | Prisma.InputJsonValue>;
}

export function getOrderChainMeta(
  payload: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
): OrderChainMeta {
  const base = getLegacyPayloadObject(payload);
  const chainGroupId =
    typeof base.chainGroupId === "string" && base.chainGroupId.trim().length > 0
      ? base.chainGroupId
      : undefined;
  const chainRootOrderId =
    typeof base.chainRootOrderId === "string" && base.chainRootOrderId.trim().length > 0
      ? base.chainRootOrderId
      : undefined;
  const chainIndexValue = base.chainIndex;
  const chainIndex =
    typeof chainIndexValue === "number" && Number.isFinite(chainIndexValue)
      ? chainIndexValue
      : typeof chainIndexValue === "string" && chainIndexValue.trim().length > 0
        ? Number(chainIndexValue)
        : undefined;

  return {
    chainGroupId,
    chainRootOrderId,
    chainIndex: chainIndex && Number.isFinite(chainIndex) ? chainIndex : undefined
  };
}

export function withOrderChainMeta(
  payload: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  meta: Required<Pick<OrderChainMeta, "chainGroupId" | "chainRootOrderId" | "chainIndex">>
): Prisma.InputJsonObject {
  return {
    ...(getLegacyPayloadObject(payload) as Prisma.InputJsonObject),
    chainGroupId: meta.chainGroupId,
    chainRootOrderId: meta.chainRootOrderId,
    chainIndex: meta.chainIndex
  };
}

type SortableChainOrder = {
  id: string;
  createdAt: Date;
  legacyPayload?: Prisma.JsonValue | null;
};

export function sortChainOrders<T extends SortableChainOrder>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const aMeta = getOrderChainMeta(a.legacyPayload);
    const bMeta = getOrderChainMeta(b.legacyPayload);
    const aIndex = typeof aMeta.chainIndex === "number" ? aMeta.chainIndex : Number.MAX_SAFE_INTEGER;
    const bIndex = typeof bMeta.chainIndex === "number" ? bMeta.chainIndex : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    return a.id.localeCompare(b.id);
  });
}
