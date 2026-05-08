"use strict";

require("tsx/cjs");

const { runMetadataIngest } = require("../../lib/jobs/run-ingest.ts");
const { prisma } = require("../../lib/prisma.ts");

exports.handler = async function handler() {
  try {
    return await runMetadataIngest();
  } finally {
    await prisma.$disconnect();
  }
};
