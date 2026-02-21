export default function Dashboard() {
  return (
    <section className="content">
      <header className="header">
        <div className="title">
          <h2>Today at a glance</h2>
          <p>Sales, labor, and table flow for this store.</p>
        </div>
        <div className="pill warning">Offline sync queued</div>
      </header>

      <div className="cards">
        <div className="card">
          <h3>Gross Sales</h3>
          <p className="mono">$12,480.55</p>
        </div>
        <div className="card">
          <h3>Open Checks</h3>
          <p className="mono">18</p>
        </div>
        <div className="card">
          <h3>Avg Ticket</h3>
          <p className="mono">$28.32</p>
        </div>
        <div className="card">
          <h3>Inventory Alerts</h3>
          <p>6 items below par</p>
        </div>
      </div>

      <div className="panel">
        <h3>Active Tables</h3>
        <table className="table-list">
          <thead>
            <tr>
              <th>Table</th>
              <th>Status</th>
              <th>Server</th>
              <th>Open Time</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "T-12", status: "Seated", server: "Jules", time: "18m" },
              { name: "T-4", status: "Order sent", server: "Maya", time: "9m" },
              { name: "Bar-2", status: "Payment", server: "Aria", time: "34m" }
            ].map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.status}</td>
                <td>{row.server}</td>
                <td>{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
