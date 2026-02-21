import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { queuePrintJob } from "./services/printQueue.js";

const app = Fastify({ logger: true });
const port = Number(process.env.DEVICE_BRIDGE_PORT || 7090);

const config = loadConfig();

app.get("/health", async () => ({ ok: true, configLoaded: config.printers.length > 0 }));

app.get("/devices", async () => ({
  printers: config.printers,
  cashDrawers: config.cashDrawers,
  scanners: config.scanners,
  scales: config.scales,
  customerDisplays: config.customerDisplays,
  pax: config.pax ?? null
}));

app.post("/print/receipt", async (request) => {
  const { text, printerId } = (request.body as { text?: string; printerId?: string }) ?? {};
  const payload = text ?? "";
  const target = queuePrintJob("receipt", payload, printerId);
  return { status: "queued", target, printerId };
});

app.post("/print/kitchen", async (request) => {
  const { text, printerId } = (request.body as { text?: string; printerId?: string }) ?? {};
  const payload = text ?? "";
  const target = queuePrintJob("kitchen", payload, printerId);
  return { status: "queued", target, printerId };
});

app.post("/print/report", async (request) => {
  const { text, printerId } = (request.body as { text?: string; printerId?: string }) ?? {};
  const payload = text ?? "";
  const target = queuePrintJob("report", payload, printerId);
  return { status: "queued", target, printerId };
});

app.post("/drawer/open", async () => ({
  status: "queued",
  detail: "Drawer kick is handled by printer driver (ESC/POS)"
}));

app.post("/scale/read", async () => ({
  weight: null,
  unit: null,
  status: "not_implemented"
}));

app.post("/display/show", async () => ({ status: "queued" }));

app.post("/pax/charge", async () => ({ status: "not_implemented", model: config.pax?.model }));
app.post("/pax/refund", async () => ({ status: "not_implemented", model: config.pax?.model }));
app.post("/pax/void", async () => ({ status: "not_implemented", model: config.pax?.model }));
app.get("/pax/status", async () => ({ status: "unknown", model: config.pax?.model }));

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
