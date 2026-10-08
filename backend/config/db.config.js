'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || 'alfaiate10',
  database:           process.env.DB_NAME     || 'airpg',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
  typeCast(field, next) {
    // Auto-parse JSON/BLOB columns
    if (
      field.type === 'BLOB' &&
      /properties|requirements|skills|effects|attributes|drop_contexts|
       resources|encounters|settings|goals|knowledge|custom_props|
       loot_table|found_items|rolls|data|context|parsed_intent|result/x.test(field.name)
    ) {
      const val = field.string();
      return val ? JSON.parse(val) : null;
    }
    return next();
  },
});

module.exports = pool;
