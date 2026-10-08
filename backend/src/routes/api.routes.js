'use strict';

const express = require('express');
const router  = express.Router();

const auth        = require('../middlewares/auth.middleware');
const userOwns    = require('../middlewares/user.middleware');

const authCtrl    = require('../controllers/authController');
const charCtrl    = require('../controllers/characterController');
const worldCtrl   = require('../controllers/worldController');
const moveCtrl    = require('../controllers/movementController');
const invCtrl     = require('../controllers/inventoryController');
const lootCtrl    = require('../controllers/lootController');
const marketCtrl  = require('../controllers/marketController');
const interCtrl   = require('../controllers/interactionController');
const seederCtrl  = require('../controllers/itemSeederController');

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.register);
router.post('/auth/login',    authCtrl.login);
router.get ('/auth/me',       auth, authCtrl.me);

// ── Worlds ───────────────────────────────────────────────────────────────────
router.get('/worlds',                                    worldCtrl.list);
router.get('/worlds/:worldId',                           worldCtrl.get);
router.get('/worlds/:worldId/nearby',                    worldCtrl.nearby);
router.get('/worlds/:worldId/regions/:regionId/locations', worldCtrl.locations);
router.get('/worlds/:worldId/markets',                   auth, marketCtrl.listByWorld);

// ── Characters ───────────────────────────────────────────────────────────────
router.get ('/characters',              auth,             charCtrl.list);
router.post('/characters',              auth,             charCtrl.create);
router.get ('/characters/:characterId', auth, userOwns,   charCtrl.get);
router.patch('/characters/:characterId',auth, userOwns,   charCtrl.update);

// Movement
router.post('/characters/:characterId/move', auth, userOwns, moveCtrl.move);

// Inventory
router.get   ('/characters/:characterId/inventory',                auth, userOwns, invCtrl.list);
router.delete('/characters/:characterId/inventory/:itemId',        auth, userOwns, invCtrl.drop);
router.patch ('/characters/:characterId/inventory/:itemId/equip',  auth, userOwns, invCtrl.equip);
router.patch ('/characters/:characterId/inventory/:itemId/unequip',auth, userOwns, invCtrl.unequip);

// Loot & world pickup
router.post('/characters/:characterId/loot',   auth, userOwns, lootCtrl.loot);
router.post('/characters/:characterId/pickup', auth, userOwns, lootCtrl.pickupWorldItem);

// ── Markets ──────────────────────────────────────────────────────────────────
router.get ('/markets/:marketId',         auth, marketCtrl.get);
router.post('/markets/:marketId/buy',     auth, marketCtrl.buy);
router.post('/markets/:marketId/sell',    auth, marketCtrl.sell);
router.post('/markets/:marketId/restock', auth, marketCtrl.restock);

// ── Interactions (combat / dialogue) ─────────────────────────────────────────
router.post('/worlds/:worldId/interactions',                      auth, interCtrl.create);
router.get ('/worlds/:worldId/interactions/:sessionId',           auth, interCtrl.getSession);
router.post('/worlds/:worldId/interactions/:sessionId/turn',      auth, interCtrl.submitTurn);
router.post('/worlds/:worldId/interactions/:sessionId/ooc',       auth, interCtrl.oocChat);
router.post('/worlds/:worldId/interactions/:sessionId/end',       auth, interCtrl.end);

// ── Admin ────────────────────────────────────────────────────────────────────
router.post('/admin/seed-items', auth, seederCtrl.seedItems);

module.exports = router;
