import mysql from "mysql2/promise";

const fallbackUrl = "mysql://root:1234qwer@localhost:3306/poselmer";

function parseDatabaseUrl(urlString: string) {
  const url = new URL(urlString);
  const database = url.pathname.replace("/", "") || "poselmer";
  return {
    host: url.hostname || "localhost",
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
    port: url.port ? Number(url.port) : 3306,
    database
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || fallbackUrl;
  const { host, user, password, port, database } = parseDatabaseUrl(databaseUrl);

  const connection = await mysql.createConnection({
    host,
    user,
    password,
    port
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();

  console.log(`Database ensured: ${database} on ${host}:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
