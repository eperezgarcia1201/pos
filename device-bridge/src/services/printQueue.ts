import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const spoolDir = path.join(os.tmpdir(), "posweb-print-spool");

function ensureSpool() {
  if (!fs.existsSync(spoolDir)) {
    fs.mkdirSync(spoolDir, { recursive: true });
  }
}

export function queuePrintJob(name: string, payload: string, printerId?: string) {
  ensureSpool();
  const suffix = printerId ? `-${printerId}` : "";
  const filename = `${Date.now()}-${name}${suffix}.txt`;
  const target = path.join(spoolDir, filename);
  fs.writeFileSync(target, payload, "utf8");
  return target;
}
