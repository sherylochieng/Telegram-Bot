const { getClient } = require("../config/redis");

const SESSION_TTL = 600; // 10 minutes

const sessionKey = (chatId, userId) => `telegram:session:${chatId}:${userId}`;

async function getSession(chatId, userId) {
  const client = await getClient();
  const raw = await client.get(sessionKey(chatId, userId));
  return raw ? JSON.parse(raw) : { state: "idle", context: {} };
}

async function setSession(chatId, userId, data) {
  const client = await getClient();
  await client.set(sessionKey(chatId, userId), JSON.stringify(data), { EX: SESSION_TTL });
}

async function clearSession(chatId, userId) {
  const client = await getClient();
  await client.del(sessionKey(chatId, userId));
}

module.exports = {
  getSession,
  setSession,
  clearSession,
  sessionKey,
};