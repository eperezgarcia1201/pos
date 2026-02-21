import { prisma } from "./prisma.js";

export type PrinterRouting = {
  customerReceiptPrinterId?: string;
  kitchenPrinterId?: string;
  barPrinterId?: string;
  reportPrinterId?: string;
  stationDefaultPrinterId?: string;
};

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export async function getPrinterRouting(): Promise<PrinterRouting> {
  const setting = await prisma.appSetting.findUnique({ where: { key: "printer_routing" } });
  const raw = (setting?.value as Record<string, unknown> | null) || {};
  return {
    customerReceiptPrinterId: stringOrUndefined(raw.customerReceiptPrinterId),
    kitchenPrinterId: stringOrUndefined(raw.kitchenPrinterId),
    barPrinterId: stringOrUndefined(raw.barPrinterId),
    reportPrinterId: stringOrUndefined(raw.reportPrinterId),
    stationDefaultPrinterId: stringOrUndefined(raw.stationDefaultPrinterId)
  };
}
