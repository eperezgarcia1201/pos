import { Navigate, Route, Routes } from "react-router-dom";
import CloudStores from "../src/pages/CloudStores";
import CloudStoreNetwork from "../src/pages/CloudStoreNetwork";
import CloudStoreSync from "../src/pages/CloudStoreSync";

function BackOfficeRedirect() {
  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Customer Back Office</h2>
          <p>Use "Open Customer Back Office" from Hierarchy or Network for one-click impersonation.</p>
        </div>
      </header>
      <section className="panel">
        <p style={{ margin: 0 }}>Redirecting to cloud hierarchy...</p>
      </section>
      <Navigate to="/cloud/platform/hierarchy" replace />
    </div>
  );
}

export default function PlatformApp() {
  return (
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
  );
}

