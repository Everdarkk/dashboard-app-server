import express from 'express';

const app = express();
const PORT = 8000;

// Middleware
app.use(express.json());

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
