const { createClient } = require("redis");

let client = null;

async function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    client.on("error", (err) => console.error("Redis error:", err));
    await client.connect();
  }
  return client;
}

module.exports = { getClient };