const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");

const port = process.env.PORT || 3000;

// Firebase Admin Setup
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// Middleware
app.use(express.json());
app.use(cors());

// --- Middlewares ---

const verifyFBToken = async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    try {
        const tokenId = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(tokenId);
        req.decoded_email = decoded.email;
        next();
    } catch (error) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.svjtwrm.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect to MongoDB
        // await client.connect(); // Production-এ এটি রিমুভ করতে পারেন যদি Vercel-এ সমস্যা হয়

        const db = client.db('life-O+-db');
        const usersCollection = db.collection('users');
        const donationRequestsCollection = db.collection('donation-request');
        const fundingCollection = db.collection('fundings'); // For Challenge Task

        // Middleware: Verify Admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded_email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        };

        // Middleware: Check if User is Blocked
        const verifyActive = async (req, res, next) => {
            const email = req.decoded_email;
            const user = await usersCollection.findOne({ email });
            if (user?.status === 'blocked') {
                return res.status(403).send({ message: 'Your account is blocked. You cannot perform this action.' });
            }
            next();
        };

        //  User related APIs
        
        // Get Role
      app.get('/users/:email/role', async (req, res) => {
          const email = req.params.email;
          const user = await usersCollection.findOne({ email });
          res.send({ role: user?.role || 'donor' });
      });

       // Donor role change(Only Admin)
      app.patch('/users/:id/role', verifyFBToken, verifyAdmin, async (req, res) => {
          const id = req.params.id;
          const { role } = req.body;
          const result = await usersCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { role: role } }
          );
          res.send(result);
      });

       // Update Status (Admin only: block/unblock)
        app.patch('/users/:id/status', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: status } }
            );
            res.send(result);
        });
       

      // Get all user by admin
      app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
            const { status } = req.query;
            let query = {};
            if (status) query.status = status;
            const result = await usersCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(result);
      });

        // Registration
    app.post('/users', async (req, res) => {
    const user = req.body;
    user.role = 'donor';
    user.status = 'active';
    user.createdAt = new Date();
    const email = user.email;
    const userExist = await usersCollection.findOne({ email });
    if (userExist) return res.send({ message: 'user exist' });
    const result = await usersCollection.insertOne(user);
    res.send(result);
        });

      // Public Search Donors
      app.get('/donors-search', async (req, res) => {
            const { bloodGroup, district, upazila } = req.query;
            let query = { role: 'donor', status: 'active' };
            if (bloodGroup) query.bloodGroup = bloodGroup;
            if (district) query.district = district;
            if (upazila) query.upazila = upazila;
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });

        // Profile Detail & Update
        app.get('/profile/:email', verifyFBToken, async (req, res) => {
            const result = await usersCollection.findOne({ email: req.params.email });
            res.send(result);
        });

        app.patch('/profile/:email', verifyFBToken, async (req, res) => {
            const email = req.params.email;
            const updatedData = req.body;
            delete updatedData.email; // Ensure email is not editable
            const result = await usersCollection.updateOne(
                { email: email },
                { $set: updatedData }
            );
            res.send(result);
        });

        // Donation request related APIs
        // Create Request (Active users only)
        app.post('/donation-requests', verifyFBToken, verifyActive, async (req, res) => {
            const donationRequest = req.body;
            donationRequest.createdAt = new Date();
            donationRequest.donationStatus = 'pending'; // Default status
            const result = await donationRequestsCollection.insertOne(donationRequest);
            res.send(result);
        });

        // My Requests (Donor)
        app.get('/my-requests', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            const { status } = req.query;
            if (email !== req.decoded_email) return res.status(403).send({ message: 'forbidden' });
            
            let query = { requesterEmail: email };
            if (status) query.donationStatus = status;

            const result = await donationRequestsCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // All Requests (Admin & Volunteer)
        app.get('/all-blood-donation-requests', verifyFBToken, async (req, res) => {
            const { status } = req.query;
            let query = {};
            if (status) query.donationStatus = status;
            const result = await donationRequestsCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        
      
      
      
      
      
      
      

        // Delete Request
        app.delete('/donation-requests/:id', verifyFBToken, async (req, res) => {
            const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });


      // funding related APIs
       


        
        console.log("Database connected successfully!");
    } finally {
        
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Life O+ Server is running');
});

app.listen(port, () => {
    console.log(`Life O+ app listening on port ${port}`);
});