const {
  makeDeterministicUuid,
  titleCaseWords,
  truncateScopedTables
} = require('../src/seed-helpers');

const categories = [
  {
    code: 'weapon',
    name: 'Weapon',
    sort_order: 10,
    subcategories: ['Sword', 'Dagger', 'Axe', 'Spear', 'Mace', 'Staff', 'Bow', 'Gun']
  },
  {
    code: 'pvp',
    name: 'PvP',
    sort_order: 20,
    subcategories: ['Axe', 'Mace', 'Spear', 'Staff']
  },
  {
    code: 'protective',
    name: 'Protective',
    sort_order: 30,
    subcategories: ['Armor', 'Vest', 'Helmet', 'Gauntlet', 'Boots', 'Clothes', 'Shield', 'Hat', 'Bracer', 'Footwear']
  },
  {
    code: 'support_accessory',
    name: 'Support Accessory',
    sort_order: 40,
    subcategories: ['Remedy', 'Potion', 'Spell', 'Projectile']
  },
  {
    code: 'trinket_accessory',
    name: 'Trinket Accessory',
    sort_order: 50,
    subcategories: ['Ring', 'Pendant', 'Instruments']
  }
];

exports.seed = async function seed(knex) {
  await truncateScopedTables(knex, ['catalog_subcategories', 'catalog_categories']);

  const categoryRows = categories.map((category) => ({
    id: makeDeterministicUuid(`catalog_category:${category.code}`),
    code: category.code,
    name: category.name,
    sort_order: category.sort_order
  }));

  await knex.withSchema(process.env.DB_SCHEMA).table('catalog_categories').insert(categoryRows);

  const subcategoryRows = categories.flatMap((category) =>
    category.subcategories.map((subcategory, index) => ({
      id: makeDeterministicUuid(`catalog_subcategory:${category.code}:${subcategory.toLowerCase()}`),
      category_id: makeDeterministicUuid(`catalog_category:${category.code}`),
      code: subcategory.toLowerCase().replace(/\s+/g, '_'),
      name: titleCaseWords(subcategory),
      sort_order: index + 1
    }))
  );

  await knex.withSchema(process.env.DB_SCHEMA).table('catalog_subcategories').insert(subcategoryRows);
};

