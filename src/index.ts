import "dotenv/config";
import express from 'express';
import subjectsRouter from './routes/subjects'
import usersRouter from './routes/users'
import classesRouter from './routes/classes'
import cors from 'cors'
import { applySecurityPostBody, applySecurityPreBody, createRateLimiter } from './middleware/security'
import {toNodeHandler} from 'better-auth/node'
import { auth } from './lib/auth'

const app = express()
const PORT = 8000;

// CORS
if (!process.env.FRONTEND_URL) {
  throw new Error("FRONTEND_URL is not set up in .env file")
}

app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}))


// Middleware
applySecurityPreBody(app)

app.use('/api/subjects', createRateLimiter({ keyPrefix: 'subjects' }))
app.use('/api/users', createRateLimiter({ keyPrefix: 'users' }))
app.use('/api/classes', createRateLimiter({ keyPrefix: 'classes' }))


app.use(express.json())
app.use(express.urlencoded({ extended: true }))

applySecurityPostBody(app)

// ROUTER
app.use('/api/subjects', subjectsRouter)
app.use('/api/users', usersRouter)
app.use('/api/classes', classesRouter)


// Better-auth
app.all('/api/auth/*splat', toNodeHandler(auth))

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Dashboard API!' })
});

// Start server
const server = app.listen(PORT, () => {

server.on('error', (error) => {
  console.error('Error starting server:', error)
  process.exit(1)
});
  console.log(`Server is running at http://localhost:${PORT}`)
});
