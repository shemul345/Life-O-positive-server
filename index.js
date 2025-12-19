const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");

const port = process.env.PORT || 3000;

// Firebase Admin Setup
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

    // middleware
    app.use(cors({
        origin: [process.env.SITE_DOMAIN],
        credentials: true
    }));
    app.use(express.json()); 


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
        // await client.connect();

        const db = client.db('life-O+-db');
        const usersCollection = db.collection('users');
        const donationRequestsCollection = db.collection('donation-request');
        const fundingCollection = db.collection("fundings");
        const blogsCollection = db.collection('blogs');

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

       // Admin Stats
        app.get('/admin-stats', verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const donorsCount = await usersCollection.countDocuments({ role: 'donor' });
                
                const requestsCount = await donationRequestsCollection.countDocuments();
                
                const fundingData = await fundingCollection.find().toArray();
                const totalFunding = fundingData.reduce((sum, item) => sum + item.amount, 0);

                res.send({
                    donorsCount,
                    requestsCount,
                    totalFunding
                });
            } catch (error) {
                console.error("Stats Error:", error);
                res.status(500).send({ message: "Error fetching stats" });
            }
        });

        //  User related APIs
        // Get Role
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send({ role: user?.role || 'donor' });
        });

       // Change Role
        app.patch('/users/role/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role: role } }
            );
            res.send(result);
        });

       // Change Status (Block/Unblock)
        app.patch('/users/status/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: status } }
            );
            res.send(result);
        });
       

      // Get all users with Pagination and Filter (Only Admin)
        app.get('/users', verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 0;
                const size = parseInt(req.query.size) || 15;
                const status = req.query.status;

                let query = {};
                if (status && status !== 'all') {
                    query.status = status;
                }

                const result = await usersCollection.find(query)
                    .sort({ createdAt: -1 })
                    .skip(page * size)
                    .limit(size)
                    .toArray();

                const count = await usersCollection.countDocuments(query);

                res.send({ result, count });
            } catch (error) {
                res.status(500).send({ message: "Error fetching users" });
            }
        });

        // Registration
        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'donor';
            user.status = 'active';
            user.createdAt = new Date();
            const userExist = await usersCollection.findOne({ email: user.email });
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
            delete updatedData.email;
            const result = await usersCollection.updateOne(
                { email: email },
                { $set: updatedData }
            );
            res.send(result);
        });
      
      // Delete User
        app.delete('/users/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });
            

        // Donation request related APIs
        // Donations Requests
        app.get('/donation-requests/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await donationRequestsCollection.findOne(query);
        res.send(result);
        });
            
        // My 3 recent donation requests
        app.get('/recent-requests/:email', async (req, res) => {
            const email = req.params.email;
            const query = { requesterEmail: email };
            const result = await donationRequestsCollection
            .find(query)
            .sort({ createdAt: -1 })
            .limit(3)
            .toArray();
            res.send(result);
        });
            
        // Donation request
        app.post('/donation-requests', verifyFBToken, verifyActive, async (req, res) => {
            const donationRequest = req.body;
            donationRequest.createdAt = new Date();
            donationRequest.donationStatus = 'pending';
            const result = await donationRequestsCollection.insertOne(donationRequest);
            res.send(result);
        });

        // My Requests (Donor/Requester)
            app.get('/donation-requests', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            
            if (email !== req.decoded_email) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            let query = { requesterEmail: email };
            const result = await donationRequestsCollection.find(query).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // All Requests
       app.get('/all-blood-donation-requests',verifyActive,verifyFBToken, async (req, res) => {
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 15;
        const statusFilter = req.query.status;

        let query = {};
        if (statusFilter && statusFilter !== 'all') {
            query = {
                $or: [
                    { status: statusFilter },
                    { donationStatus: statusFilter }
                ]
            };
        }

    const result = await donationRequestsCollection.find(query)
        .sort({ createdAt: -1 }) 
        .skip(page * size)
        .limit(size)
        .toArray();

    const count = await donationRequestsCollection.countDocuments(query);
    res.send({ result, count });
        });
      
        // Public Pending Requests
        app.get('/pending-requests', async (req, res) => {
            const result = await donationRequestsCollection.find({ donationStatus: 'pending' }).toArray();
            res.send(result);
        });
      
       // Accept Donation (Update to Inprogress)
        app.patch('/donation-requests/accept/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const { donorName, donorEmail } = req.body;
            const result = await donationRequestsCollection.updateOne(
                { _id: new ObjectId(id) },
                { 
                    $set: { 
                        donationStatus: 'inprogress', 
                        donorName, 
                        donorEmail 
                    } 
                }
            );
            res.send(result);
        });

     // Update Donation Status (Done / Canceled)
        app.patch('/donation-requests/status/:id', verifyFBToken, async (req, res) => {
        const id = req.params.id;
        const { status, donorName, donorEmail } = req.body;
        const query = { _id: new ObjectId(id) };
        
        const updateDoc = {
            $set: { 
                status: status,
                donorName: donorName || null,
                donorEmail: donorEmail || null
            }
        };
        
        const result = await donationRequestsCollection.updateOne(query, updateDoc);
        res.send(result);
        });

        // Delete Request
        app.delete('/donation-requests/:id', verifyFBToken, async (req, res) => {
            const result = await donationRequestsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });

        // Blog related APIs
        // Post blogs
        app.post('/blogs', async (req, res) => {
        const blog = req.body;
        const result = await blogsCollection.insertOne(blog);
        res.send(result);
        });

        // Get blogs 
        app.get('/blogs', async (req, res) => {
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 10;
        const status = req.query.status;

        let query = {};
        if (status && status !== 'all') {
            query = { status: status };
        }

        const result = await blogsCollection.find(query)
            .sort({ _id: -1 })
            .skip(page * size)
            .limit(size)
            .toArray();

        const count = await blogsCollection.countDocuments(query);
        res.send({ result, count });
        });

        // blog update
        app.patch('/blogs/status/:id', async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: { status: status },
        };
        const result = await blogsCollection.updateOne(filter, updateDoc);
        res.send(result);
        });

        // blog delete
        app.delete('/blogs/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await blogsCollection.deleteOne(query);
        res.send(result);
        });

        // blog view
        app.get('/blogs/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await blogsCollection.findOne(query);
        res.send(result);
        });

    // Funding Related APIs
    // Create Checkout Session
    app.post('/create-funding-checkout', async (req, res) => {
    try {
        const { amount, donorName, donorEmail } = req.body;
        
        if (!amount) {
            return res.status(400).send({ error: "Amount is required" });
        }

        const unitAmount = Math.round(parseFloat(amount) * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        unit_amount: unitAmount,
                        product_data: {
                            name: `Voluntary Funding - LifeO+`,
                        }
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            metadata: { donorName: donorName || 'Anonymous' },
            customer_email: donorEmail,
            success_url: `${process.env.SITE_DOMAIN}/funding-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.SITE_DOMAIN}/funding-cancelled`,
        });

        res.send({ url: session.url });
    } catch (error) {
        // এই ক্যাচ ব্লক সার্ভার ক্র্যাশ হতে দিবে না, বরং কনসোলে এরর দেখাবে
        console.error("CRASH PREVENTED. Stripe Error:", error.message);
        res.status(500).send({ error: error.message });
    }
    });

    // Funding Success Handler
    app.patch('/funding-success', async (req, res) => {
        try {
            const sessionId = req.query.session_id;
            
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            const transactionId = session.payment_intent;

            const paymentExist = await fundingCollection.findOne({ transactionId });
            if (paymentExist) {
                return res.send({ 
                    success: true, 
                    transactionId, 
                    message: 'Payment already recorded' 
                });
            }

            if (session.payment_status === 'paid') {
                const fundingHistory = {
                    amount: session.amount_total / 100, // Convert cents to dollars
                    currency: session.currency,
                    donorEmail: session.customer_email,
                    donorName: session.metadata.donorName,
                    transactionId: transactionId,
                    paidAt: new Date(),
                    status: 'completed',
                    paymentType: 'voluntary_funding'
                };

                // Insert into your funding collection
                const result = await fundingCollection.insertOne(fundingHistory);
                
                res.send({ 
                    success: true, 
                    transactionId, 
                    info: result 
                });
            } else {
                res.status(400).send({ success: false, message: 'Payment not completed' });
            }
        } catch (error) {
            console.error("Success Handler Error:", error.message);
            res.status(500).send({ error: "Internal Server Error during payment verification" });
        }
    });

    // Get All Funding
    app.get('/all-fundings', async (req, res) => {
        const result = await fundingCollection.find().sort({ paidAt: -1 }).toArray();
        res.send(result);
    });

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