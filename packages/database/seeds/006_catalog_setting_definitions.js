const { makeDeterministicUuid, truncateScopedTables } = require('../src/seed-helpers');

const settingDefinitions = [
  {
    key: 'craft_slot_count',
    value_type: 'integer',
    default_value: '0',
    description: 'How many craft slots are currently available for the game account.'
  }
];

exports.seed = async function seed(knex) {
  await truncateScopedTables(knex, ['catalog_setting_definitions']);

  await knex.withSchema(process.env.DB_SCHEMA).table('catalog_setting_definitions').insert(
    settingDefinitions.map((definition) => ({
      id: makeDeterministicUuid(`catalog_setting_definition:${definition.key}`),
      ...definition
    }))
  );
};
