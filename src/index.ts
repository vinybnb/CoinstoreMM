import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Environment variables
const BASE_URL = process.env.CS_BASE_URL || 'https://api.coinstore.com/api';
const API_KEY = process.env.CS_API_KEY || '';
const API_SECRET = process.env.CS_API_SECRET || '';

// Types
interface SignHeaders {
  'X-CS-APIKEY': string;
  'X-CS-EXPIRES': string;
  'X-CS-SIGN': string;
  'Content-Type': string;
}

interface SignParams {
  method: string;
  queryString?: string;
  body?: string;
}

interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// Utility function to compute signature headers
function computeSignHeaders({ method, queryString = '', body = '' }: SignParams): SignHeaders {
  if (!API_KEY || !API_SECRET) {
    throw new Error('Missing CS_API_KEY/CS_API_SECRET');
  }
  
  const expires = Date.now(); // 13-digit ms timestamp
  const timeBucket = Math.floor(expires / 30000).toString();

  const hmac1 = crypto.createHmac('sha256', API_SECRET);
  hmac1.update(timeBucket);
  const key = hmac1.digest('hex');

  // payload is direct concatenation of query and body (no sorting)
  const payload = `${queryString}${body}`;
  const hmac2 = crypto.createHmac('sha256', key);
  hmac2.update(payload);
  const sign = hmac2.digest('hex');

  return {
    'X-CS-APIKEY': API_KEY,
    'X-CS-EXPIRES': String(expires),
    'X-CS-SIGN': sign,
    'Content-Type': 'application/json'
  };
}

// API functions
async function getCurrentOrdersV2(params: Record<string, string> = {}): Promise<ApiResponse> {
  const qs = new URLSearchParams(params).toString(); // no leading '?'
  const path = '/trade/order/current/v2';
  const pathWithQuery = qs ? `?${qs}` : '';
  const url = `${BASE_URL}${path}${pathWithQuery}`;
  const headers = computeSignHeaders({ method: 'GET', queryString: qs, body: '' });
  const response: AxiosResponse<ApiResponse> = await axios.get(url, { headers, timeout: 10000 });
  return response.data;
}

async function getLatestTrades(params: Record<string, string> = {}): Promise<ApiResponse> {
  const qs = new URLSearchParams(params).toString();
  const path = '/trade/order/trades/latest';
  const pathWithQuery = qs ? `?${qs}` : '';
  const url = `${BASE_URL}${path}${pathWithQuery}`;
  const headers = computeSignHeaders({ method: 'GET', queryString: qs, body: '' });
  const response: AxiosResponse<ApiResponse> = await axios.get(url, { headers, timeout: 10000 });
  return response.data;
}

async function getBalances(): Promise<ApiResponse> {
  const path = '/spot/accountList';
  const url = `${BASE_URL}${path}`;
  const headers = computeSignHeaders({ method: 'GET', queryString: '', body: '' });
  const response: AxiosResponse<ApiResponse> = await axios.get(url, { headers, timeout: 10000 });
  return response.data;
}

// Express routes
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'CoinstoreMM API Server', 
    version: '1.0.0',
    endpoints: [
      'GET /api/balances',
      'GET /api/orders',
      'GET /api/trades'
    ]
  });
});

app.get('/api/balances', async (req: Request, res: Response) => {
  try {
    const balances = await getBalances();
    res.json(balances);
  } catch (error: any) {
    console.error('Error fetching balances:', error?.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch balances', 
      message: error?.response?.data || error.message 
    });
  }
});

app.get('/api/orders', async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol as string || process.env.CS_SYMBOL || '';
    const orders = await getCurrentOrdersV2(symbol ? { symbol } : {});
    res.json(orders);
  } catch (error: any) {
    console.error('Error fetching orders:', error?.response?.data || error.message);
    
    // Try fallback endpoint
    try {
      const symbol = req.query.symbol as string || process.env.CS_SYMBOL || '';
      const qs = new URLSearchParams(symbol ? { symbol } : {}).toString();
      const path = '/trade/order/current';
      const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
      const headers = computeSignHeaders({ method: 'GET', queryString: qs, body: '' });
      const response: AxiosResponse<ApiResponse> = await axios.get(url, { headers, timeout: 10000 });
      res.json(response.data);
    } catch (fallbackError: any) {
      res.status(500).json({ 
        error: 'Failed to fetch orders', 
        message: fallbackError?.response?.data || fallbackError.message 
      });
    }
  }
});

app.get('/api/trades', async (req: Request, res: Response) => {
  try {
    const params: Record<string, string> = {};
    if (req.query.symbol) params.symbol = req.query.symbol as string;
    if (req.query.limit) params.limit = req.query.limit as string;
    
    const trades = await getLatestTrades(params);
    res.json(trades);
  } catch (error: any) {
    console.error('Error fetching trades:', error?.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch trades', 
      message: error?.response?.data || error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: error.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 CoinstoreMM API server running on port ${PORT}`);
  console.log(`📊 Available endpoints:`);
  console.log(`   GET  /api/balances - Get account balances`);
  console.log(`   GET  /api/orders   - Get current orders`);
  console.log(`   GET  /api/trades   - Get latest trades`);
  console.log(`   GET  /health       - Health check`);
});

export default app;
