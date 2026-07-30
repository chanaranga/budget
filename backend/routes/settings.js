const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');

const DEFAULT_SETTINGS = {
  types: ['One off', 'Reccuring', 'Reccuring Plus'],
  categories: ['Bank','Car Lease','Day care','Groceries','Healthcare','Hobbies','Home','Insurance','Money In','One off plus','Other','Restaurants','Savings','Shopping','Shopping - Chana','Shopping - Liam','Shopping - Umesha','Subscriptions','Travel','Utilities','Vacation'],
  subCategories: ['Apps','Bank Charges','Budget gap','Car','Car Charging','Clothes','Consumables','Day Care','Dine In','Electricity','Flying','Health','Heating','Internet','Investment','Life','Mobile','Mortgage','Other','Parking','Pharmacy','Salary','Savings','Scooter','Streaming','Super Market','Take out','Train','Umesha','VvE','Water'],
  budgetedOptions: ['Yes','No','WO'],
};

router.use(requireAuth);

router.get('/', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'main'").get();
  if (row) return res.json(JSON.parse(row.value));
  res.json(DEFAULT_SETTINGS);
});

router.put('/', (req, res) => {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('main', ?)").run(JSON.stringify(req.body));
  res.json(req.body);
});

module.exports = router;
