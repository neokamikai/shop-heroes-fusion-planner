const { makeDeterministicUuid, truncateScopedTables } = require('../src/seed-helpers');

const tiers = [
  { code: 'common', name: 'Common', sort_order: 10, value_multiplier: 1, previous_tier_count_required: 0 },
  { code: 'good', name: 'Good', sort_order: 20, value_multiplier: 2, previous_tier_count_required: 2 },
  { code: 'great', name: 'Great', sort_order: 30, value_multiplier: 4, previous_tier_count_required: 2 },
  { code: 'flawless', name: 'Flawless', sort_order: 40, value_multiplier: 12, previous_tier_count_required: 3 },
  { code: 'epic', name: 'Epic', sort_order: 50, value_multiplier: 60, previous_tier_count_required: 5 },
  { code: 'legendary', name: 'Legendary', sort_order: 60, value_multiplier: 300, previous_tier_count_required: 5 },
  { code: 'mythical', name: 'Mythical', sort_order: 70, value_multiplier: 1500, previous_tier_count_required: 5 }
];

exports.seed = async function seed(knex) {
  await truncateScopedTables(knex, ['catalog_tiers']);

  await knex.withSchema(process.env.DB_SCHEMA).table('catalog_tiers').insert(
    tiers.map((tier) => ({
      id: makeDeterministicUuid(`catalog_tier:${tier.code}`),
      ...tier
    }))
  );
};

