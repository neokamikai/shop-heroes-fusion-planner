class CatalogService {
  constructor({
    charactersRepository,
    categoriesRepository,
    tiersRepository,
    itemsRepository,
    settingDefinitionsRepository
  }) {
    this.charactersRepository = charactersRepository;
    this.categoriesRepository = categoriesRepository;
    this.tiersRepository = tiersRepository;
    this.itemsRepository = itemsRepository;
    this.settingDefinitionsRepository = settingDefinitionsRepository;
  }

  async listCharacters() {
    return this.charactersRepository.listAll();
  }

  async listCategories() {
    return this.categoriesRepository.listWithSubcategories();
  }

  async listTiers() {
    return this.tiersRepository.listAll();
  }

  async listItems(rawFilters = {}) {
    const limit = Math.min(200, Math.max(1, Number(rawFilters.limit) || 50));
    const offset = Math.max(0, Number(rawFilters.offset) || 0);
    const filters = {
      search: String(rawFilters.search ?? '').trim() || undefined,
      categoryCode: String(rawFilters.category ?? '').trim() || undefined,
      subcategoryCode: String(rawFilters.subcategory ?? '').trim() || undefined,
      limit,
      offset
    };

    const [items, total] = await Promise.all([
      this.itemsRepository.listAll(filters),
      this.itemsRepository.countAll(filters)
    ]);

    return {
      data: items,
      pagination: {
        total,
        limit,
        offset
      }
    };
  }

  async listSettingDefinitions() {
    return this.settingDefinitionsRepository.listAll();
  }
}

module.exports = {
  CatalogService
};
