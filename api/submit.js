// Vercel serverless function – receives check‑in data and stores in MongoDB
// Environment: Set MONGODB_URI in Vercel project settings

import { MongoClient, ObjectId } from 'mongodb';
import busboy from 'busboy';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'checkinDB';
const COLLECTION = 'checkins';

let cachedClient = null;

async function connectDb() {
  if (cachedClient) return cachedClient.db(DB_NAME);
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
  await client.connect();
  cachedClient = client;
  return client.db(DB_NAME);
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!MONGODB_URI) throw new Error('MONGODB_URI not set');

    // Parse multipart form data
    const bb = busboy({ headers: req.headers });
    let file = null;
    let fields = {};

    await new Promise((resolve, reject) => {
      bb.on('file', (fieldname, stream, info) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => { file = { buffer: Buffer.concat(chunks), mimetype: info.mimeType }; });
      });

      bb.on('field', (fieldname, val) => { fields[fieldname] = val; });
      bb.on('close', resolve);
      bb.on('error', reject);

      req.pipe(bb);
    });

    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const { facing, firstName, lastName, email, company, latitude, longitude } = fields;
    const db = await connectDb();
    const collection = db.collection(COLLECTION);

    const doc = {
      _id: new ObjectId(),
      timestamp: new Date(),
      facing: facing || 'unknown',
      firstName: firstName || null,
      lastName: lastName || null,
      email: email || null,
      company: company || null,
      location: latitude && longitude ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } : null,
      image: file.buffer,
      mimeType: file.mimetype,
    };

    await collection.insertOne(doc);
    res.status(200).json({ success: true, id: doc._id.toString() });
  } catch (e) {
    console.error('Error handling /submit:', e);
    res.status(500).json({ error: 'Internal server error', details: e.message });
  }
}
