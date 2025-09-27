import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = process.env.CS_BASE_URL || 'https://api.coinstore.com/api';
const API_KEY = process.env.CS_API_KEY || '';
const API_SECRET = process.env.CS_API_SECRET || '';

function computeSignHeaders({ method, queryString = '', body = '' }) {
  if (!API_KEY || !API_SECRET) throw new Error('Missing CS_API_KEY/CS_API_SECRET');
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

async function getCurrentOrdersV2(params = {}) {
  const qs = new URLSearchParams(params).toString(); // no leading '?'
  const path = '/trade/order/current/v2';
  const pathWithQuery = qs ? `?${qs}` : '';
  const url = `${BASE_URL}${path}${pathWithQuery}`;
  const headers = computeSignHeaders({ method: 'GET', queryString: qs, body: '' });
  const { data } = await axios.get(url, { headers, timeout: 10000 });
  return data;
}

async function getLatestTrades(params = {}) {
  // If Coinstore provides a specific endpoint for user's latest trade, replace path here
  const qs = new URLSearchParams(params).toString();
  const path = '/trade/order/trades/latest';
  const pathWithQuery = qs ? `?${qs}` : '';
  const url = `${BASE_URL}${path}${pathWithQuery}`;
  const headers = computeSignHeaders({ method: 'GET', queryString: qs, body: '' });
  const { data } = await axios.get(url, { headers, timeout: 10000 });
  return data;
}

async function getBalances() {
  const path = '/spot/accountList';
  const url = `${BASE_URL}${path}`;
  const headers = computeSignHeaders({ method: 'GET', queryString: '', body: '' });
  const { data } = await axios.get(url, { headers, timeout: 10000 });
  console.log('data', data);
  return data;
}

async function main() {
  // Example: fetch current orders V2 for a symbol
  const symbol = process.env.CS_SYMBOL || '';
  try {
    // Sanity check auth/base URL
    const bal = await getBalances();
    console.log('[balance ok]', JSON.stringify(bal)?.slice(0, 200) + '...');

    const res = await getCurrentOrdersV2(symbol ? { symbol } : {});
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    if (e?.response?.status === 404) {
      // Try non-v2 endpoint as fallback
      try {
        const qs = new URLSearchParams(symbol ? { symbol } : {}).toString();
        const path = '/trade/order/current';
        const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
        const headers = computeSignHeaders({ method: 'GET', queryString: qs, body: '' });
        const { data } = await axios.get(url, { headers, timeout: 10000 });
        console.log(JSON.stringify(data, null, 2));
        return;
      } catch (e2) {
        console.error('Fallback current orders error:', e2?.response?.data || e2.message);
        process.exitCode = 1;
        return;
      }
    }
    const tried = {
      baseUrl: BASE_URL,
      endpointsTried: ['/spot/accountList', '/trade/order/current/v2', '/trade/order/current']
    };
    console.error('Error fetching current orders V2:', e?.response?.data || e.message, tried);
    process.exitCode = 1;
  }
}

main();


