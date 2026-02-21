import { Navigate, Route, Routes } from "react-router-dom";
import CloudStores from "../src/pages/CloudStores";
import CloudStoreNetwork from "../src/pages/CloudStoreNetwork";
import CloudStoreSync from "../src/pages/CloudStoreSync";
import { CloudPortalUiProvider, useCloudPortalUi } from "../src/lib/cloudPortalUi";

function BackOfficeRedirect() {
  const { tx } = useCloudPortalUi();

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>{tx("Customer Back Office", "Back Office del cliente")}</h2>
          <p>
            {tx(
              'Use "Open Customer Back Office" from Hierarchy or Network for one-click impersonation.',
              'Usa "Abrir Back Office del cliente" desde Jerarquia o Red para suplantacion con un clic.'
            )}
          </p>
        </div>
      </header>
      <section className="panel">
        <p style={{ margin: 0 }}>{tx("Redirecting to cloud hierarchy...", "Redirigiendo a jerarquia cloud...")}</p>
      </section>
      <Navigate to="/cloud/platform/hierarchy" replace />
    </div>
  );
}

export default function PlatformApp() {
  return (
    <CloudPortalUiProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/cloud/platform/hierarchy" replace />} />
        <Route path="/cloud/platform" element={<Navigate to="/cloud/platform/hierarchy" replace />} />
        <Route path="/cloud/platform/hierarchy" element={<CloudStores />} />
        <Route path="/cloud/platform/network" element={<CloudStoreNetwork />} />
        <Route path="/cloud/platform/sync" element={<CloudStoreSync />} />

        <Route path="/settings/cloud-stores" element={<CloudStores />} />
        <Route path="/settings/cloud-network" element={<CloudStoreNetwork />} />
        <Route path="/settings/cloud-sync" element={<CloudStoreSync />} />

        <Route path="/back-office" element={<BackOfficeRedirect />} />
        <Route path="*" element={<Navigate to="/cloud/platform/hierarchy" replace />} />
      </Routes>
    </CloudPortalUiProvider>
  );
}
