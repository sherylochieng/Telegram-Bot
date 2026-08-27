require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

module.exports = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  PORT: process.env.PORT || 3000,
  PUBLIC_URL: process.env.PUBLIC_URL,
};  