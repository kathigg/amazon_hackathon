import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });

const prisma = new PrismaClient();

async function main() {
  const tables: { table_name: string }[] = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'
     ORDER BY table_name`
  );

  console.log("\n=== TABLES IN REMOTE DB ===");
  for (const t of tables) {
    const [{ count }]: any = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "${t.table_name}"`
    );
    console.log(`  ${t.table_name.padEnd(30)} rows=${count}`);
  }

  const fks: any[] = await prisma.$queryRawUnsafe(`
    SELECT
      tc.table_name AS from_table,
      kcu.column_name AS from_column,
      ccu.table_name AS to_table,
      ccu.column_name AS to_column,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
    ORDER BY from_table, from_column;
  `);

  console.log("\n=== FOREIGN KEYS ===");
  for (const f of fks) {
    console.log(`  ${f.from_table}.${f.from_column}  ->  ${f.to_table}.${f.to_column}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
