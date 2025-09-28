import crypto from "crypto";
import axios from "axios";

async function main() {
  const url = "https://api.coinstore.com/api/trade/match/accountMatches?symbol=PPOUSDT";
  const apiKey = "ad559bf0b78866a137e4ad5e3fcbcfda";     // string
  const secretKey = "506cebf2251fc7fabbc80a68a72988c7"; // string

  // === Tạo expires ===
  const expires = Date.now();
  const expiresKey = Math.floor(expires / 30000).toString();

  // === Tạo key HMAC từ secretKey và expiresKey ===
  const key = crypto
    .createHmac("sha256", secretKey)
    .update(expiresKey)
    .digest("hex");

  const payload = "symbol=PPOUSDT";

  // === Tạo chữ ký từ key và payload ===
  const signature = crypto
    .createHmac("sha256", Buffer.from(key, "utf8"))
    .update(payload)
    .digest("hex");

  const headers = {
    "X-CS-APIKEY": apiKey,
    "X-CS-SIGN": signature,
    "X-CS-EXPIRES": expires.toString(),
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.get(url, { headers });
    console.log(response.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}

main();
