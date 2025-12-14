const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion, } = require('mongodb');
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
