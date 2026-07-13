const {
  createScopedTable,
  dropScopedTable,
  addUuidPrimaryKey,
  addTimestamps
} = require('../src/migration-helpers');

exports.up = async function up(knex) {
  await createScopedTable(knex, 'catalog_setting_definitions', (table) => {
    addUuidPrimaryKey(table);
    table.text('key').notNullable().unique();
    table.text('value_type').notNullable();
    table.text('default_value').nullable();
    table.text('description').nullable();
    addTimestamps(table);
  });
};

exports.down = async function down(knex) {
  await dropScopedTable(knex, 'catalog_setting_definitions');
};

