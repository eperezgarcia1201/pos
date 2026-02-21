import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/services/prisma.js";

const envDir = process.env.LEGACY_EXPORT_DIR;
const dirArg = process.argv.find((arg) => arg.startsWith("--dir="));
const dir = envDir || (dirArg ? dirArg.split("=")[1] : "./export");

async function main() {
  const absoluteDir = path.resolve(dir);
  const files = fs.readdirSync(absoluteDir).filter((file) => file.endsWith(".json"));

  for (const file of files) {
    const sourceTable = path.basename(file, ".json");
    const payload = JSON.parse(fs.readFileSync(path.join(absoluteDir, file), "utf8")) as Array<Record<string, unknown>>;

    const records = payload.map((row) => ({
      sourceTable,
      sourceId: String(row.ID ?? row.id ?? ""),
      payload: row
    }));

    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      await prisma.legacyRecord.createMany({
        data: records.slice(i, i + batchSize)
      });
    }

    console.log(`Imported ${records.length} rows from ${file}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
