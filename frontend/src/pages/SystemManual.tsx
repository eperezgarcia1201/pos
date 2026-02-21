import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppLanguage } from "../lib/i18n";

type ManualSection = {
  id: string;
  title: string;
  description?: string;
  steps: string[];
};

type ManualContent = {
  title: string;
  subtitle: string;
  languageLabel: string;
  englishLabel: string;
  spanishLabel: string;
  backOfficeLabel: string;
  supportLabel: string;
  quickNavLabel: string;
  sections: ManualSection[];
};

const EN_CONTENT: ManualContent = {
  title: "System Manual",
  subtitle: "Step-by-step guide for daily operations, mobile apps, kitchen, settings, and cloud sync.",
  languageLabel: "Language",
  englishLabel: "English",
  spanishLabel: "Spanish",
  backOfficeLabel: "Back Office",
  supportLabel: "Support",
  quickNavLabel: "Quick Navigation",
  sections: [
    {
      id: "startup",
      title: "Start The System",
      steps: [
        "Start backend: `cd webapp/backend && npm run dev`.",
        "Start frontend: `cd webapp/frontend && npm run dev`.",
        "Start mobile server app (if used): `cd webapp/mobile-server && npm start`.",
        "Start mobile owner app (if used): `cd webapp/mobile-owner && npm start`.",
        "Confirm backend health from browser: `http://localhost:8080/health` should return `{ \"ok\": true }`."
      ]
    },
    {
      id: "station",
      title: "Login And Station Type",
      steps: [
        "Open POS Home and sign in with access code (PIN).",
        "Use `Change Station Type` to select `full`, `hostess`, `kitchen-display`, or `expo-display`.",
        "Manager PIN is required to change station mode.",
        "Verify station mode before taking orders to avoid wrong workflow screens."
      ]
    },
    {
      id: "orders",
      title: "Dine-In And Take-Out Orders",
      steps: [
        "Tap `Dine In` for table service or `Take Out` for carry-out orders.",
        "For dine-in, select table first. The system blocks continue if no table is selected.",
        "Add items from categories, open modifiers, and confirm quantity/notes.",
        "Tap `Done`/`Send` to send items to kitchen.",
        "Empty tickets are blocked; add at least one item before hold/send."
      ]
    },
    {
      id: "recall",
      title: "Recall Screen And Ticket Actions",
      steps: [
        "Open `Recall` to view open and active tickets.",
        "Use search by ticket/order number when needed.",
        "Select a ticket, then use actions (recall, print receipt, send to kitchen, void/refund based on permissions).",
        "If ticket has no items, close/delete it; do not keep empty checks open."
      ]
    },
    {
      id: "kitchen",
      title: "Kitchen / Expo Workflow",
      steps: [
        "Kitchen receives sent tickets automatically by station routing.",
        "Use `Start` to move a ticket into working flow.",
        "Use bump/done actions to complete tickets.",
        "Use station filters when multiple prep stations are active.",
        "If a ticket is missing, verify it was sent and that item station mapping is correct."
      ]
    },
    {
      id: "payments",
      title: "Payment Workflow",
      steps: [
        "Open the customer ticket from Recall/Open Orders.",
        "Choose payment method (cash/card/house account depending on setup).",
        "For card payments, verify payment gateway settings first in `Settings > Payments`.",
        "Complete payment and print/email receipt as required.",
        "Confirm ticket status changes to paid/closed after successful payment."
      ]
    },
    {
      id: "staff",
      title: "Staff, Roles, And Security",
      steps: [
        "Go to `Back Office > Staff & Roles` to create users.",
        "Assign role, language, status, and PIN/access code for each employee.",
        "Use `Security Settings` to define role defaults and user overrides.",
        "Use legacy-style security levels (1-5) where configured."
      ]
    },
    {
      id: "store-settings",
      title: "Store Settings And Integrations",
      steps: [
        "Open `Back Office > Store Settings`.",
        "Configure General, Taxes, Services, Revenue, Receipts, Order Entry, Products, Staff/CRM, Print, and Other tabs.",
        "Set payment gateway configuration in `Settings > Payments & Gateway`.",
        "Save settings and test one real order flow to validate behavior."
      ]
    },
    {
      id: "mobile",
      title: "Mobile Server And Owner Apps",
      steps: [
        "Mobile Server app: sign in, choose Dine In/Take Out/Recall, add items/modifiers, tap Done to send to kitchen.",
        "Mobile Owner app: sign in and review KPIs, void alerts, and open tickets.",
        "If mobile data differs from web, verify both apps point to the same backend URL and active database."
      ]
    },
    {
      id: "cloud",
      title: "Cloud Store Sync (Edge + Cloud)",
      steps: [
        "Create store in `Settings > Cloud Stores`.",
        "Generate node bootstrap token and register edge node/store-agent.",
        "Publish revisions from `Settings > Cloud Sync`.",
        "Track command status (`PENDING`, `FAILED`, `ACKED`), inspect logs, and use retry when needed."
      ]
    },
    {
      id: "close",
      title: "Daily Close Checklist",
      steps: [
        "Confirm no unresolved kitchen tickets.",
        "Review open orders and settle pending checks.",
        "Run end-of-day reports.",
        "Confirm data backup and service health before shutdown."
      ]
    }
  ]
};

const ES_CONTENT: ManualContent = {
  title: "Manual Del Sistema",
  subtitle: "Guia paso a paso para operacion diaria, apps moviles, cocina, configuracion y sincronizacion cloud.",
  languageLabel: "Idioma",
  englishLabel: "Ingles",
  spanishLabel: "Espanol",
  backOfficeLabel: "Back Office",
  supportLabel: "Soporte",
  quickNavLabel: "Navegacion Rapida",
  sections: [
    {
      id: "startup",
      title: "Iniciar El Sistema",
      steps: [
        "Inicia backend: `cd webapp/backend && npm run dev`.",
        "Inicia frontend: `cd webapp/frontend && npm run dev`.",
        "Inicia app movil de mesero (si aplica): `cd webapp/mobile-server && npm start`.",
        "Inicia app movil de owner (si aplica): `cd webapp/mobile-owner && npm start`.",
        "Confirma salud del backend: `http://localhost:8080/health` debe regresar `{ \"ok\": true }`."
      ]
    },
    {
      id: "station",
      title: "Ingreso Y Tipo De Estacion",
      steps: [
        "Abre POS Home e inicia sesion con codigo de acceso (PIN).",
        "Usa `Change Station Type` para seleccionar `full`, `hostess`, `kitchen-display` o `expo-display`.",
        "Se requiere PIN de gerente para cambiar modo de estacion.",
        "Verifica el modo antes de tomar ordenes para evitar flujo incorrecto."
      ]
    },
    {
      id: "orders",
      title: "Ordenes Dine-In Y Take-Out",
      steps: [
        "Toca `Dine In` para mesas o `Take Out` para llevar.",
        "En dine-in, primero selecciona mesa. El sistema bloquea continuar sin mesa.",
        "Agrega articulos por categoria, abre modificadores y confirma cantidad/notas.",
        "Toca `Done`/`Send` para enviar a cocina.",
        "No se permiten tickets vacios; agrega al menos un articulo antes de hold/send."
      ]
    },
    {
      id: "recall",
      title: "Pantalla Recall Y Acciones",
      steps: [
        "Abre `Recall` para ver tickets abiertos y activos.",
        "Usa busqueda por ticket/orden cuando sea necesario.",
        "Selecciona ticket y ejecuta acciones (recall, imprimir, enviar cocina, void/refund segun permisos).",
        "Si un ticket no tiene articulos, cierralo o eliminalo; no dejes checks vacios abiertos."
      ]
    },
    {
      id: "kitchen",
      title: "Flujo De Cocina / Expo",
      steps: [
        "Cocina recibe tickets enviados automaticamente por ruteo de estacion.",
        "Usa `Start` para pasar ticket a trabajo.",
        "Usa bump/done para completar tickets.",
        "Usa filtros de estacion cuando hay varias areas de preparacion.",
        "Si falta un ticket, valida que fue enviado y que el mapeo de estacion por item este correcto."
      ]
    },
    {
      id: "payments",
      title: "Flujo De Pago",
      steps: [
        "Abre el ticket del cliente desde Recall/Open Orders.",
        "Selecciona metodo de pago (efectivo/tarjeta/cuenta interna segun configuracion).",
        "Para tarjeta, valida primero `Settings > Payments`.",
        "Completa pago e imprime/envia recibo segun politica.",
        "Confirma que el ticket quede pagado/cerrado."
      ]
    },
    {
      id: "staff",
      title: "Personal, Roles Y Seguridad",
      steps: [
        "Ve a `Back Office > Staff & Roles` para crear empleados.",
        "Asigna rol, idioma, estado y PIN/codigo por usuario.",
        "Usa `Security Settings` para permisos por rol y overrides por usuario.",
        "Usa niveles de seguridad legacy (1-5) donde aplique."
      ]
    },
    {
      id: "store-settings",
      title: "Configuracion De Tienda E Integraciones",
      steps: [
        "Abre `Back Office > Store Settings`.",
        "Configura pestañas General, Taxes, Services, Revenue, Receipts, Order Entry, Products, Staff/CRM, Print y Other.",
        "Define gateway de pagos en `Settings > Payments & Gateway`.",
        "Guarda y prueba una orden real para validar comportamiento."
      ]
    },
    {
      id: "mobile",
      title: "Apps Moviles De Mesero Y Owner",
      steps: [
        "App mesero: inicia sesion, elige Dine In/Take Out/Recall, agrega items/modificadores y toca Done para enviar a cocina.",
        "App owner: inicia sesion y revisa KPI, alertas de void y tickets abiertos.",
        "Si datos moviles no coinciden con web, confirma que ambas apps apunten al mismo backend y base de datos."
      ]
    },
    {
      id: "cloud",
      title: "Sincronizacion Cloud (Edge + Cloud)",
      steps: [
        "Crea tienda en `Settings > Cloud Stores`.",
        "Genera bootstrap token y registra nodo edge/store-agent.",
        "Publica revisiones desde `Settings > Cloud Sync`.",
        "Monitorea estados (`PENDING`, `FAILED`, `ACKED`), revisa logs y usa retry cuando sea necesario."
      ]
    },
    {
      id: "close",
      title: "Checklist De Cierre Diario",
      steps: [
        "Confirma que no existan tickets de cocina pendientes.",
        "Revisa ordenes abiertas y liquida cuentas pendientes.",
        "Ejecuta reportes de cierre de dia.",
        "Confirma respaldo de datos y salud de servicios antes de apagar."
      ]
    }
  ]
};

export default function SystemManual() {
  const navigate = useNavigate();
  const appLanguage = useAppLanguage();
  const [manualLanguage, setManualLanguage] = useState<"en" | "es">(appLanguage === "es" ? "es" : "en");
  const content = useMemo(() => (manualLanguage === "es" ? ES_CONTENT : EN_CONTENT), [manualLanguage]);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>{content.title}</h2>
          <p>{content.subtitle}</p>
        </div>
        <div className="terminal-actions">
          <label className="hint" style={{ marginTop: 0 }}>
            {content.languageLabel}
          </label>
          <div className="manual-language-switch">
            <button
              type="button"
              className={`terminal-btn ${manualLanguage === "en" ? "primary" : "ghost"}`}
              onClick={() => setManualLanguage("en")}
            >
              {content.englishLabel}
            </button>
            <button
              type="button"
              className={`terminal-btn ${manualLanguage === "es" ? "primary" : "ghost"}`}
              onClick={() => setManualLanguage("es")}
            >
              {content.spanishLabel}
            </button>
          </div>
          <button type="button" className="terminal-btn ghost" onClick={() => navigate("/settings/support")}>
            {content.supportLabel}
          </button>
          <button type="button" className="terminal-btn" onClick={() => navigate("/back-office")}>
            {content.backOfficeLabel}
          </button>
        </div>
      </header>

      <div className="screen-grid manual-grid">
        <section className="panel manual-index">
          <h3>{content.quickNavLabel}</h3>
          <div className="manual-index-list">
            {content.sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                className="manual-index-link"
                onClick={() => {
                  const target = document.getElementById(`manual-${section.id}`);
                  if (!target) return;
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span>{index + 1}.</span>
                <span>{section.title}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel manual-content">
          {content.sections.map((section, index) => (
            <article key={section.id} id={`manual-${section.id}`} className="manual-section">
              <h3>
                {index + 1}. {section.title}
              </h3>
              {section.description ? <p className="hint">{section.description}</p> : null}
              <ol className="manual-steps">
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
