const characters = require('../data/characters');
const { makeDeterministicUuid, truncateScopedTables } = require('../src/seed-helpers');

exports.seed = async function seed(knex) {
  await truncateScopedTables(knex, ['catalog_characters']);

  if (!characters.length) {
    return;
  }

  await knex.withSchema(process.env.DB_SCHEMA).table('catalog_characters').insert(
    characters.map((character, index) => ({
      id: makeDeterministicUuid(`catalog_character:${character.code}`),
      code: character.code,
      name: character.name,
      sort_order: Number.isFinite(Number(character.sort_order)) ? Number(character.sort_order) : index + 1
    }))
  );
};

