import { prisma } from "./prisma.js";

export type StationContext = {
  stationId?: string;
  terminalId?: string;
};

export async function resolveStation(context: StationContext) {
  if (context.stationId) {
    return prisma.station.findUnique({ where: { id: context.stationId } });
  }
  if (context.terminalId) {
    return prisma.station.findFirst({ where: { terminalId: context.terminalId } });
  }
  return null;
}
