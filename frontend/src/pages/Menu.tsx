export default function Menu() {
  return (
    <section className="content">
      <header className="header">
        <div className="title">
          <h2>Menu Editor</h2>
          <p>Categories, items, modifiers, pricing, and visibility.</p>
        </div>
        <div className="pill">Draft</div>
      </header>

      <div className="cards">
        <div className="card">
          <h3>Categories</h3>
          <p>12 categories, 4 hidden</p>
        </div>
        <div className="card">
          <h3>Items</h3>
          <p>186 items, 24 with modifiers</p>
        </div>
        <div className="card">
          <h3>Out of Stock</h3>
          <p>8 items paused</p>
        </div>
      </div>

      <div className="panel">
        <h3>Recent Updates</h3>
        <table className="table-list">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { item: "Smoked Brisket", category: "Entrees", price: "$18.00", status: "Active" },
              { item: "Seasonal Spritz", category: "Bar", price: "$12.00", status: "Scheduled" },
              { item: "Veggie Bowl", category: "Lunch", price: "$13.50", status: "Active" }
            ].map((row) => (
              <tr key={row.item}>
                <td>{row.item}</td>
                <td>{row.category}</td>
                <td className="mono">{row.price}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
