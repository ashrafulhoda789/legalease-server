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
        const paymentsCollection = db.collection('payment');
        const sessionColletion = db.collection('session')

        // verify Token
        const verifyToken = async (req, res, next) => {

            const authHeader = req.headers?.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const token = authHeader.split(' ')[1]
            // console.log(token);

            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const query = { token: token }
            const session = await sessionColletion.findOne(query)
            // console.log(session);

            if (!session) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const userId = session.userId

            const userQuery = {
                _id: userId
            }

            const user = await userCollection.findOne(userQuery)
            

            if (!user) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            // set data in the req object
            req.user = user;

            next();
        }

        // must be used after verify token middleware
        const verifyUser = async (req, res, next) => {

            if (req.user?.role !== 'user') {
                return res.status(403).send({ message: 'Forbidden access' })
            }

            next();
        }

        // must be used after verify token middleware
        const verifyAdmin = async (req, res, next) => {
            if (req.user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden access' })
            }

            next();
        }

        // must be used after verify token middleware
        const verifyLawyer = async (req, res, next) => {
            if (req.user?.role !== 'lawyer') {
                return res.status(403).send({ message: 'Forbidden access' })
            }

            next();
        }

        // user api
        app.get('/api/users', async (req, res) => {

            const users = await userCollection.find(
                {},
                { projection: { password: 0 } }
            ).toArray();

            res.send({ success: true, data: users });

        });

        app.patch('/api/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const { role } = req.body;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ success: false, message: 'Invalid User ID' });
            }

            if (!role) {
                return res.status(400).send({ success: false, message: 'Role is required' });
            }

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: role,
                    updatedAt: new Date()
                }
            };

            const result = await userCollection.updateOne(filter, updateDoc);

            if (result.matchedCount === 0) {
                return res.status(404).send({ success: false, message: 'User not found' });
            }

            res.send({
                success: true,
                message: `User role updated to ${role} successfully`
            });

        });

        app.delete('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {

            const id = req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).send({ success: false, message: 'Invalid User ID' });
            }

            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);

            if (result.deletedCount === 0) {
                return res.status(404).send({ success: false, message: 'User not found' });
            }

            await lawyerProfileCollection.deleteOne({ userId: new ObjectId(id) });

            res.send({
                success: true,
                message: 'User deleted successfully'
            });

        });

        app.get('/api/lawyers', async (req, res) => {

            const { search, category, page = 1, limit = 8 } = req.query;

            const conditions = [];

            if (search) {
                conditions.push({
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { 'user.name': { $regex: search, $options: 'i' } },
                        { specialization: { $regex: search, $options: 'i' } },
                        { 'profile.specialization': { $regex: search, $options: 'i' } }
                    ]
                });
            }

            if (category && category !== 'All') {
                let categoryRegex = category;

                if (category.toLowerCase().includes('corporate')) {
                    categoryRegex = 'Corporate|Licensed Attorney';
                } else if (category.toLowerCase().includes('criminal')) {
                    categoryRegex = 'Criminal';
                } else if (category.toLowerCase().includes('family')) {
                    categoryRegex = 'Family|Property';
                } else if (category.toLowerCase().includes('cyber') || category.toLowerCase().includes('ip')) {
                    categoryRegex = 'Cyber|IP';
                }

                conditions.push({
                    $or: [
                        { specialization: { $regex: categoryRegex, $options: 'i' } },
                        { 'profile.specialization': { $regex: categoryRegex, $options: 'i' } }
                    ]
                });
            }

            const query = conditions.length > 0 ? { $and: conditions } : {};

            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 8;
            const skip = (pageNum - 1) * limitNum;

            const total = await lawyerProfileCollection.countDocuments(query);
            const lawyers = await lawyerProfileCollection
                .find(query)
                .skip(skip)
                .limit(limitNum)
                .toArray();

            res.send({
                total,
                lawyers,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum) || 1
            });

        });

        app.get('/api/lawyers/top-hired', async (req, res) => {

            const topLawyers = await hiringCollection.aggregate([

                {
                    $group: {
                        _id: "$lawyerId",
                        totalHires: { $sum: 1 },
                        lawyerName: { $first: "$lawyerName" },
                        lawyerSpecialization: { $first: "$lawyerSpecialization" }
                    }
                },

                { $match: { _id: { $ne: null, $exists: true } } },

                { $sort: { totalHires: -1 } },
                { $limit: 3 },

                {
                    $lookup: {
                        from: "lawyer_profiles",
                        let: { hiringLawyerId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {

                                        $eq: [{ $toString: "$_id" }, "$$hiringLawyerId"]
                                    }
                                }
                            }
                        ],
                        as: "profileDetails"
                    }
                },

                {
                    $unwind: {
                        path: "$profileDetails",
                        preserveNullAndEmptyArrays: true
                    }
                }
            ]).toArray();

            const formattedTopLawyers = topLawyers.map((item, index) => {
                const profile = item.profileDetails || {};

                const lawyerImg = profile?.photoUrl || profile?.image || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400';

                return {
                    _id: profile._id || item._id,
                    name: profile.name || item.lawyerName || 'Advocate',
                    specialization: profile.specialization || item.lawyerSpecialization || 'Licensed Attorney',
                    image: lawyerImg,
                    photoUrl: lawyerImg,
                    experienceYears: profile.experienceYears || 0,
                    consultationFee: profile.consultationFee || 0,
                    contactNumber: profile.contactNumber || '',
                    totalHires: item.totalHires,
                    rank: index + 1
                };
            });

            res.send(formattedTopLawyers);

        });

        // Get lawyer count by category
        app.get('/api/lawyers/category-counts', async (req, res) => {

            const categoryCounts = await lawyerProfileCollection.aggregate([
                {
                    $group: {
                        _id: "$specialization",
                        count: { $sum: 1 }
                    }
                }
            ]).toArray();

            const countsMap = {};
            categoryCounts.forEach(item => {
                if (item._id) {
                    countsMap[item._id.trim()] = item.count;
                }
            });

            res.send(countsMap);

        });

        app.get('/api/lawyers/:id', async (req, res) => {
            const id = req.params.id;

            const query = { _id: new ObjectId(id) };
            const result = await lawyerProfileCollection.findOne(query);

            res.send(result);
        })

        // lawyer manage-legal section api
        app.get('/api/lawyer-profile/:email', async (req, res) => {

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

        });

        app.patch('/api/lawyer-profile', verifyToken, verifyLawyer, async (req, res) => {

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

        });


        // GET: Fetch all hiring requests for a specific lawyer
        app.get('/api/lawyer/hiring-requests',  async (req, res) => {

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


        });

        // PATCH: Accept or Reject a hiring request status
        app.patch('/api/lawyer/hiring-requests/:id', verifyToken, verifyLawyer,  async (req, res) => {

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


        });

        // Get hiring history for a specific logged-in user
        app.get('/api/hiring-history',  async (req, res) => {

            const userEmail = req.query.email;

            if (!userEmail) {
                return res.status(400).send({ message: 'User email is required' });
            }

            const query = { userEmail: userEmail };

            const history = await hiringCollection.find(query).sort({ createdAt: -1 }).toArray();

            res.send(history);

        });

        // POST: Submit a hiring request
        app.post('/api/hire-lawyer', verifyToken, verifyAdmin, verifyUser, async (req, res) => {

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
                paymentStatus: 'unpaid',
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

            const { email, lawyerId } = req.query;

            if (!email || !lawyerId) {
                return res.status(400).send({
                    isHired: false,
                    message: 'Email and Lawyer ID are required'
                });
            }

            let targetLawyerIds = [lawyerId];

            if (ObjectId.isValid(lawyerId)) {
                const profile = await lawyerProfileCollection.findOne({ _id: new ObjectId(lawyerId) });
                if (profile && profile.userId) {
                    targetLawyerIds.push(profile.userId.toString());
                }
            }

            const existingHire = await hiringCollection.findOne({
                userEmail: email,
                lawyerId: { $in: targetLawyerIds },
                status: 'accepted'
            });

            if (existingHire) {
                return res.send({ isHired: true, hireData: existingHire });
            } else {
                return res.send({ isHired: false });
            }

        });

        //  all comments made by a specific user

        app.get('/api/comments/user', async (req, res) => {

            const { email } = req.query;

            const comments = await commentCollection.aggregate([
                { $match: { userEmail: email } },
                {
                    $addFields: {
                        lawyerObjectId: { $toObjectId: "$lawyerId" }
                    }
                },
                {
                    $lookup: {
                        from: "lawyer_profiles",
                        localField: "lawyerObjectId",
                        foreignField: "_id",
                        as: "lawyerDetails"
                    }
                },
                {
                    $unwind: {
                        path: "$lawyerDetails",
                        preserveNullAndEmptyArrays: true
                    }
                }
            ]).toArray();

            // console.log('comments data',comments);

            return res.send({ success: true, data: comments });

        });

        // GET: All comments for a specific lawyer
        app.get('/api/comments/lawyer/:lawyerId', async (req, res) => {

            const lawyerId = req.params.lawyerId;
            const query = { lawyerId: lawyerId };

            const comments = await commentCollection.find(query).sort({ createdAt: -1 }).toArray();
            // console.log(comments);
            res.send({
                success: true,
                data: comments
            });

        });

        // POST: Add a new comment/review for a lawyer
        app.post('/api/comments', async (req, res) => {

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

        });

        app.patch('/api/comments/:id',   async (req, res) => {

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


        // 1.Save Payment History after Stripe Payment
        app.post('/api/payments', async (req, res) => {


            const { userEmail, userName, lawyerEmail, lawyerName, price, transactionId, hiringId } = req.body;

            // Validation
            if (!userEmail || !transactionId || !price) {
                return res.status(400).send({
                    success: false,
                    message: 'User Email, Transaction ID, and Price are required!'
                });
            }

            const newPaymentHistory = {
                userEmail,
                userName: userName || 'N/A',
                lawyerEmail: lawyerEmail || 'N/A',
                lawyerName: lawyerName || 'N/A',
                price: Number(price),
                transactionId,
                hiringId: hiringId || null,
                status: 'succeeded',
                createdAt: new Date()
            };

            const result = await paymentsCollection.insertOne(newPaymentHistory);

            if (hiringId) {
                await hiringCollection.updateOne(
                    { _id: new ObjectId(hiringId) },
                    {
                        $set: {
                            paymentStatus: 'paid',
                            updatedAt: new Date()
                        }
                    }
                );
            }

            res.status(201).send({
                success: true,
                message: 'Payment history saved and hiring request updated successfully!',
                insertedId: result.insertedId
            });

        });


        // 2. GET: Get All Payments 
        app.get('/api/payments', async (req, res) => {

            const allPayments = await paymentsCollection
                .find()
                .sort({ createdAt: -1 })
                .toArray();

            res.send({
                success: true,
                data: allPayments
            });

        });




        // await client.db("admin").command({ ping: 1 });
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