const express = require('express');
const dotenv = require('dotenv')
const cors = require('cors')
dotenv.config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express()
const port = process.env.PORT
const uri = process.env.MONGO_DB_URI;

app.use(cors())
app.use(express.json())

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

        const db = client.db('legal-ease-db')
        const userCollection = db.collection('user');
        const hiringCollection = db.collection('hiring-request');
        const lawyerProfileCollection = db.collection('lawyer_profiles');

        app.get('/api/lawyers', async (req, res) => {
            const result = await lawyerProfileCollection.find().toArray();
            res.send(result);
        })

        app.get('/api/lawyers/:id', async (req, res) => {
            const id = req.params.id;

            const query = { _id: new ObjectId(id) };
            const result = await lawyerProfileCollection.findOne(query);

            res.send(result);
        })

        // lawyer manage-legal section api
        app.get('/api/lawyer-profile/:email', async (req, res) => {
            try {
                const email = req.params.email;

                const user = await userCollection.findOne(
                    { email: email },
                    { projection: { password: 0 } }
                );

                if (!user) {
                    return res.status(404).send({ success: false, message: 'User not found' });
                }

                const profile = await lawyerProfileCollection.findOne({ userId: new ObjectId(user._id) });

                res.send({
                    success: true,
                    data: {
                        user: {
                            _id: user._id,
                            name: user.name,
                            email: user.email,
                            role: user.role
                        },
                        profile: profile || null
                    }
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        app.patch('/api/lawyer-profile', async (req, res) => {
            try {
                const {
                    email,
                    name,
                    contactNumber,
                    photoUrl,
                    specialization,
                    experienceYears,
                    barCouncilNo,
                    consultationFee,
                    status,
                    chamberAddress,
                    bio,
                    education,
                    awards
                } = req.body;

                if (!email) {
                    return res.status(400).send({ success: false, message: 'Email is required' });
                }

                const user = await userCollection.findOne({ email });
                if (!user) {
                    return res.status(404).send({ success: false, message: 'User not found' });
                }

                if (name && name !== user.name) {
                    await userCollection.updateOne(
                        { email },
                        { $set: { name: name } }
                    );
                }

                const filter = { userId: new ObjectId(user._id) };
                const updateDoc = {
                    $set: {
                        userId: new ObjectId(user._id),
                        name: name || '',
                        contactNumber: contactNumber || '',
                        photoUrl: photoUrl || '',
                        specialization: specialization || '',
                        experienceYears: Number(experienceYears) || 0,
                        barCouncilNo: barCouncilNo || '',
                        consultationFee: Number(consultationFee) || 0,
                        status: status || 'Available',
                        chamberAddress: chamberAddress || '',
                        bio: bio || '',
                        education: education || [],
                        awards: awards || [],
                        updatedAt: new Date()
                    }
                };

                const options = { upsert: true };

                const result = await lawyerProfileCollection.updateOne(filter, updateDoc, options);

                res.send({
                    success: true,
                    message: 'Lawyer profile updated successfully',
                    result
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // Get hiring history for a specific logged-in user
        app.get('/api/hiring-history', async (req, res) => {

            const userEmail = req.query.email;

            if (!userEmail) {
                return res.status(400).send({ message: 'User email is required' });
            }

            const query = { userEmail: userEmail };

            const history = await hiringCollection.find(query).sort({ createdAt: -1 }).toArray();

            res.send(history);

        });

        // POST: Submit a hiring request
        app.post('/api/hire-lawyer', async (req, res) => {

            const hireData = req.body;

            if (!hireData.userEmail || !hireData.lawyerId) {
                return res.status(400).send({ message: 'User Email and Lawyer ID are required' });
            }

            const newHireRequest = {
                userId: hireData.userId,
                userName: hireData.userName,
                userEmail: hireData.userEmail,
                lawyerId: hireData.lawyerId,
                lawyerName: hireData.lawyerName,
                lawyerSpecialization: hireData.specialization,
                consultationFee: hireData.consultationFee,
                status: 'pending',
                hiringDate: new Date().toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }),
                createdAt: new Date()
            };

            const result = await hiringCollection.insertOne(newHireRequest);

            res.status(201).send({
                success: true,
                message: 'Hiring request submitted successfully!',
                insertedId: result.insertedId
            });

        });


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('LegalEase Server!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})