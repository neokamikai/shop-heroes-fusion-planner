const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps,
  addForeignUuid
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'catalog_character_affinities', (table) => {
    addUuidPrimaryKey(table);
    addForeignUuid(table, 'character_id', 'catalog_characters');
    addForeignUuid(table, 'subcategory_id', 'catalog_subcategories');
    table.text('affinity_level').notNullable();
    table.unique(['character_id', 'subcategory_id']);
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'catalog_character_affinities');
};

