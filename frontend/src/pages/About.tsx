export default function About() {
  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>About</h2>
          <p>Web-based POS inspired by Websys POS workflows.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2">
          <h3>Build Notes</h3>
          <ul className="list">
            <li>Optimized for touchscreen terminals.</li>
            <li>Offline queue sync with retry.</li>
            <li>Hardware via device bridge (printers, drawers, scanners, scales, PAX).</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
