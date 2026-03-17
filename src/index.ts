import express from 'express';
import subjectsRouter from './routes/subjects'
import cors from 'cors'

const app = express();
const PORT = 8000;

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}))

// Middleware
app.use(express.json());

// ROUTER
app.use('/api/subjects', subjectsRouter)

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Dashboard API!' });
});

// Start server
const server = app.listen(PORT, () => {

server.on('error', (error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});
  console.log(`Server is running at http://localhost:${PORT}`);
});
