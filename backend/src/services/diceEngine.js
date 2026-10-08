'use strict';

/**
 * Roll dice formula: "2d6+3", "1d20", "1d20 adv", "1d20 dis"
 */
function roll(formula) {
  const adv = / adv$/i.test(formula);
  const dis = / dis$/i.test(formula);
  const clean = formula.replace(/ (adv|dis)$/i, '').trim();

  const match = clean.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return { total: 0, rolls: [], formula };

  const count   = parseInt(match[1]);
  const sides   = parseInt(match[2]);
  const mod     = parseInt(match[3] || '0');

  function rollOnce() {
    const rolls = Array.from({ length: count }, () => Math.ceil(Math.random() * sides));
    return { rolls, sum: rolls.reduce((a, b) => a + b, 0) };
  }

  if (adv) {
    const a = rollOnce(), b = rollOnce();
    const chosen = a.sum >= b.sum ? a : b;
    return { total: chosen.sum + mod, rolls: chosen.rolls, mod, formula, advantage: true };
  }
  if (dis) {
    const a = rollOnce(), b = rollOnce();
    const chosen = a.sum <= b.sum ? a : b;
    return { total: chosen.sum + mod, rolls: chosen.rolls, mod, formula, disadvantage: true };
  }

  const { rolls, sum } = rollOnce();
  return { total: sum + mod, rolls, mod, formula };
}

/**
 * Attribute check: roll d20, compare to DC.
 * attrValue = raw stat (e.g. 14 STR). modifier = floor((attr-10)/2).
 */
function attributeCheck(attrValue, dc) {
  const mod    = Math.floor((attrValue - 10) / 2);
  const result = roll(`1d20`);
  result.modifier = mod;
  result.total   += mod;
  result.dc       = dc;
  result.success  = result.total >= dc;
  return result;
}

/**
 * Attack roll: roll d20 + attackBonus vs targetAC.
 */
function attackRoll(attackBonus, targetAC) {
  const result = roll('1d20');
  const natural = result.rolls[0];
  result.total  += attackBonus;
  result.attackBonus = attackBonus;
  result.targetAC    = targetAC;
  result.hit         = natural === 20 || result.total >= targetAC;
  result.critical    = natural === 20;
  result.fumble      = natural === 1;
  return result;
}

/**
 * Damage roll from formula string.  Crits double the dice.
 */
function damageRoll(formula, isCrit = false) {
  if (isCrit) {
    // Double the number of dice
    const doubled = formula.replace(/^(\d+)d/i, (_, n) => `${parseInt(n) * 2}d`);
    return roll(doubled);
  }
  return roll(formula);
}

module.exports = { roll, attributeCheck, attackRoll, damageRoll };
