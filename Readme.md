# CoinstoreMM Quick Start

1. Copy `.env.example` to `.env` and fill `CS_API_KEY`, `CS_API_SECRET` (optionally `CS_SYMBOL`).
2. Install deps:
   
   ```bash
   npm install
   ```
3. Run:
   
   ```bash
   node index.js
   ```

Signing per Coinstore docs: HMAC-SHA256 with a derived key from `X-CS-EXPIRES` bucket. See official docs: https://coinstore-openapi.github.io/en/#get-current-orders-v2
