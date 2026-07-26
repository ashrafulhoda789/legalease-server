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
        const userCollection = db.collection('user')

        app.get('/api/lawyers', async(req, res)=>{
            const query = { role: 'lawyer' };
            const result = await userCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/api/lawyers/:id', async(req, res)=>{
            const id = req.params.id;

            const query = {
                _id: new ObjectId(id), 
                role: 'lawyer'
            }

            const result = await userCollection.findOne(query);

            res.send(result);
        })


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