export default function Tables() {
  return (
    <section className="content">
      <header className="header">
        <div className="title">
          <h2>Tables & Floor Plan</h2>
          <p>Manage table status, areas, and reservations.</p>
        </div>
        <div className="pill">Synced</div>
      </header>

      <div className="panel">
        <h3>Dining Room</h3>
        <table className="table-list">
          <thead>
            <tr>
              <th>Table</th>
              <th>Area</th>
              <th>Status</th>
              <th>Capacity</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "T-1", area: "Main", status: "Available", cap: 4 },
              { name: "T-4", area: "Main", status: "Seated", cap: 2 },
              { name: "T-12", area: "Patio", status: "Reserved", cap: 6 }
            ].map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.area}</td>
                <td>{row.status}</td>
                <td>{row.cap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
