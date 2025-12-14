const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId, } = require('mongodb');
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.svjtwrm.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    await client.connect();

    const db = client.db('life-O+-db');
    const donationRequestsCollection = db.collection('donation-request')

    // Donation Request related APIs
    app.get('/donation-requests', async (req, res) => {
      const query = {}
      const { email } = req.query;

      if (email) {
        query.requesterEmail = email;
      }

      const cursor = donationRequestsCollection.find(query).sort({createdAt: -1});
      const result = await cursor.toArray();

      res.send(result)
    })

    app.post('/donation-requests', async (req, res) => {
      const donationRequest = req.body;

      // send request time
      donationRequest.createdAt = new Date();
      const result = await donationRequestsCollection.insertOne(donationRequest);
      
      res.send(result)
    })

    app.delete('/donation-requests/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      
      const result = await donationRequestsCollection.deleteOne(query);
      res.send(result);
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Life O+ is running')
})

app.listen(port, () => {
  console.log(`Life O+ app listening on port ${port}`)
})
