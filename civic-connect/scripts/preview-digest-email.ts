import { writeFile } from "node:fs/promises";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const { prepareTestDigestEmail } = await import("../lib/account-digests");
  const email =
    process.argv.find((arg) => arg.startsWith("--email="))?.slice("--email=".length) ??
    "kathigg@udel.edu";
  const shouldSend = process.argv.includes("--send");
  const outputPath = process.argv
    .find((arg) => arg.startsWith("--out="))
    ?.slice("--out=".length);

  const result = await prepareTestDigestEmail({
    email,
    dryRun: !shouldSend,
  });

  if (outputPath && result.html) {
    await writeFile(outputPath, result.html, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        email,
        mode: shouldSend ? "send" : "dry-run",
        sent: result.sent,
        subject: result.subject,
        billCount: result.billCount,
        skippedReason: result.skippedReason,
        outputPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
