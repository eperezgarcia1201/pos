export default function Reports() {
  return (
    <section className="content">
      <header className="header">
        <div className="title">
          <h2>Reports</h2>
          <p>Sales, labor, taxes, and item performance.</p>
        </div>
        <div className="pill">Export ready</div>
      </header>

      <div className="cards">
        <div className="card">
          <h3>Daily Sales</h3>
          <p className="mono">$12,480.55</p>
        </div>
        <div className="card">
          <h3>Tax Collected</h3>
          <p className="mono">$1,024.14</p>
        </div>
        <div className="card">
          <h3>Voids</h3>
          <p className="mono">$142.00</p>
        </div>
      </div>

      <div className="panel">
        <h3>Top Items</h3>
        <table className="table-list">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {[
              { item: "Smoked Brisket", qty: 122, net: "$2,196" },
              { item: "Seasonal Spritz", qty: 98, net: "$1,176" },
              { item: "Veggie Bowl", qty: 74, net: "$999" }
            ].map((row) => (
              <tr key={row.item}>
                <td>{row.item}</td>
                <td>{row.qty}</td>
                <td className="mono">{row.net}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
