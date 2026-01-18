// Usage: npx tsx index.test.ts
// Requires: PostgreSQL running with apple_notes database
import { test, describe, before, after } from "node:test";
import assert from "node:assert";

// Test configuration - uses test database to avoid production data
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://localhost:5432/apple_notes_test";

import {
  initializeSchema,
  checkConnection,
  upsertNote,
  getNoteByTitle,
  getNotesCount,
  vectorSearch,
  textSearch,
  closePool,
} from "./src/db.js";
import { generateEmbedding, prepareTextForEmbedding } from "./src/embeddings.js";
import { hybridSearch } from "./src/search.js";

describe("Apple Notes MCP - PostgreSQL", async () => {
  let dbConnected = false;

  before(async () => {
    dbConnected = await checkConnection();
    if (dbConnected) {
      await initializeSchema();
    }
  });

  after(async () => {
    if (dbConnected) {
      await closePool();
    }
  });

  test("should connect to database", async () => {
    assert.ok(dbConnected, "Database should be connected");
  });

  test("should generate embeddings", async () => {
    const text = "This is a test note about machine learning";
    const embedding = await generateEmbedding(text);

    assert.ok(Array.isArray(embedding), "Embedding should be an array");
    assert.equal(embedding.length, 384, "Embedding should have 384 dimensions");
    assert.ok(embedding.every((v) => typeof v === "number"), "All values should be numbers");
  });

  test("should prepare text for embedding", () => {
    const title = "My Note";
    const content = "This is the content";
    const prepared = prepareTextForEmbedding(title, content);

    assert.equal(prepared, "My Note\n\nThis is the content");
  });

  test.skip("should upsert and retrieve a note", async () => {
    if (!dbConnected) {
      console.log("Skipping: Database not connected");
      return;
    }

    const testNote = {
      apple_note_id: "test-note-001",
      title: "Test Note for Unit Testing",
      content: "This is test content for the Apple Notes MCP server",
      html_content: "<p>This is test content</p>",
      folder_path: "Test Folder",
      creation_date: new Date(),
      modification_date: new Date(),
      content_hash: "abc123",
      embedding: await generateEmbedding("Test Note for Unit Testing This is test content"),
    };

    const id = await upsertNote(testNote);
    assert.ok(id > 0, "Should return a valid ID");

    const retrieved = await getNoteByTitle("Test Note for Unit Testing");
    assert.ok(retrieved, "Should retrieve the note");
    assert.equal(retrieved?.title, testNote.title);
  });

  test.skip("should perform vector search", async () => {
    if (!dbConnected) {
      console.log("Skipping: Database not connected");
      return;
    }

    const count = await getNotesCount();
    if (count === 0) {
      console.log("Skipping: No notes indexed");
      return;
    }

    const queryEmbedding = await generateEmbedding("machine learning");
    const results = await vectorSearch(queryEmbedding, 5);

    assert.ok(Array.isArray(results), "Should return an array");
  });

  test.skip("should perform text search", async () => {
    if (!dbConnected) {
      console.log("Skipping: Database not connected");
      return;
    }

    const count = await getNotesCount();
    if (count === 0) {
      console.log("Skipping: No notes indexed");
      return;
    }

    const results = await textSearch("test", 5);
    assert.ok(Array.isArray(results), "Should return an array");
  });

  test.skip("should perform hybrid search", async () => {
    if (!dbConnected) {
      console.log("Skipping: Database not connected");
      return;
    }

    const count = await getNotesCount();
    if (count === 0) {
      console.log("Skipping: No notes indexed");
      return;
    }

    const results = await hybridSearch("machine learning notes", 10);

    assert.ok(Array.isArray(results), "Should return an array");
    if (results.length > 0) {
      assert.ok(results[0].title, "Results should have titles");
      assert.ok(results[0].content, "Results should have content");
    }
  });
});
