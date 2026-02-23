require('dotenv').config();
const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');
const {
  buildFilter,
  buildProjection,
  buildSort,
  normalizeLimit,
  SUPPORTED_OPERATORS
} = require('./src/queryBuilder');
const { buildQueryFromQuestion } = require('./src/questionParser');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'test';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

async function connect() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

function ensureDb(req, res, next) {
  if (!db) {
    return res.status(503).json({ error: 'Database not connected yet.' });
  }
  next();
}

async function inferFields(collectionName, sampleSize = 200) {
  const docs = await db
    .collection(collectionName)
    .find({}, { projection: { _id: 0 } })
    .limit(sampleSize)
    .toArray();

  const keys = new Set();
  docs.forEach((doc) => collectKeys(doc, '', keys));
  return Array.from(keys).sort();
}

function collectKeys(value, prefix, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  Object.entries(value).forEach(([key, nested]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    keys.add(nextPath);
    collectKeys(nested, nextPath, keys);
  });
}

async function assertCollectionExists(collectionName) {
  const details = await db.listCollections({ name: collectionName }).toArray();
  if (!details.length) {
    throw new Error(`Collection not found: ${collectionName}`);
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, dbConnected: Boolean(db) });
});

app.get('/api/operators', (_req, res) => {
  res.json({ operators: SUPPORTED_OPERATORS });
});

app.get('/api/collections', ensureDb, async (_req, res) => {
  try {
    const collections = await db.listCollections().toArray();
    res.json(collections.map((c) => c.name));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/collections/:name/fields', ensureDb, async (req, res) => {
  try {
    await assertCollectionExists(req.params.name);
    const fields = await inferFields(req.params.name);
    res.json({ collection: req.params.name, fields });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post('/api/query', ensureDb, async (req, res) => {
  try {
    const { collection, filters, projection, sort, limit } = req.body;
    if (!collection) return res.status(400).json({ error: 'collection is required' });

    await assertCollectionExists(collection);
    const allowedFields = await inferFields(collection);

    const mongoFilter = buildFilter(filters || [], { allowedFields });
    const mongoProjection = buildProjection(projection || [], { allowedFields });
    const mongoSort = buildSort(sort || [], { allowedFields });
    const mongoLimit = normalizeLimit(limit);

    const cursor = db
      .collection(collection)
      .find(mongoFilter, { projection: mongoProjection })
      .limit(mongoLimit);

    if (mongoSort) cursor.sort(mongoSort);

    const data = await cursor.toArray();

    res.json({
      query: {
        collection,
        filter: mongoFilter,
        projection: mongoProjection,
        sort: mongoSort,
        limit: mongoLimit
      },
      count: data.length,
      data
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/ask', ensureDb, async (req, res) => {
  try {
    const { collection, question } = req.body;
    if (!collection || !question) {
      return res.status(400).json({ error: 'collection and question are required' });
    }

    await assertCollectionExists(collection);
    const fields = await inferFields(collection);
    const draft = await buildQueryFromQuestion({ question, collection, fields });

    const mongoFilter = buildFilter(draft.filters || [], { allowedFields: fields });
    const mongoProjection = buildProjection(draft.projection || [], { allowedFields: fields });
    const mongoSort = buildSort(draft.sort || [], { allowedFields: fields });
    const mongoLimit = normalizeLimit(draft.limit);

    const cursor = db
      .collection(collection)
      .find(mongoFilter, { projection: mongoProjection })
      .limit(mongoLimit);

    if (mongoSort) cursor.sort(mongoSort);

    const data = await cursor.toArray();

    res.json({
      source: draft.source,
      generated: {
        filters: draft.filters || [],
        projection: draft.projection || [],
        sort: draft.sort || [],
        limit: mongoLimit
      },
      query: {
        collection,
        filter: mongoFilter,
        projection: mongoProjection,
        sort: mongoSort,
        limit: mongoLimit
      },
      count: data.length,
      data
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server started on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect MongoDB:', error.message);
    process.exit(1);
  });
