export default function Inventory() {
  return (
    <section className="content">
      <header className="header">
        <div className="title">
          <h2>Inventory</h2>
          <p>Track stock levels, waste, and reorder points.</p>
        </div>
        <div className="pill warning">Needs review</div>
      </header>

      <div className="panel">
        <h3>Low Stock</h3>
        <table className="table-list">
          <thead>
            <tr>
              <th>Item</th>
              <th>On Hand</th>
              <th>Par</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {[
              { item: "Ribeye", onHand: 4, par: 10, unit: "lb" },
              { item: "Lime", onHand: 12, par: 30, unit: "each" },
              { item: "IPA Keg", onHand: 0, par: 1, unit: "keg" }
            ].map((row) => (
              <tr key={row.item}>
                <td>{row.item}</td>
                <td>{row.onHand}</td>
                <td>{row.par}</td>
                <td>{row.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
