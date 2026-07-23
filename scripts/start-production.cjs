process.env.NODE_ENV = process.env.NODE_ENV || 'production';

try {
  require('dotenv').config();
} catch (_) {}

// Prefer IPv4 when host IPv6 routes to Telegram/Bot API are broken (VPS egress).
try {
  const dns = require('dns');
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (_) {}

require('../dist/server.cjs');
