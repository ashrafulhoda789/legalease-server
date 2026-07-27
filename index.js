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
        const commentCollection = db.collection('comments');

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

        // GET: Fetch all hiring requests for a specific lawyer
        app.get('/api/lawyer/hiring-requests', async (req, res) => {
            try {
                const { lawyerId, email } = req.query;

                if (!lawyerId && !email) {
                    return res.status(400).send({
                        success: false,
                        message: 'Lawyer ID or Email is required'
                    });
                }

                let possibleLawyerIds = [];

                if (lawyerId) {
                    possibleLawyerIds.push(lawyerId.toString());
                }

                if (email) {
                    const user = await userCollection.findOne({ email });

                    if (user) {
                        possibleLawyerIds.push(user._id.toString());

                        const profile = await lawyerProfileCollection.findOne({
                            $or: [
                                { userId: user._id },
                                { userId: user._id.toString() },
                                { userId: new ObjectId(user._id) }
                            ]
                        });

                        if (profile) {
                            possibleLawyerIds.push(profile._id.toString());
                        }
                    }
                }

                const query = {
                    $or: [
                        { lawyerId: { $in: possibleLawyerIds } },
                        { lawyerEmail: email } 
                    ]
                };

                const requests = await hiringCollection.find(query).sort({ createdAt: -1 }).toArray();

                res.send({
                    success: true,
                    data: requests
                });

            } catch (error) {
                console.error('Error fetching lawyer hiring requests:', error);
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // PATCH: Accept or Reject a hiring request status
        app.patch('/api/lawyer/hiring-requests/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const { status } = req.body; // status: 'accepted' or 'rejected'

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: 'Invalid Request ID' });
                }

                if (!['accepted', 'rejected'].includes(status)) {
                    return res.status(400).send({ success: false, message: 'Invalid status value. Must be accepted or rejected' });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        status: status,
                        updatedAt: new Date()
                    }
                };

                const result = await hiringCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: 'Hiring request not found' });
                }

                res.send({
                    success: true,
                    message: `Hiring request has been ${status} successfully`,
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

        // GET: Check if a specific user hired a specific lawyer
        app.get('/api/check-hiring', async (req, res) => {
            try {
                const { email, lawyerId } = req.query;

                if (!email || !lawyerId) {
                    return res.status(400).send({
                        isHired: false,
                        message: 'Email and Lawyer ID are required'
                    });
                }

                const query = {
                    userEmail: email,
                    lawyerId: lawyerId
                };

                const existingHire = await hiringCollection.findOne(query);

                if (existingHire) {
                    return res.send({ isHired: true, hireData: existingHire });
                } else {
                    return res.send({ isHired: false });
                }
            } catch (error) {
                res.status(500).send({ isHired: false, message: error.message });
            }
        });

        //  all comments made by a specific user
        app.get('/api/comments/user', async (req, res) => {
            try {
                const userEmail = req.query.email;

                if (!userEmail) {
                    return res.status(400).send({ success: false, message: 'User email is required' });
                }

                const query = { userEmail: userEmail };
                const comments = await commentCollection.find(query).sort({ createdAt: -1 }).toArray();

                res.send({
                    success: true,
                    data: comments
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // GET: All comments for a specific lawyer
        app.get('/api/comments/lawyer/:lawyerId', async (req, res) => {
            try {
                const lawyerId = req.params.lawyerId;
                const query = { lawyerId: lawyerId };

                const comments = await commentCollection.find(query).sort({ createdAt: -1 }).toArray();

                res.send({
                    success: true,
                    data: comments
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        // POST: Add a new comment/review for a lawyer
        app.post('/api/comments', async (req, res) => {
            try {
                const { userEmail, userName, userPhoto, lawyerId, commentText, rating } = req.body;

                if (!userEmail || !lawyerId || !commentText) {
                    return res.status(400).send({
                        success: false,
                        message: 'Required fields are missing'
                    });
                }

                const newComment = {
                    userEmail,
                    userName: userName || 'Anonymous',
                    userPhoto: userPhoto || '',
                    lawyerId,
                    commentText,
                    rating: Number(rating) || 5,
                    createdAt: new Date()
                };

                const result = await commentCollection.insertOne(newComment);

                res.status(201).send({
                    success: true,
                    message: 'Comment added successfully!',
                    insertedId: result.insertedId
                });
            } catch (error) {
                res.status(500).send({ success: false, message: error.message });
            }
        });

        app.patch('/api/comments/:id', async (req, res) => {

            const id = req.params.id;
            const { commentText, rating } = req.body;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ success: false, message: 'Invalid Comment ID' });
            }

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    commentText: commentText,
                    rating: Number(rating) || 5,
                    updatedAt: new Date()
                }
            };

            const result = await commentCollection.updateOne(filter, updateDoc);

            if (result.matchedCount === 0) {
                return res.status(404).send({ success: false, message: 'Comment not found' });
            }

            const updatedComment = await commentCollection.findOne(filter);

            res.send({
                success: true,
                message: 'Comment updated successfully',
                data: updatedComment
            });

        });

        app.delete('/api/comments/:id', async (req, res) => {

            const id = req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ success: false, message: 'Invalid Comment ID' });
            }

            const query = { _id: new ObjectId(id) };
            const result = await commentCollection.deleteOne(query);

            if (result.deletedCount === 0) {
                return res.status(404).send({ success: false, message: 'Comment not found' });
            }

            res.send({
                success: true,
                message: 'Comment deleted successfully'
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