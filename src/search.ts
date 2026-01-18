import { generateEmbedding } from "./embeddings.js";
import { vectorSearch, textSearch, pool, type SearchResult } from "./db.js";

/**
 * Hybrid search combining vector similarity and full-text search
 * Uses Reciprocal Rank Fusion (RRF) to combine results
 */
export async function hybridSearch(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Run both searches in parallel
  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(queryEmbedding, limit),
    textSearch(query, limit),
  ]);

  // Combine using RRF
  const k = 60; // RRF parameter
  const scores = new Map<string, { score: number; title: string; content: string }>();

  // Process vector results
  vectorResults.forEach((result, idx) => {
    const key = `${result.title}::${result.content}`;
    const rrfScore = 1 / (k + idx);
    const existing = scores.get(key);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(key, {
        score: rrfScore,
        title: result.title,
        content: result.content,
      });
    }
  });

  // Process text results
  textResults.forEach((result, idx) => {
    const key = `${result.title}::${result.content}`;
    const rrfScore = 1 / (k + idx);
    const existing = scores.get(key);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scores.set(key, {
        score: rrfScore,
        title: result.title,
        content: result.content,
      });
    }
  });

  // Sort by combined score and return top results
  const results = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ title, content, score }) => ({ title, content, score }));

  return results;
}

/**
 * Vector-only search (semantic similarity)
 */
export async function semanticSearch(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  return vectorSearch(queryEmbedding, limit);
}

/**
 * Text-only search (trigram similarity)
 */
export async function fullTextSearch(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  return textSearch(query, limit);
}

/**
 * Advanced hybrid search with SQL-level RRF (more efficient for large datasets)
 */
export async function advancedHybridSearch(
  query: string,
  limit: number = 20,
  folderPath?: string
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const result = await pool.query(
    `WITH vector_search AS (
      SELECT id, title, content,
             ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
      FROM notes
      WHERE embedding IS NOT NULL
        AND ($3::text IS NULL OR folder_path = $3)
      ORDER BY embedding <=> $1::vector
      LIMIT 50
    ),
    text_search AS (
      SELECT id, title, content,
             ROW_NUMBER() OVER (ORDER BY similarity(title, $2) + similarity(content, $2) DESC) AS rank
      FROM notes
      WHERE (title % $2 OR content % $2)
        AND ($3::text IS NULL OR folder_path = $3)
      ORDER BY similarity(title, $2) + similarity(content, $2) DESC
      LIMIT 50
    )
    SELECT
      COALESCE(v.id, t.id) as id,
      COALESCE(v.title, t.title) as title,
      COALESCE(v.content, t.content) as content,
      (1.0 / (60 + COALESCE(v.rank, 9999))) + (1.0 / (60 + COALESCE(t.rank, 9999))) AS rrf_score
    FROM vector_search v
    FULL OUTER JOIN text_search t ON v.id = t.id
    ORDER BY rrf_score DESC
    LIMIT $4`,
    [embeddingStr, query, folderPath || null, limit]
  );

  return result.rows.map((row) => ({
    title: row.title,
    content: row.content,
    score: row.rrf_score,
  }));
}
