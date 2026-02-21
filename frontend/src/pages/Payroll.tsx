import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

type Entry = {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  user: { id: string; username: string; displayName?: string };
};

export default function Payroll() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    (async () => {
      const data = await apiFetch("/timeclock");
      setEntries(data);
    })().catch(console.error);
  }, []);

  const summary = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; shifts: number }>();
    for (const entry of entries) {
      if (!entry.clockOut) continue;
      const hours = (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 36e5;
      const name = entry.user.displayName || entry.user.username;
      const current = map.get(entry.userId) || { name, hours: 0, shifts: 0 };
      current.hours += hours;
      current.shifts += 1;
      map.set(entry.userId, current);
    }
    return Array.from(map.values()).map((row) => ({
      ...row,
      hours: Math.round(row.hours * 100) / 100
    }));
  }, [entries]);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Pay Employees</h2>
          <p>Review time clock totals for payroll.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel span-2">
          <h3>Payroll Summary</h3>
          <div className="table-list">
            <div className="table-header">
              <span>Employee</span>
              <span>Shifts</span>
              <span>Total Hours</span>
            </div>
            {summary.map((row) => (
              <div key={row.name} className="table-row">
                <span>{row.name}</span>
                <span>{row.shifts}</span>
                <span>{row.hours.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
