const {
  loadRippedCatalogItems,
  makeDeterministicUuid,
  titleCaseWords,
  truncateScopedTables
} = require('../src/seed-helpers');

const categoryCodeBySource = {
  weapons: 'weapon',
  pvp: 'pvp',
  armor: 'protective',
  accessories: 'support_accessory',
  valuables: 'trinket_accessory'
};

function resolveCategoryCode(item) {
  return categoryCodeBySource[String(item?.category ?? '').toLowerCase()] ?? 'weapon';
}

function resolveSubcategoryName(item) {
  return titleCaseWords(item?.subcategory ?? item?.kind ?? 'Sword');
}

exports.seed = async function seed(knex) {
  await truncateScopedTables(knex, ['catalog_items']);

  const items = loadRippedCatalogItems();
  const schema = process.env.DB_SCHEMA;

  const subcategoryRows = await knex.withSchema(schema).table('catalog_subcategories').select('id', 'category_id', 'name');
  const categoryRows = await knex.withSchema(schema).table('catalog_categories').select('id', 'code');
  const tierRows = await knex.withSchema(schema).table('catalog_tiers').select('id', 'code');

  const categoryIdByCode = new Map(categoryRows.map((row) => [row.code, row.id]));
  const tierIdByCode = new Map(tierRows.map((row) => [row.code, row.id]));
  const subcategoryIdByKey = new Map(
    subcategoryRows.map((row) => [
      `${row.category_id}:${String(row.name).toLowerCase()}`,
      row.id
    ])
  );

  const minTierId = tierIdByCode.get('common');

  const itemRows = items.map((item) => {
    const categoryCode = resolveCategoryCode(item);
    const categoryId = categoryIdByCode.get(categoryCode);
    const subcategoryName = resolveSubcategoryName(item);
    const subcategoryId = subcategoryIdByKey.get(`${categoryId}:${subcategoryName.toLowerCase()}`);

    if (!categoryId || !subcategoryId) {
      throw new Error(`Unable to resolve taxonomy for item ${item.name} (${item.externalSlug})`);
    }

    return {
      id: makeDeterministicUuid(`catalog_item:${item.externalSlug}`),
      external_slug: item.externalSlug,
      name: item.name,
      subcategory_id: subcategoryId,
      level: Math.max(1, Math.floor(Number(item.level) || 1)),
      min_tier_id: minTierId,
      icon_url: item.icon_url || null,
      blueprint_url: item.blueprint_url || null,
      summary: item.summary || null,
      source: 'seed'
    };
  });

  await knex.withSchema(schema).table('catalog_items').insert(itemRows);
};

