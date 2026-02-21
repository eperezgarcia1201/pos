import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type User = { id: string; username: string; displayName?: string };

type Entry = { id: string; userId: string; clockIn: string; clockOut: string | null; user: User };

export default function TimeClockPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedUser, setSelectedUser] = useState("");

  const load = async () => {
    const [userList, entryList] = await Promise.all([
      apiFetch("/users"),
      apiFetch("/timeclock")
    ]);
    setUsers(userList);
    setEntries(entryList);
  };

  useEffect(() => {
    load().catch(console.error);
  }, []);

  return (
    <div className="screen-shell">
      <header className="screen-header">
        <div>
          <h2>Time Clock</h2>
          <p>Clock in/out and attendance history.</p>
        </div>
      </header>

      <div className="screen-grid">
        <section className="panel">
          <h3>Clock In/Out</h3>
          <div className="form-row">
            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)}>
              <option value="">Select user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.username}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                if (!selectedUser) return;
                await apiFetch("/timeclock/in", {
                  method: "POST",
                  body: JSON.stringify({ userId: selectedUser })
                });
                await load();
              }}
            >
              Clock In
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!selectedUser) return;
                await apiFetch("/timeclock/out", {
                  method: "POST",
                  body: JSON.stringify({ userId: selectedUser })
                });
                await load();
              }}
            >
              Clock Out
            </button>
          </div>
        </section>

        <section className="panel span-2">
          <h3>Attendance</h3>
          <div className="table-list">
            <div className="table-header">
              <span>User</span>
              <span>Clock In</span>
              <span>Clock Out</span>
            </div>
            {entries.map((entry) => (
              <div key={entry.id} className="table-row">
                <span>{entry.user.displayName || entry.user.username}</span>
                <span>{new Date(entry.clockIn).toLocaleString()}</span>
                <span>{entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "-"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
