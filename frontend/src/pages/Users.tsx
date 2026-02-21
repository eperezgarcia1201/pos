export default function Users() {
  return (
    <section className="content">
      <header className="header">
        <div className="title">
          <h2>Users & Roles</h2>
          <p>Assign permissions and audit access.</p>
        </div>
        <div className="pill">Policy active</div>
      </header>

      <div className="panel">
        <h3>Staff Directory</h3>
        <table className="table-list">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Sign-in</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Aria Moore", role: "Manager", status: "Active", last: "Today" },
              { name: "Jules Fox", role: "Server", status: "Active", last: "Today" },
              { name: "Maya Lin", role: "Bartender", status: "Active", last: "Yesterday" }
            ].map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.role}</td>
                <td>{row.status}</td>
                <td>{row.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
