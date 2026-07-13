const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'account_character_states', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'account_id', 'game_accounts');
    addForeignUuid(table, 'character_id', 'catalog_characters');
    table.boolean('is_unlocked').notNullable().defaultTo(false);
    table.integer('level').notNullable().defaultTo(1);
    table.unique(['account_id', 'character_id']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'account_character_states');
};

