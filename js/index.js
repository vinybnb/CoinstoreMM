import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ENV config
const BASE_URL = process.env.CS_BASE_URL || 'https://api.coinstore.com/api';
const API_KEY = process.env.CS_API_KEY || '';
const API_SECRET = process.env.CS_API_SECRET || '';

if (!API_KEY || !API_SECRET) {
  console.warn("⚠️ Warning: CS_API_KEY or CS_API_SECRET is missing in environment variables");
}

// Utility: tạo các header ký số đúng theo tài liệu Coinstore
function createSignedHeaders({ queryString = '', body = '' }) {
  // queryString: ví dụ "symbol=BTCUSDT&size=10" (không có dấu ?)
  // body: nếu POST, body JSON stringify, nếu không có body thì là "".

  const expires = Date.now();  // ms timestamp
  const timeBucket = Math.floor(expires / 30000).toString();

  // Step1: HMAC_SHA256(secretKey, timeBucket)
  const hmac1 = crypto.createHmac('sha256', API_SECRET);
  hmac1.update(timeBucket);
  const key = hmac1.digest('hex');

  // Step2: payload = queryString + body (concatenate, không sort)
  const payload = `${queryString}${body}`;

  // Step3: HMAC_SHA256(key, payload)
  const hmac2 = crypto.createHmac('sha256', key);
  hmac2.update(payload);
  const sign = hmac2.digest('hex');

  const headers = {
    'X-CS-APIKEY': API_KEY,
    'X-CS-EXPIRES': expires.toString(),
    'X-CS-SIGN': sign,
    'Content-Type': 'application/json'
  };

  return headers;
}

// API call wrapper
async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();  // "symbol=BTCUSDT&limit=10"
  const fullPath = qs ? `${path}?${qs}` : path;
  const url = `${BASE_URL}${fullPath}`;

  const headers = createSignedHeaders({ queryString: qs, body: '' });
  const resp = await axios.get(url, { headers, timeout: 10000 });
  return resp.data;
}

async function apiPost(path, bodyObj = {}, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const fullPath = qs ? `${path}?${qs}` : path;
  const url = `${BASE_URL}${fullPath}`;

  const bodyStr = JSON.stringify(bodyObj);
  const headers = createSignedHeaders({ queryString: qs, body: bodyStr });
  const resp = await axios.post(url, bodyObj, { headers, timeout: 10000 });
  return resp.data;
}

async function getBalances() {
  const path = '/spot/accountList';
  const url = `${BASE_URL}${path}`;
  const bodyStr = JSON.stringify({}); // body rỗng nhưng vẫn stringify

  const headers = createSignedHeaders({ queryString: '', body: bodyStr });
  const resp = await axios.post(url, {}, { headers, timeout: 10000 });
  return resp.data;
}

async function getCurrentOrders(params = {}) {
  return await apiGet('/v2/trade/order/active', params);
}

async function getLatestTrades(params = {}) {
  return await apiGet('/trade/match/accountMatches', params);
}

// Ví dụ endpoint POST tạo order (theo spec “Order Related” trong doc)
async function placeOrder(orderParams) {
  // orderParams là 1 object chứa các field API yêu cầu, ví dụ: { symbol, side, ordType, ordPrice, ordQty, timestamp }
  return await apiPost('/trade/order/place', orderParams);
}

async function cancelOrder(cancelParams) {
  return await apiPost('/trade/order/cancel', cancelParams);
}

// Express routes
app.get('/', (req, res) => {
  res.json({
    message: 'Coinstore API Proxy',
    version: '1.0.0',
    endpoints: [
      '/api/balances',
      '/api/orders?symbol=...',
      '/api/trades?symbol=...',
      '/api/order/place'
    ]
  });
});

// http://localhost:3000/api/balances
app.get('/api/balances', async (req, res) => {
  try {
    const data = await getBalances();
    res.json(data);
  } catch (err) {
    console.error('Error /api/balances:', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

// http://localhost:3000/api/orders?symbol=PPOUSDT
app.get('/api/orders', async (req, res) => {
  const params = {};
  if (req.query.symbol) params.symbol = req.query.symbol;
  try {
    const data = await getCurrentOrders(params);
    res.json(data);
  } catch (err) {
    console.error('Error /api/orders:', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

// http://localhost:3000/api/trades?symbol=PPOUSDT
app.get('/api/trades', async (req, res) => {
  const params = {};
  if (req.query.symbol) params.symbol = req.query.symbol;
  if (req.query.limit) params.limit = req.query.limit;
  try {
    const data = await getLatestTrades(params);
    res.json(data);
  } catch (err) {
    console.error('Error /api/trades:', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});
/*
{
    "baseCurrency": "PPO",
    "quoteCurrency": "USDT",
    "symbol": "PPOUSDT",
    "side": "SELL",
    "ordPrice": "0.058",
    "ordQty": "20",
    "ordType": "LIMIT",
    "timeInForce": "GTC",
    "clOrdId": "test-order-123",
    "timestamp": 1759075345680
  }
*/
app.post('/api/order/place', async (req, res) => {
  // body chứa các tham số tạo order
  try {
    const orderParams = req.body;
    const data = await placeOrder(orderParams);
    res.json(data);
  } catch (err) {
    console.error('Error /api/order/place:', err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

/*
{
  "symbol": "PPOUSDT",
  "ordId": 1844524655575492
}
*/
app.post("/api/order/cancel", async (req, res) => {
  try {
    const data = await cancelOrder(req.body);
    res.json(data);
  } catch (err) {
    console.error("Error /api/order/cancel:", err?.response?.data || err.message);
    res.status(500).json({ error: err?.response?.data || err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
});
