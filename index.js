const express = require('express');
const dotenv = require('dotenv')
const cors = require('cors')
dotenv.config();
const { MongoClient, ServerApiVersion } = require('mongodb');

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

        app.get('/api/user', async(req, res)=>{
            const result = await userCollection.find().toArray();
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