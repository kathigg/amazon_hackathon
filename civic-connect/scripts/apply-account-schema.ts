#!/usr/bin/env tsx

import { ensureAccountSchema } from "../lib/account-schema";

process.env.ENABLE_RUNTIME_SCHEMA_REPAIR = "true";

ensureAccountSchema()
  .then(() => {
    console.log("schema repair complete");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
