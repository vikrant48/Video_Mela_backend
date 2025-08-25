import dotenv from "dotenv"
import connectDB from "./src/db/db.js"
import {app} from "./src/app.js"
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import process from 'process'

// Ensure we're in the correct directory
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
process.chdir(__dirname)

dotenv.config({
    path: './.env'
})

connectDB()
.then(()=>{
    app.listen(process.env.PORT || 8000)
    console.log(`server is listing on port : ${process.env.PORT}`)
})
.catch((error)=>{
    console.error("Connection failed" , error)
})