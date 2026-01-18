#!/usr/bin/env bun
import "dotenv/config";
import { startFullIndexing } from "./src/indexer.js";
import { initializeSchema, closePool } from "./src/db.js";

async function main() {
  console.log("📝 Starting full indexing...\n");

  await initializeSchema();
  const result = await startFullIndexing();

  console.log("\n📊 Indexing Results:");
  console.log(`   Total notes: ${result.totalNotes}`);
  console.log(`   Processed: ${result.processedNotes}`);
  console.log(`   Failed: ${result.failedNotes}`);
  console.log(`   Time: ${Math.round(result.timeMs! / 1000)}s`);

  await closePool();
}

main().catch(console.error);
