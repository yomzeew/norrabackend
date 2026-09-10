require('dotenv').config();
const express = require('express');
const cors = require('cors');

const whatsappRoutes = require('./routes/whatsapp');
const webhookRoutes = require('./routes/webhooks');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(whatsappRoutes);
app.use(webhookRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Norra backend listening on port ${PORT}`);
});
