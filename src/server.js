import dotenv from "dotenv"
import connectDB from "./db/db.js"
import {app} from "./app.js"

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