const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data', 'security.db'));
const sessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const makeToken = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  req.user = sessions.get(token);
  next();
};

const init = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recruits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      site TEXT,
      stage TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer TEXT NOT NULL,
      site TEXT NOT NULL,
      shift TEXT NOT NULL,
      card_status TEXT NOT NULL,
      salary TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer TEXT NOT NULL,
      method TEXT NOT NULL,
      amount TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS salaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer TEXT NOT NULL,
      month TEXT NOT NULL,
      gross TEXT NOT NULL,
      deductions TEXT NOT NULL,
      net TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer TEXT NOT NULL,
      card_number TEXT NOT NULL,
      issued_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      officer TEXT NOT NULL,
      site TEXT NOT NULL,
      date TEXT NOT NULL,
      shift TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);

  const seed = (countQuery, insertFn, rows) => {
    const count = db.prepare(countQuery).get().count;
    if (count === 0) rows.forEach(insertFn);
  };

  seed(
    'SELECT COUNT(*) AS count FROM users',
    row => db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(...row),
    [['Dominic Admin', 'admin@dominicsecurity.com', 'admin123', 'Administrator']]
  );

  seed(
    'SELECT COUNT(*) AS count FROM recruits',
    row => db.prepare('INSERT INTO recruits (name, phone, site, stage) VALUES (?, ?, ?, ?)').run(...row),
    [
      ['Brian Mwangi', '0712000001', 'CBD Plaza', 'Interview'],
      ['Faith Chebet', '0712000002', 'Industrial Park', 'Approved']
    ]
  );

  seed(
    'SELECT COUNT(*) AS count FROM assignments',
    row =>
      db
        .prepare('INSERT INTO assignments (officer, site, shift, card_status, salary) VALUES (?, ?, ?, ?, ?)')
        .run(...row),
    [
      ['James Otieno', 'West Gate Depot', 'Day', 'Active', 'KES 28,000'],
      ['Mercy Njeri', 'Riverside Apartments', 'Night', 'Renewal due', 'KES 31,500'],
      ['Peter Kiptoo', 'North Industrial Park', 'Day', 'Active', 'KES 29,200']
    ]
  );

  seed(
    'SELECT COUNT(*) AS count FROM payments',
    row => db.prepare('INSERT INTO payments (officer, method, amount, status) VALUES (?, ?, ?, ?)').run(...row),
    [
      ['James Otieno', 'M-Pesa', 'KES 28,000', 'Sent'],
      ['Mercy Njeri', 'Bank', 'KES 31,500', 'Queued'],
      ['Peter Kiptoo', 'M-Pesa', 'KES 29,200', 'Sent']
    ]
  );

  seed(
    'SELECT COUNT(*) AS count FROM salaries',
    row =>
      db
        .prepare('INSERT INTO salaries (officer, month, gross, deductions, net, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(...row),
    [
      ['James Otieno', '2026-06', 'KES 30,000', 'KES 2,000', 'KES 28,000', 'Approved'],
      ['Mercy Njeri', '2026-06', 'KES 33,000', 'KES 1,500', 'KES 31,500', 'Pending']
    ]
  );

  seed(
    'SELECT COUNT(*) AS count FROM cards',
    row =>
      db
        .prepare('INSERT INTO cards (officer, card_number, issued_date, expiry_date, status) VALUES (?, ?, ?, ?, ?)')
        .run(...row),
    [
      ['James Otieno', 'SG-2044', '2026-01-15', '2027-01-15', 'Active'],
      ['Mercy Njeri', 'SG-1988', '2025-06-30', '2026-06-30', 'Renewal due']
    ]
  );

  seed(
    'SELECT COUNT(*) AS count FROM attendance',
    row =>
      db
        .prepare('INSERT INTO attendance (officer, site, date, shift, status) VALUES (?, ?, ?, ?, ?)').run(...row),
    [
      ['James Otieno', 'West Gate Depot', '2026-06-21', 'Day', 'Present'],
      ['Mercy Njeri', 'Riverside Apartments', '2026-06-21', 'Night', 'Off'],
      ['Peter Kiptoo', 'North Industrial Park', '2026-06-21', 'Day', 'Present']
    ]
  );
};

init();

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT id, name, email, role, password FROM users WHERE email = ?').get(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  const token = makeToken();
  sessions.set(token, { id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({ success: true, token, user: sessions.get(token) });
});

app.get('/api/dashboard', auth, (req, res) => {
  const recruits = db.prepare('SELECT COUNT(*) AS count FROM recruits').get().count;
  const assignments = db.prepare('SELECT COUNT(*) AS count FROM assignments').get().count;
  const payments = db.prepare('SELECT COUNT(*) AS count FROM payments').get().count;
  const cardsPending = db.prepare("SELECT COUNT(*) AS count FROM cards WHERE status != 'Active'").get().count;
  const salariesPending = db.prepare("SELECT COUNT(*) AS count FROM salaries WHERE status != 'Approved'").get().count;
  const attendancePresent = db.prepare("SELECT COUNT(*) AS count FROM attendance WHERE status = 'Present'").get().count;
  res.json({
    recruits,
    assignments,
    payments,
    cardsPending,
    salariesPending,
    attendancePresent,
    payroll: 'KES 3.4M'
  });
});

app.get('/api/recruits', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM recruits ORDER BY id DESC').all())
);

app.post('/api/recruits', auth, (req, res) => {
  const { name, phone = '', site = '', stage } = req.body || {};
  if (!name || !stage) {
    return res.status(400).json({ success: false, message: 'Name and stage are required.' });
  }
  const info = db.prepare('INSERT INTO recruits (name, phone, site, stage) VALUES (?, ?, ?, ?)').run(
    name,
    phone,
    site,
    stage
  );
  res.json({ success: true, row: db.prepare('SELECT * FROM recruits WHERE id = ?').get(info.lastInsertRowid) });
});

app.get('/api/assignments', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM assignments ORDER BY id DESC').all())
);

app.get('/api/payments', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM payments ORDER BY id DESC').all())
);

app.get('/api/salaries', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM salaries ORDER BY id DESC').all())
);

app.post('/api/salaries', auth, (req, res) => {
  const { officer, month, gross, deductions, net, status } = req.body || {};
  if (!officer || !month || !gross || !net || !status) {
    return res.status(400).json({ success: false, message: 'Missing salary fields.' });
  }
  const info = db
    .prepare('INSERT INTO salaries (officer, month, gross, deductions, net, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(officer, month, gross, deductions || '', net, status);
  res.json({ success: true, row: db.prepare('SELECT * FROM salaries WHERE id = ?').get(info.lastInsertRowid) });
});

app.put('/api/salaries/:id', auth, (req, res) => {
  const { officer, month, gross, deductions, net, status } = req.body || {};
  db.prepare('UPDATE salaries SET officer = ?, month = ?, gross = ?, deductions = ?, net = ?, status = ? WHERE id = ?')
    .run(officer, month, gross, deductions || '', net, status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/salaries/:id', auth, (req, res) => {
  db.prepare('DELETE FROM salaries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/cards', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM cards ORDER BY id DESC').all())
);

app.post('/api/cards', auth, (req, res) => {
  const { officer, card_number, issued_date, expiry_date, status } = req.body || {};
  if (!officer || !card_number || !issued_date || !expiry_date || !status) {
    return res.status(400).json({ success: false, message: 'Missing card fields.' });
  }
  const info = db
    .prepare('INSERT INTO cards (officer, card_number, issued_date, expiry_date, status) VALUES (?, ?, ?, ?, ?)')
    .run(officer, card_number, issued_date, expiry_date, status);
  res.json({ success: true, row: db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid) });
});

app.put('/api/cards/:id', auth, (req, res) => {
  const { officer, card_number, issued_date, expiry_date, status } = req.body || {};
  db.prepare('UPDATE cards SET officer = ?, card_number = ?, issued_date = ?, expiry_date = ?, status = ? WHERE id = ?')
    .run(officer, card_number, issued_date, expiry_date, status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/cards/:id', auth, (req, res) => {
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/attendance', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM attendance ORDER BY id DESC').all())
);

app.post('/api/attendance', auth, (req, res) => {
  const { officer, site, date, shift, status } = req.body || {};
  if (!officer || !site || !date || !shift || !status) {
    return res.status(400).json({ success: false, message: 'Missing attendance fields.' });
  }
  const info = db
    .prepare('INSERT INTO attendance (officer, site, date, shift, status) VALUES (?, ?, ?, ?, ?)').run(
      officer,
      site,
      date,
      shift,
      status
    );
  res.json({ success: true, row: db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid) });
});

app.put('/api/attendance/:id', auth, (req, res) => {
  const { officer, site, date, shift, status } = req.body || {};
  db.prepare('UPDATE attendance SET officer = ?, site = ?, date = ?, shift = ?, status = ? WHERE id = ?')
    .run(officer, site, date, shift, status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/attendance/:id', auth, (req, res) => {
  db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));