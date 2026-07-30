require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: (process.env.FRONTEND_URLS || 'http://localhost:5173').split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/summary', require('./routes/summary'));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
