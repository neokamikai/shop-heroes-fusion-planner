const affinities = require('../data/character-affinities');
const { makeDeterministicUuid, truncateScopedTables } = require('../src/seed-helpers');

exports.seed = async function seed(knex) {
  await truncateScopedTables(knex, ['catalog_character_affinities']);

  if (!affinities.length) {
    return;
  }

  const schema = process.env.DB_SCHEMA;
  const characters = await knex.withSchema(schema).table('catalog_characters').select('id', 'code');
  const subcategories = await knex.withSchema(schema).table('catalog_subcategories').select('id', 'name');

  const characterIdByCode = new Map(characters.map((row) => [row.code, row.id]));
  const subcategoryIdByName = new Map(subcategories.map((row) => [String(row.name).toLowerCase(), row.id]));

  const rows = affinities.map((affinity) => {
    const characterId = characterIdByCode.get(affinity.character_code);
    const subcategoryId = subcategoryIdByName.get(String(affinity.subcategory_name).toLowerCase());

    if (!characterId || !subcategoryId) {
      throw new Error(`Unable to resolve character affinity ${affinity.character_code} -> ${affinity.subcategory_name}`);
    }

    return {
      id: makeDeterministicUuid(`catalog_character_affinity:${affinity.character_code}:${affinity.subcategory_name}`),
      character_id: characterId,
      subcategory_id: subcategoryId,
      affinity_level: affinity.affinity_level
    };
  });

  await knex.withSchema(schema).table('catalog_character_affinities').insert(rows);
};

