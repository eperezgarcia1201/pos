import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api";
import PinGate from "../components/PinGate";
import { getCurrentUser } from "../lib/session";

type Category = {
  id: string;
  name: string;
  color?: string | null;
  sortOrder?: number | null;
  visible?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type Group = { id: string; name: string; categoryId: string; sortOrder?: number | null; visible?: boolean; kitchenStationId?: string | null };

type Item = {
  id: string;
  name: string;
  price: string;
  color?: string | null;
  categoryId: string | null;
  groupId: string | null;
  taxId?: string | null;
  visible?: boolean;
  kitchenStationId?: string | null;
};

type Tax = { id: string; name: string; rate: number };

type Discount = { id: string; name: string; type: string; value: number };

type ModifierGroup = {
  id: string;
  name: string;
  minRequired?: number | null;
  maxAllowed?: number | null;
  sortOrder?: number | null;
  active?: boolean;
};

type Modifier = { id: string; name: string; price: number; groupId: string; sortOrder?: number | null; active?: boolean };

type KitchenStation = { id: string; name: string; printerId?: string | null };

type ItemAvailability = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
};

type ItemModifierLink = {
  id: string;
  minRequired: number | null;
  maxAllowed: number | null;
  group: ModifierGroup & { modifiers?: Modifier[] };
};

type Ingredient = {
  id: string;
  inventoryItemId: string;
  quantity: string;
  unit?: string | null;
  inventoryItem: { id: string; name: string; sku: string };
};

export default function MenuManager() {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [pinOpen, setPinOpen] = useState(() => !getCurrentUser());
  const [menuError, setMenuError] = useState("");
  const [menuSection, setMenuSection] = useState("items");
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [kitchenStations, setKitchenStations] = useState<KitchenStation[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Array<{ id: string; name: string; sku: string }>>([]);

  const [newCategory, setNewCategory] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [openCategoryActionId, setOpenCategoryActionId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [editCategory, setEditCategory] = useState({ name: "", color: "", sortOrder: "", visible: true });
  const [newGroup, setNewGroup] = useState({ name: "", categoryId: "", kitchenStationId: "" });
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [editGroup, setEditGroup] = useState({ name: "", categoryId: "", sortOrder: "", visible: true, kitchenStationId: "" });
  const [newItem, setNewItem] = useState({ name: "", price: "", color: "", categoryId: "", groupId: "", taxId: "", kitchenStationId: "", barcode: "" });
  const [newTax, setNewTax] = useState({ name: "", rate: "" });
  const [newDiscount, setNewDiscount] = useState({ name: "", type: "PERCENT", value: "" });
  const [newModifierGroup, setNewModifierGroup] = useState("");
  const [selectedModifierGroupId, setSelectedModifierGroupId] = useState("");
  const [editModifierGroup, setEditModifierGroup] = useState({ name: "", minRequired: "", maxAllowed: "", sortOrder: "", active: true });
  const [newModifier, setNewModifier] = useState({ name: "", price: "", groupId: "" });
  const [selectedModifierId, setSelectedModifierId] = useState("");
  const [editModifier, setEditModifier] = useState({ name: "", price: "", groupId: "", sortOrder: "", active: true });
  const [newKitchenStation, setNewKitchenStation] = useState({ name: "", printerId: "" });

  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemForm, setItemForm] = useState({
    name: "",
    price: "",
    color: "",
    categoryId: "",
    groupId: "",
    taxId: "",
    barcode: "",
    kitchenStationId: "",
    visible: true
  });
  const [itemEditorMode, setItemEditorMode] = useState<"new" | "edit">("new");
  const [availability, setAvailability] = useState<ItemAvailability[]>([]);
  const [newAvailability, setNewAvailability] = useState({
    dayOfWeek: "1",
    startTime: "11:00",
    endTime: "22:00"
  });
  const [itemModifierLinks, setItemModifierLinks] = useState<ItemModifierLink[]>([]);
  const [newLink, setNewLink] = useState({
    groupId: "",
    minRequired: "",
    maxAllowed: ""
  });
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [newIngredient, setNewIngredient] = useState({ inventoryItemId: "", quantity: "", unit: "" });
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({
    DEFAULT: "",
    DINE_IN: "",
    TAKEOUT: "",
    DELIVERY: "",
    BAR: ""
  });
  const [itemFilter, setItemFilter] = useState({ search: "", categoryId: "", groupId: "" });
  const [groupPageIndex, setGroupPageIndex] = useState(0);
  const [treeExpandedCategories, setTreeExpandedCategories] = useState<Record<string, boolean>>({});
  const [treeExpandedGroups, setTreeExpandedGroups] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!currentUser) return;
    const [cats, grp, itm, taxList, discList, modGroups, modList, stations, inventory] = await Promise.all([
      apiFetch("/menu/categories"),
      apiFetch("/menu/groups"),
      apiFetch("/menu/items"),
      apiFetch("/taxes"),
      apiFetch("/discounts"),
      apiFetch("/modifier-groups"),
      apiFetch("/modifiers"),
      apiFetch("/kitchen-stations"),
      apiFetch("/inventory")
    ]);
    setCategories(cats);
    setGroups(grp);
    setItems(itm);
    setTaxes(taxList);
    setDiscounts(discList);
    setModifierGroups(modGroups);
    setModifiers(modList);
    setKitchenStations(stations);
    setInventoryItems(inventory);
  };

  useEffect(() => {
    load().catch((err) => {
      const message = err instanceof Error ? err.message : "Unable to load menu data.";
      setMenuError(message);
      if (message.toLowerCase().includes("access code")) {
        setPinOpen(true);
      }
    });
  }, [currentUser]);

  useEffect(() => {
    const section = new URLSearchParams(location.search).get("section");
    const allowed = new Set([
      "categories",
      "groups",
      "items",
      "prices",
      "modifiers",
      "forced",
      "taxes",
      "stations"
    ]);
    if (section && allowed.has(section)) {
      setMenuSection(section);
    }
  }, [location.search]);

  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    setTreeExpandedCategories((prev) => ({
      ...prev,
      [selectedCategoryId]: true
    }));
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!newGroup.categoryId && selectedCategoryId) {
      setNewGroup((prev) => ({ ...prev, categoryId: selectedCategoryId }));
    }
  }, [selectedCategoryId, newGroup.categoryId]);

  useEffect(() => {
    const selected = categories.find((cat) => cat.id === selectedCategoryId);
    if (selected) {
      setEditCategory({
        name: selected.name,
        color: selected.color || "",
        sortOrder: String(selected.sortOrder ?? ""),
        visible: selected.visible ?? true
      });
    }
  }, [selectedCategoryId, categories]);

  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (itemEditorMode !== "new") return;
    setNewItem((prev) => {
      const next = { ...prev };
      if (itemFilter.groupId) {
        next.groupId = itemFilter.groupId;
        const group = groups.find((grp) => grp.id === itemFilter.groupId);
        if (group) next.categoryId = group.categoryId;
      } else if (itemFilter.categoryId && !prev.groupId) {
        next.categoryId = itemFilter.categoryId;
      }
      return next;
    });
  }, [itemFilter.groupId, itemFilter.categoryId, groups, itemEditorMode]);

  useEffect(() => {
    const selected = groups.find((grp) => grp.id === selectedGroupId);
    if (selected) {
      setEditGroup({
        name: selected.name,
        categoryId: selected.categoryId || "",
        sortOrder: String(selected.sortOrder ?? ""),
        visible: selected.visible ?? true,
        kitchenStationId: selected.kitchenStationId || ""
      });
    }
  }, [selectedGroupId, groups]);

  useEffect(() => {
    const selected = items.find((item) => item.id === selectedItemId);
    if (selected) {
      setItemForm({
        name: selected.name,
        price: selected.price,
        color: selected.color || "",
        categoryId: selected.categoryId || "",
        groupId: selected.groupId || "",
        taxId: selected.taxId || "",
        barcode: selected.barcode || "",
        kitchenStationId: selected.kitchenStationId || "",
        visible: selected.visible ?? true
      });
      (async () => {
        const [avail, links, ingredientList, priceList] = await Promise.all([
          apiFetch(`/menu/items/${selected.id}/availability`),
          apiFetch(`/menu/items/${selected.id}/modifier-groups`),
          apiFetch(`/menu/items/${selected.id}/ingredients`),
          apiFetch(`/menu/items/${selected.id}/prices`)
        ]);
        setAvailability(avail);
        setItemModifierLinks(links);
        setIngredients(ingredientList);
        const priceMap: Record<string, string> = {
          DEFAULT: "",
          DINE_IN: "",
          TAKEOUT: "",
          DELIVERY: "",
          BAR: ""
        };
        priceList.forEach((entry: { priceType: string; price: string }) => {
          priceMap[entry.priceType] = String(entry.price);
        });
        setItemPrices(priceMap);
      })().catch(console.error);
    } else {
      if (itemEditorMode === "edit") {
        setItemEditorMode("new");
      }
      setAvailability([]);
      setItemModifierLinks([]);
      setIngredients([]);
      setItemPrices({
        DEFAULT: "",
        DINE_IN: "",
        TAKEOUT: "",
        DELIVERY: "",
        BAR: ""
      });
    }
  }, [selectedItemId, items, itemEditorMode]);

  useEffect(() => {
    if (!selectedModifierGroupId && modifierGroups.length > 0) {
      setSelectedModifierGroupId(modifierGroups[0].id);
    }
  }, [modifierGroups, selectedModifierGroupId]);

  useEffect(() => {
    const selected = modifierGroups.find((group) => group.id === selectedModifierGroupId);
    if (selected) {
      setEditModifierGroup({
        name: selected.name,
        minRequired: String(selected.minRequired ?? ""),
        maxAllowed: String(selected.maxAllowed ?? ""),
        sortOrder: String(selected.sortOrder ?? ""),
        active: selected.active ?? true
      });
    }
  }, [selectedModifierGroupId, modifierGroups]);

  useEffect(() => {
    if (!selectedModifierId && modifiers.length > 0) {
      setSelectedModifierId(modifiers[0].id);
    }
  }, [modifiers, selectedModifierId]);

  useEffect(() => {
    const selected = modifiers.find((mod) => mod.id === selectedModifierId);
    if (selected) {
      setEditModifier({
        name: selected.name,
        price: String(selected.price ?? ""),
        groupId: selected.groupId,
        sortOrder: String(selected.sortOrder ?? ""),
        active: selected.active ?? true
      });
    }
  }, [selectedModifierId, modifiers]);

  const visibleItems = items.filter((item) => {
    const matchesSearch = !itemFilter.search || item.name.toLowerCase().includes(itemFilter.search.toLowerCase());
    const matchesCategory = !itemFilter.categoryId || item.categoryId === itemFilter.categoryId;
    const matchesGroup = !itemFilter.groupId || item.groupId === itemFilter.groupId;
    return matchesSearch && matchesCategory && matchesGroup;
  });

  const itemsByGroup = items.reduce<Record<string, Item[]>>((map, item) => {
    if (!item.groupId) return map;
    if (!map[item.groupId]) map[item.groupId] = [];
    map[item.groupId].push(item);
    return map;
  }, {});

  const sortedGroups = [...groups].sort((a, b) => {
    const orderA = a.sortOrder ?? 0;
    const orderB = b.sortOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
  const groupsPerPage = 12;
  const groupPageCount = Math.max(1, Math.ceil(sortedGroups.length / groupsPerPage));
  const safePageIndex = Math.min(groupPageIndex, groupPageCount - 1);
  const pageA = sortedGroups.slice(safePageIndex * groupsPerPage, safePageIndex * groupsPerPage + groupsPerPage);
  const pageB = sortedGroups.slice(
    (safePageIndex + 1) * groupsPerPage,
    (safePageIndex + 1) * groupsPerPage + groupsPerPage
  );

  useEffect(() => {
    if (groupPageIndex > groupPageCount - 1) {
      setGroupPageIndex(Math.max(0, groupPageCount - 1));
    }
  }, [groupPageCount, groupPageIndex]);

  const groupColorMap = new Map(categories.map((cat) => [cat.id, cat.color || ""]));
  const groupsForItems = (itemFilter.categoryId
    ? sortedGroups.filter((group) => group.categoryId === itemFilter.categoryId)
    : sortedGroups
  ).filter((group) => group.visible !== false);

  const modifiersForGroup = selectedModifierGroupId
    ? modifiers.filter((mod) => mod.groupId === selectedModifierGroupId)
    : modifiers;

  const categoryGroupCounts = groups.reduce<Record<string, number>>((map, group) => {
    map[group.categoryId] = (map[group.categoryId] || 0) + 1;
    return map;
  }, {});

  const categoryItemCounts = items.reduce<Record<string, number>>((map, item) => {
    if (!item.categoryId) return map;
    map[item.categoryId] = (map[item.categoryId] || 0) + 1;
    return map;
  }, {});

  const categoryCards = categories.map((category) => ({
    ...category,
    groupCount: categoryGroupCounts[category.id] || 0,
    itemCount: categoryItemCounts[category.id] || 0
  }));

  const topCategoryChips = [...categoryCards]
    .sort((a, b) => {
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5);

  const normalizedCategorySearch = categorySearch.trim().toLowerCase();
  const filteredCategoryCards = categoryCards.filter((category) => {
    if (categoryFilter === "VISIBLE" && category.visible === false) return false;
    if (categoryFilter === "HIDDEN" && category.visible !== false) return false;
    if (!["ALL", "VISIBLE", "HIDDEN"].includes(categoryFilter) && category.id !== categoryFilter) {
      return false;
    }
    if (normalizedCategorySearch && !category.name.toLowerCase().includes(normalizedCategorySearch)) {
      return false;
    }
    return true;
  });

  const formatCategoryUpdate = (value?: string) => {
    if (!value) return "Updated recently";
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "Updated recently";
    const diffMs = Date.now() - timestamp;
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor(Math.abs(diffMs) / dayMs);
    if (diffDays <= 0) return "Updated today";
    if (diffDays === 1) return diffMs >= 0 ? "Updated 1 day ago" : "Updates in 1 day";
    return diffMs >= 0 ? `Updated ${diffDays} days ago` : `Updates in ${diffDays} days`;
  };

  const resolveCategoryIcon = (name: string) => {
    const label = name.toLowerCase();
    if (label.includes("burger")) return "🍔";
    if (label.includes("taco")) return "🌮";
    if (label.includes("drink") || label.includes("beverage")) return "🥤";
    if (label.includes("appetizer")) return "🥗";
    if (label.includes("side")) return "🍟";
    if (label.includes("dessert")) return "🍰";
    if (label.includes("seafood")) return "🐟";
    if (label.includes("fajita")) return "🍺";
    if (label.includes("kid")) return "🧒";
    if (label.includes("special")) return "⭐";
    if (label.includes("wine")) return "🍷";
    return "🍽️";
  };

  return (
    <div className="screen-shell">
      <PinGate
        open={pinOpen}
        title="Access Code Required"
        onSuccess={(user) => {
          setCurrentUser(user);
          setPinOpen(false);
        }}
        onCancel={() => setPinOpen(false)}
      />
      <header className="screen-header">
        <div>
          <h2>Menu Management</h2>
          <p>Categories, groups, items, modifiers, taxes, and discounts.</p>
        </div>
      </header>

      <div className="menu-setup-nav">
        {[
          { id: "categories", label: "Menu Categories..." },
          { id: "groups", label: "Menu Groups..." },
          { id: "items", label: "Menu Items..." },
          { id: "prices", label: "Menu Item Auto Prices..." },
          { id: "modifiers", label: "Menu Modifiers..." },
          { id: "forced", label: "Forced Modifiers..." },
          { id: "taxes", label: "Taxes & Discounts..." },
          { id: "stations", label: "Kitchen Stations..." }
        ].map((section) => (
          <button
            key={section.id}
            type="button"
            className={menuSection === section.id ? "active" : ""}
            onClick={() => setMenuSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="screen-grid">
        {menuSection === "categories" && (
        <section className="panel span-3 menu-categories-panel">
          <div className="menu-categories-layout">
            <aside className="menu-categories-sidebar">
              <h3>Categories</h3>
              <p>Manage sections quickly and keep your menu organized.</p>
              <div className="menu-categories-sidebar-list">
                <button
                  type="button"
                  className={categoryFilter === "ALL" ? "active" : ""}
                  onClick={() => setCategoryFilter("ALL")}
                >
                  <span>All</span>
                  <small>{categoryCards.length}</small>
                </button>
                <button
                  type="button"
                  className={categoryFilter === "VISIBLE" ? "active" : ""}
                  onClick={() => setCategoryFilter("VISIBLE")}
                >
                  <span>Visible</span>
                  <small>{categoryCards.filter((category) => category.visible !== false).length}</small>
                </button>
                <button
                  type="button"
                  className={categoryFilter === "HIDDEN" ? "active" : ""}
                  onClick={() => setCategoryFilter("HIDDEN")}
                >
                  <span>Hidden</span>
                  <small>{categoryCards.filter((category) => category.visible === false).length}</small>
                </button>
              </div>
              <div className="menu-categories-sidebar-divider" />
              <div className="menu-categories-sidebar-list">
                {categoryCards.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={selectedCategoryId === category.id ? "active" : ""}
                    onClick={() => {
                      setCategoryFilter(category.id);
                      setSelectedCategoryId(category.id);
                      setOpenCategoryActionId("");
                    }}
                  >
                    <span>{category.name}</span>
                    <small>{category.itemCount} items</small>
                  </button>
                ))}
              </div>
            </aside>

            <div className="menu-categories-content">
              <div className="menu-categories-toolbar">
                <input
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Search categories..."
                />
                <div className="menu-categories-add">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Category name"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuError("");
                      if (!newCategory) return;
                      try {
                        await apiFetch("/menu/categories", {
                          method: "POST",
                          body: JSON.stringify({ name: newCategory })
                        });
                        setNewCategory("");
                        await load();
                      } catch (err) {
                        setMenuError(err instanceof Error ? err.message : "Unable to add category.");
                      }
                    }}
                  >
                    + Add Category
                  </button>
                </div>
              </div>

              <div className="menu-categories-chips">
                <button
                  type="button"
                  className={categoryFilter === "ALL" ? "active" : ""}
                  onClick={() => setCategoryFilter("ALL")}
                >
                  All
                </button>
                {topCategoryChips.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={categoryFilter === category.id ? "active" : ""}
                    onClick={() => {
                      setCategoryFilter(category.id);
                      setSelectedCategoryId(category.id);
                      setOpenCategoryActionId("");
                    }}
                  >
                    {category.name}
                  </button>
                ))}
                <button
                  type="button"
                  className={categoryFilter === "HIDDEN" ? "active" : ""}
                  onClick={() => setCategoryFilter("HIDDEN")}
                >
                  Hidden
                </button>
              </div>

              <div className="menu-category-card-grid">
                {filteredCategoryCards.map((category) => (
                  <article
                    key={category.id}
                    className={`menu-category-card ${selectedCategoryId === category.id ? "active" : ""}`}
                  >
                    <button
                      type="button"
                      className="menu-category-card-main"
                      onClick={() => {
                        setSelectedCategoryId(category.id);
                        setOpenCategoryActionId("");
                      }}
                    >
                      <div className="menu-category-card-icon">{resolveCategoryIcon(category.name)}</div>
                      <div className="menu-category-card-copy">
                        <h4>{category.name}</h4>
                        <p>
                          {category.itemCount} items • {category.groupCount} groups
                        </p>
                        <small>{formatCategoryUpdate(category.updatedAt)}</small>
                      </div>
                    </button>
                    <div className="menu-category-card-menu-wrap">
                      <button
                        type="button"
                        className="menu-category-menu-trigger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenCategoryActionId((prev) => (prev === category.id ? "" : category.id));
                        }}
                      >
                        ⋮
                      </button>
                      {openCategoryActionId === category.id && (
                        <div className="menu-category-menu">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategoryId(category.id);
                              setOpenCategoryActionId("");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setMenuError("");
                              setOpenCategoryActionId("");
                              try {
                                await apiFetch(`/menu/categories/${category.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ visible: category.visible === false })
                                });
                                await load();
                              } catch (err) {
                                setMenuError(err instanceof Error ? err.message : "Unable to update category.");
                              }
                            }}
                          >
                            {category.visible === false ? "Unhide" : "Hide"}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setMenuError("");
                              setOpenCategoryActionId("");
                              try {
                                await apiFetch("/menu/categories", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    name: `${category.name} Copy`,
                                    color: category.color || undefined,
                                    sortOrder: (category.sortOrder ?? 0) + 1,
                                    visible: category.visible ?? true
                                  })
                                });
                                await load();
                              } catch (err) {
                                setMenuError(err instanceof Error ? err.message : "Unable to duplicate category.");
                              }
                            }}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={async () => {
                              const ok = window.confirm("Delete this category? Groups and items must be moved first.");
                              if (!ok) return;
                              setMenuError("");
                              setOpenCategoryActionId("");
                              try {
                                await apiFetch(`/menu/categories/${category.id}`, { method: "DELETE" });
                                if (selectedCategoryId === category.id) {
                                  setSelectedCategoryId("");
                                }
                                if (categoryFilter === category.id) {
                                  setCategoryFilter("ALL");
                                }
                                await load();
                              } catch (err) {
                                setMenuError(err instanceof Error ? err.message : "Unable to delete category.");
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {category.color && (
                      <span
                        className="menu-category-card-color"
                        style={{ backgroundColor: category.color }}
                        aria-hidden="true"
                      />
                    )}
                    {category.visible === false && <span className="menu-category-hidden-pill">Hidden</span>}
                  </article>
                ))}
                {filteredCategoryCards.length === 0 && (
                  <div className="menu-categories-empty">
                    <p>No categories match this filter.</p>
                    <span>Try another search or use + Add Category.</span>
                  </div>
                )}
              </div>

              {selectedCategoryId && (
                <div className="menu-category-editor">
                  <h4>Edit Category</h4>
                  <div className="form-row">
                    <input
                      value={editCategory.name}
                      onChange={(e) => setEditCategory((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Name"
                    />
                    <input
                      value={editCategory.color}
                      onChange={(e) => setEditCategory((prev) => ({ ...prev, color: e.target.value }))}
                      placeholder="Color (#RRGGBB)"
                    />
                    <input
                      value={editCategory.sortOrder}
                      onChange={(e) => setEditCategory((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      placeholder="Sort"
                    />
                    <button
                      type="button"
                      onClick={() => setEditCategory((prev) => ({ ...prev, visible: !prev.visible }))}
                    >
                      {editCategory.visible ? "Visible" : "Hidden"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuError("");
                        try {
                          await apiFetch(`/menu/categories/${selectedCategoryId}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              name: editCategory.name,
                              color: editCategory.color || undefined,
                              sortOrder: editCategory.sortOrder ? Number(editCategory.sortOrder) : undefined,
                              visible: editCategory.visible
                            })
                          });
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to update category.");
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = window.confirm("Delete this category? Groups and items must be moved first.");
                        if (!ok) return;
                        setMenuError("");
                        try {
                          await apiFetch(`/menu/categories/${selectedCategoryId}`, { method: "DELETE" });
                          setSelectedCategoryId("");
                          if (categoryFilter === selectedCategoryId) {
                            setCategoryFilter("ALL");
                          }
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to delete category.");
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {menuSection === "groups" && (
        <section className="panel span-3 menu-groups-panel">
          <div className="menu-groups-layout">
            <div className="menu-groups-pages">
              <div className="menu-page-controls">
                <button
                  type="button"
                  className="terminal-btn ghost"
                  disabled={safePageIndex <= 0}
                  onClick={() => setGroupPageIndex((prev) => Math.max(0, prev - 2))}
                >
                  Prev
                </button>
                <span>Pages {safePageIndex + 1}-{Math.min(groupPageCount, safePageIndex + 2)} of {groupPageCount}</span>
                <button
                  type="button"
                  className="terminal-btn ghost"
                  disabled={safePageIndex + 1 >= groupPageCount}
                  onClick={() => setGroupPageIndex((prev) => Math.min(groupPageCount - 1, prev + 2))}
                >
                  Next
                </button>
              </div>
              <div className="menu-page-grid">
                <div className="menu-page">
                  <h4>Page {safePageIndex + 1}</h4>
                  <div className="menu-tile-grid">
                    {pageA.map((grp) => (
                      <button
                        key={grp.id}
                        type="button"
                        className={`menu-tile ${selectedGroupId === grp.id ? "active" : ""}`}
                        style={
                          groupColorMap.get(grp.categoryId)
                            ? ({ ["--tile-color" as string]: groupColorMap.get(grp.categoryId) } as Record<string, string>)
                            : undefined
                        }
                        onClick={() => setSelectedGroupId(grp.id)}
                      >
                        {grp.name}
                      </button>
                    ))}
                    {pageA.length === 0 && <p className="hint">No groups on this page.</p>}
                  </div>
                </div>
                <div className="menu-page">
                  <h4>Page {safePageIndex + 2}</h4>
                  <div className="menu-tile-grid">
                    {pageB.map((grp) => (
                      <button
                        key={grp.id}
                        type="button"
                        className={`menu-tile ${selectedGroupId === grp.id ? "active" : ""}`}
                        style={
                          groupColorMap.get(grp.categoryId)
                            ? ({ ["--tile-color" as string]: groupColorMap.get(grp.categoryId) } as Record<string, string>)
                            : undefined
                        }
                        onClick={() => setSelectedGroupId(grp.id)}
                      >
                        {grp.name}
                      </button>
                    ))}
                    {pageB.length === 0 && <p className="hint">No groups on this page.</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="menu-groups-sidebar">
              <h3>New Group</h3>
              <div className="form-row">
                <input
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  placeholder="Group name"
                />
                <select
                  value={newGroup.categoryId}
                  onChange={(e) => setNewGroup({ ...newGroup, categoryId: e.target.value })}
                >
                  <option value="">Category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newGroup.kitchenStationId}
                  onChange={(e) => setNewGroup({ ...newGroup, kitchenStationId: e.target.value })}
                >
                  <option value="">Station</option>
                  {kitchenStations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    setMenuError("");
                    if (!newGroup.name || !newGroup.categoryId) return;
                    try {
                      await apiFetch("/menu/groups", {
                        method: "POST",
                        body: JSON.stringify({
                          name: newGroup.name,
                          categoryId: newGroup.categoryId,
                          kitchenStationId: newGroup.kitchenStationId || undefined
                        })
                      });
                      setNewGroup({ name: "", categoryId: "", kitchenStationId: "" });
                      await load();
                    } catch (err) {
                      setMenuError(err instanceof Error ? err.message : "Unable to add group.");
                    }
                  }}
                >
                  Add
                </button>
              </div>
              {selectedGroupId && (
                <div className="menu-edit">
                  <h4>Edit Group</h4>
                  <div className="form-row">
                    <input
                      value={editGroup.name}
                      onChange={(e) => setEditGroup((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Name"
                    />
                    <select
                      value={editGroup.categoryId}
                      onChange={(e) => setEditGroup((prev) => ({ ...prev, categoryId: e.target.value }))}
                    >
                      <option value="">Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editGroup.kitchenStationId}
                      onChange={(e) => setEditGroup((prev) => ({ ...prev, kitchenStationId: e.target.value }))}
                    >
                      <option value="">Station</option>
                      {kitchenStations.map((station) => (
                        <option key={station.id} value={station.id}>
                          {station.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={editGroup.sortOrder}
                      onChange={(e) => setEditGroup((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      placeholder="Sort"
                    />
                    <button
                      type="button"
                      onClick={() => setEditGroup((prev) => ({ ...prev, visible: !prev.visible }))}
                    >
                      {editGroup.visible ? "Visible" : "Hidden"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuError("");
                        try {
                          await apiFetch(`/menu/groups/${selectedGroupId}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              name: editGroup.name,
                              categoryId: editGroup.categoryId || undefined,
                              sortOrder: editGroup.sortOrder ? Number(editGroup.sortOrder) : undefined,
                              visible: editGroup.visible,
                              kitchenStationId: editGroup.kitchenStationId || undefined
                            })
                          });
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to update group.");
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = window.confirm("Delete this group? Items must be moved first.");
                        if (!ok) return;
                        setMenuError("");
                        try {
                          await apiFetch(`/menu/groups/${selectedGroupId}`, { method: "DELETE" });
                          setSelectedGroupId("");
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to delete group.");
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {menuSection === "items" && (
        <section className="panel span-3 menu-items-panel">
          <div className="menu-items-layout">
            <div className="menu-items-sidebar">
              <h3>Menu Tree</h3>
              <div className="form-row">
                <select
                  value={itemFilter.categoryId}
                  onChange={(e) =>
                    setItemFilter((prev) => ({ ...prev, categoryId: e.target.value, groupId: "" }))
                  }
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="menu-tree">
                <button
                  type="button"
                  className={`tree-row root ${!itemFilter.groupId && !itemFilter.categoryId ? "active" : ""}`}
                  onClick={() => setItemFilter({ search: itemFilter.search, categoryId: "", groupId: "" })}
                >
                  <span>All Items</span>
                </button>
                {categories.map((cat) => {
                  const isExpanded = !!treeExpandedCategories[cat.id];
                  const catGroups = groups.filter((grp) => grp.categoryId === cat.id && grp.visible !== false);
                  return (
                    <div key={cat.id} className="tree-node">
                      <div className="tree-row">
                        <button
                          type="button"
                          className="tree-toggle"
                          onClick={() =>
                            setTreeExpandedCategories((prev) => ({ ...prev, [cat.id]: !isExpanded }))
                          }
                          aria-label={isExpanded ? "Collapse category" : "Expand category"}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                        <button
                          type="button"
                          className={`tree-label ${itemFilter.categoryId === cat.id ? "active" : ""}`}
                          onClick={() =>
                            setItemFilter((prev) => ({ ...prev, categoryId: cat.id, groupId: "" }))
                          }
                        >
                          {cat.name}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="tree-children">
                          {catGroups.length === 0 && <div className="tree-muted">No groups</div>}
                          {catGroups.map((grp) => {
                            const groupExpanded = !!treeExpandedGroups[grp.id];
                            const groupItems = (itemsByGroup[grp.id] || []).filter((item) =>
                              !itemFilter.search ? true : item.name.toLowerCase().includes(itemFilter.search.toLowerCase())
                            );
                            return (
                              <div key={grp.id} className="tree-node">
                                <div className="tree-row">
                                  <button
                                    type="button"
                                    className="tree-toggle"
                                    onClick={() =>
                                      setTreeExpandedGroups((prev) => ({ ...prev, [grp.id]: !groupExpanded }))
                                    }
                                    aria-label={groupExpanded ? "Collapse group" : "Expand group"}
                                  >
                                    {groupExpanded ? "▾" : "▸"}
                                  </button>
                                  <button
                                    type="button"
                                    className={`tree-label ${itemFilter.groupId === grp.id ? "active" : ""}`}
                                    onClick={() =>
                                      setItemFilter((prev) => ({
                                        ...prev,
                                        categoryId: grp.categoryId,
                                        groupId: grp.id
                                      }))
                                    }
                                  >
                                    {grp.name}
                                  </button>
                                </div>
                                {groupExpanded && (
                                  <div className="tree-children tree-items">
                                    {groupItems.length === 0 && <div className="tree-muted">No items</div>}
                                    {groupItems.map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        className={`tree-item ${selectedItemId === item.id ? "active" : ""}`}
                                        onClick={() => {
                                          setSelectedItemId(item.id);
                                          setItemEditorMode("edit");
                                          setItemFilter((prev) => ({
                                            ...prev,
                                            categoryId: item.categoryId || grp.categoryId,
                                            groupId: item.groupId || grp.id
                                          }));
                                          setTreeExpandedGroups((prev) => ({ ...prev, [grp.id]: true }));
                                          setTreeExpandedCategories((prev) => ({ ...prev, [cat.id]: true }));
                                        }}
                                      >
                                        {item.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="menu-items-grid">
              <div className="menu-items-toolbar">
                <input
                  value={itemFilter.search}
                  onChange={(e) => setItemFilter((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder="Search items"
                />
              </div>
              <div className="menu-tile-grid menu-item-grid">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`menu-tile menu-item-tile ${selectedItemId === item.id ? "active" : ""}`}
                    style={
                      item.color
                        ? ({ ["--tile-color" as string]: item.color } as Record<string, string>)
                        : undefined
                    }
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setItemEditorMode("edit");
                    }}
                  >
                    <span>{item.name}</span>
                    <small>${Number(item.price).toFixed(2)}</small>
                  </button>
                ))}
                {visibleItems.length === 0 && <p className="hint">No items match the filters.</p>}
              </div>
            </div>

            <div className="menu-items-editor">
              <div className="menu-editor-tabs">
                <button
                  type="button"
                  className={itemEditorMode === "new" ? "active" : ""}
                  onClick={() => {
                    setItemEditorMode("new");
                    setSelectedItemId("");
                  }}
                >
                  New Item
                </button>
                <button
                  type="button"
                  className={itemEditorMode === "edit" ? "active" : ""}
                  onClick={() => {
                    if (selectedItemId) setItemEditorMode("edit");
                  }}
                  disabled={!selectedItemId}
                >
                  Edit Item
                </button>
              </div>

              {itemEditorMode === "new" && (
                <>
                  <h3>New Item</h3>
                  <div className="form-row">
                    <input
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      placeholder="Item name"
                    />
                    <input
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                      placeholder="Price"
                    />
                    <input
                      value={newItem.barcode}
                      onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })}
                      placeholder="Barcode"
                    />
                    <input
                      type="color"
                      className="color-input"
                      value={newItem.color || "#2b3344"}
                      onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
                      title="Item color"
                    />
                    <select
                      value={newItem.categoryId}
                      onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                    >
                      <option value="">Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newItem.groupId}
                      onChange={(e) => setNewItem({ ...newItem, groupId: e.target.value })}
                    >
                      <option value="">Group</option>
                      {groups.map((grp) => (
                        <option key={grp.id} value={grp.id}>
                          {grp.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newItem.taxId}
                      onChange={(e) => setNewItem({ ...newItem, taxId: e.target.value })}
                    >
                      <option value="">Tax</option>
                      {taxes.map((tax) => (
                        <option key={tax.id} value={tax.id}>
                          {tax.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newItem.kitchenStationId || ""}
                      onChange={(e) => setNewItem({ ...newItem, kitchenStationId: e.target.value })}
                    >
                      <option value="">Station</option>
                      {kitchenStations.map((station) => (
                        <option key={station.id} value={station.id}>
                          {station.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuError("");
                        if (!newItem.name || !newItem.price) return;
                        try {
                          await apiFetch("/menu/items", {
                            method: "POST",
                            body: JSON.stringify({
                              name: newItem.name,
                              price: Number(newItem.price),
                              color: newItem.color || undefined,
                              categoryId: newItem.categoryId || undefined,
                              groupId: newItem.groupId || undefined,
                              taxId: newItem.taxId || undefined,
                              kitchenStationId: newItem.kitchenStationId || undefined,
                              barcode: newItem.barcode || undefined
                            })
                          });
                          setNewItem({ name: "", price: "", color: "", categoryId: "", groupId: "", taxId: "", kitchenStationId: "", barcode: "" });
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to add menu item.");
                        }
                      }}
                    >
                      Add
                    </button>
                  </div>
                </>
              )}

              {itemEditorMode === "edit" && (
                <>
                  <h3>Edit Item</h3>
                  {!selectedItemId && <p className="hint">Select an item to edit.</p>}
                  {selectedItemId && (
                <>
                  <div className="form-row">
                    <input
                      value={itemForm.name}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Name"
                    />
                    <input
                      value={itemForm.price}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, price: e.target.value }))}
                      placeholder="Price"
                    />
                    <input
                      value={itemForm.barcode}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, barcode: e.target.value }))}
                      placeholder="Barcode"
                    />
                    <input
                      type="color"
                      className="color-input"
                      value={itemForm.color || "#2b3344"}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, color: e.target.value }))}
                      title="Item color"
                    />
                    <select
                      value={itemForm.categoryId}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                    >
                      <option value="">Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={itemForm.groupId}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, groupId: e.target.value }))}
                    >
                      <option value="">Group</option>
                      {groups.map((grp) => (
                        <option key={grp.id} value={grp.id}>
                          {grp.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={itemForm.taxId}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, taxId: e.target.value }))}
                    >
                      <option value="">Tax</option>
                      {taxes.map((tax) => (
                        <option key={tax.id} value={tax.id}>
                          {tax.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={itemForm.kitchenStationId}
                      onChange={(e) => setItemForm((prev) => ({ ...prev, kitchenStationId: e.target.value }))}
                    >
                      <option value="">Station</option>
                      {kitchenStations.map((station) => (
                        <option key={station.id} value={station.id}>
                          {station.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setItemForm((prev) => ({ ...prev, visible: !prev.visible }))}
                    >
                      {itemForm.visible ? "Visible" : "Hidden"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuError("");
                        if (!selectedItemId) return;
                        try {
                          await apiFetch(`/menu/items/${selectedItemId}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              name: itemForm.name,
                              price: itemForm.price ? Number(itemForm.price) : undefined,
                              barcode: itemForm.barcode || undefined,
                              color: itemForm.color || undefined,
                              categoryId: itemForm.categoryId || undefined,
                              groupId: itemForm.groupId || undefined,
                              taxId: itemForm.taxId || undefined,
                              kitchenStationId: itemForm.kitchenStationId || undefined,
                              visible: itemForm.visible
                            })
                          });
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to update menu item.");
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedItemId) return;
                        const ok = window.confirm("Delete this item? Items with sales history cannot be deleted.");
                        if (!ok) return;
                        setMenuError("");
                        try {
                          await apiFetch(`/menu/items/${selectedItemId}`, { method: "DELETE" });
                          setSelectedItemId("");
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to delete menu item.");
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="panel-grid">
                    <div className="panel-sub">
                      <h4>Availability</h4>
                      <div className="form-row">
                        <select
                          value={newAvailability.dayOfWeek}
                          onChange={(e) =>
                            setNewAvailability((prev) => ({ ...prev, dayOfWeek: e.target.value }))
                          }
                        >
                          <option value="0">Sunday</option>
                          <option value="1">Monday</option>
                          <option value="2">Tuesday</option>
                          <option value="3">Wednesday</option>
                          <option value="4">Thursday</option>
                          <option value="5">Friday</option>
                          <option value="6">Saturday</option>
                        </select>
                        <input
                          value={newAvailability.startTime}
                          onChange={(e) =>
                            setNewAvailability((prev) => ({ ...prev, startTime: e.target.value }))
                          }
                          placeholder="Start"
                        />
                        <input
                          value={newAvailability.endTime}
                          onChange={(e) =>
                            setNewAvailability((prev) => ({ ...prev, endTime: e.target.value }))
                          }
                          placeholder="End"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/menu/items/${selectedItemId}/availability`, {
                              method: "POST",
                              body: JSON.stringify({
                                dayOfWeek: Number(newAvailability.dayOfWeek),
                                startTime: newAvailability.startTime,
                                endTime: newAvailability.endTime
                              })
                            });
                            const avail = await apiFetch(`/menu/items/${selectedItemId}/availability`);
                            setAvailability(avail);
                          }}
                        >
                          Add
                        </button>
                      </div>
                      <ul className="list">
                        {availability.map((slot) => (
                          <li key={slot.id}>
                            Day {slot.dayOfWeek} • {slot.startTime}-{slot.endTime}
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/menu/items/${selectedItemId}/availability/${slot.id}`, {
                                  method: "DELETE"
                                });
                                const avail = await apiFetch(`/menu/items/${selectedItemId}/availability`);
                                setAvailability(avail);
                              }}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="panel-sub">
                      <h4>Menu Recipe</h4>
                      <div className="form-row">
                        <select
                          value={newIngredient.inventoryItemId}
                          onChange={(e) =>
                            setNewIngredient((prev) => ({ ...prev, inventoryItemId: e.target.value }))
                          }
                        >
                          <option value="">Inventory item</option>
                          {inventoryItems.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.sku} • {inv.name}
                            </option>
                          ))}
                        </select>
                        <input
                          value={newIngredient.quantity}
                          onChange={(e) =>
                            setNewIngredient((prev) => ({ ...prev, quantity: e.target.value }))
                          }
                          placeholder="Qty per item"
                        />
                        <input
                          value={newIngredient.unit}
                          onChange={(e) =>
                            setNewIngredient((prev) => ({ ...prev, unit: e.target.value }))
                          }
                          placeholder="Unit"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!newIngredient.inventoryItemId || !newIngredient.quantity) return;
                            await apiFetch(`/menu/items/${selectedItemId}/ingredients`, {
                              method: "POST",
                              body: JSON.stringify({
                                inventoryItemId: newIngredient.inventoryItemId,
                                quantity: Number(newIngredient.quantity),
                                unit: newIngredient.unit || undefined
                              })
                            });
                            const ingredientList = await apiFetch(`/menu/items/${selectedItemId}/ingredients`);
                            setIngredients(ingredientList);
                            setNewIngredient({ inventoryItemId: "", quantity: "", unit: "" });
                          }}
                        >
                          Add
                        </button>
                      </div>
                      <ul className="list">
                        {ingredients.map((ingredient) => (
                          <li key={ingredient.id}>
                            {ingredient.inventoryItem?.name ?? ingredient.inventoryItemId} • {ingredient.quantity} {ingredient.unit ?? ""}
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/menu/items/${selectedItemId}/ingredients/${ingredient.id}`, {
                                  method: "DELETE"
                                });
                                const ingredientList = await apiFetch(`/menu/items/${selectedItemId}/ingredients`);
                                setIngredients(ingredientList);
                              }}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
                </>
              )}
            </div>
          </div>
        </section>
        )}

        {["prices", "forced"].includes(menuSection) && (
        <section className="panel span-2">
          <h3>Item Details</h3>
          {menuSection === "prices" && (
            <p className="hint">Select an item, then configure auto prices below.</p>
          )}
          {menuSection === "forced" && (
            <p className="hint">Select an item, then assign required modifier groups below.</p>
          )}
          {(menuSection === "prices" || menuSection === "forced") && (
            <div className="form-row">
              <select value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)}>
                <option value="">Select item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedItemId && (
            <div className="panel-grid">
              {menuSection === "forced" && (
              <div className="panel-sub">
                <h4>Forced Modifier Groups</h4>
                <div className="form-row">
                  <select
                    value={newLink.groupId}
                    onChange={(e) => setNewLink((prev) => ({ ...prev, groupId: e.target.value }))}
                  >
                    <option value="">Group</option>
                    {modifierGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newLink.minRequired}
                    onChange={(e) =>
                      setNewLink((prev) => ({ ...prev, minRequired: e.target.value }))
                    }
                    placeholder="Min"
                  />
                  <input
                    value={newLink.maxAllowed}
                    onChange={(e) =>
                      setNewLink((prev) => ({ ...prev, maxAllowed: e.target.value }))
                    }
                    placeholder="Max"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newLink.groupId) return;
                      await apiFetch(`/menu/items/${selectedItemId}/modifier-groups`, {
                        method: "POST",
                        body: JSON.stringify({
                          groupId: newLink.groupId,
                          minRequired: newLink.minRequired ? Number(newLink.minRequired) : undefined,
                          maxAllowed: newLink.maxAllowed ? Number(newLink.maxAllowed) : undefined
                        })
                      });
                      const links = await apiFetch(`/menu/items/${selectedItemId}/modifier-groups`);
                      setItemModifierLinks(links);
                      setNewLink({ groupId: "", minRequired: "", maxAllowed: "" });
                    }}
                  >
                    Link
                  </button>
                </div>
                <ul className="list">
                  {itemModifierLinks.map((link) => (
                    <li key={link.id}>
                      {link.group.name} • min {link.minRequired ?? 0} • max {link.maxAllowed ?? 0}
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/menu/items/${selectedItemId}/modifier-groups/${link.id}`, {
                            method: "DELETE"
                          });
                          const links = await apiFetch(`/menu/items/${selectedItemId}/modifier-groups`);
                          setItemModifierLinks(links);
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              )}
              {menuSection === "prices" && (
              <div className="panel-sub">
                <h4>Item Auto Prices</h4>
                <div className="form-row">
                  <input
                    value={itemPrices.DEFAULT}
                    onChange={(e) => setItemPrices((prev) => ({ ...prev, DEFAULT: e.target.value }))}
                    placeholder="Default"
                  />
                  <input
                    value={itemPrices.DINE_IN}
                    onChange={(e) => setItemPrices((prev) => ({ ...prev, DINE_IN: e.target.value }))}
                    placeholder="Dine In"
                  />
                  <input
                    value={itemPrices.TAKEOUT}
                    onChange={(e) => setItemPrices((prev) => ({ ...prev, TAKEOUT: e.target.value }))}
                    placeholder="Takeout"
                  />
                  <input
                    value={itemPrices.DELIVERY}
                    onChange={(e) => setItemPrices((prev) => ({ ...prev, DELIVERY: e.target.value }))}
                    placeholder="Delivery"
                  />
                  <input
                    value={itemPrices.BAR}
                    onChange={(e) => setItemPrices((prev) => ({ ...prev, BAR: e.target.value }))}
                    placeholder="Bar"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuError("");
                      const types = ["DEFAULT", "DINE_IN", "TAKEOUT", "DELIVERY", "BAR"] as const;
                      for (const type of types) {
                        const value = itemPrices[type];
                        if (!value) continue;
                        await apiFetch(`/menu/items/${selectedItemId}/prices`, {
                          method: "POST",
                          body: JSON.stringify({ priceType: type, price: Number(value) })
                        });
                      }
                    }}
                  >
                    Save Prices
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selectedItemId) return;
                      const types = ["DEFAULT", "DINE_IN", "TAKEOUT", "DELIVERY", "BAR"] as const;
                      for (const type of types) {
                        if (!itemPrices[type]) continue;
                        try {
                          await apiFetch(`/menu/items/${selectedItemId}/prices/${type}`, {
                            method: "DELETE"
                          });
                        } catch {
                          // ignore missing price
                        }
                      }
                      setItemPrices({ DEFAULT: "", DINE_IN: "", TAKEOUT: "", DELIVERY: "", BAR: "" });
                    }}
                  >
                    Clear Prices
                  </button>
                </div>
              </div>
              )}
            </div>
          )}
        </section>
        )}

        {menuSection === "taxes" && (
        <section className="panel">
          <h3>Taxes</h3>
          <div className="form-row">
            <input
              value={newTax.name}
              onChange={(e) => setNewTax({ ...newTax, name: e.target.value })}
              placeholder="Tax name"
            />
            <input
              value={newTax.rate}
              onChange={(e) => setNewTax({ ...newTax, rate: e.target.value })}
              placeholder="Rate (0.085)"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newTax.name || !newTax.rate) return;
                await apiFetch("/taxes", {
                  method: "POST",
                  body: JSON.stringify({ name: newTax.name, rate: Number(newTax.rate) })
                });
                setNewTax({ name: "", rate: "" });
                await load();
              }}
            >
              Add
            </button>
          </div>
          <ul className="list">
            {taxes.map((tax) => (
              <li key={tax.id}>{tax.name} • {Number(tax.rate).toFixed(4)}</li>
            ))}
          </ul>
        </section>
        )}

        {menuSection === "taxes" && (
        <section className="panel">
          <h3>Discounts</h3>
          <div className="form-row">
            <input
              value={newDiscount.name}
              onChange={(e) => setNewDiscount({ ...newDiscount, name: e.target.value })}
              placeholder="Discount name"
            />
            <select
              value={newDiscount.type}
              onChange={(e) => setNewDiscount({ ...newDiscount, type: e.target.value })}
            >
              <option value="PERCENT">Percent</option>
              <option value="FIXED">Fixed</option>
            </select>
            <input
              value={newDiscount.value}
              onChange={(e) => setNewDiscount({ ...newDiscount, value: e.target.value })}
              placeholder="Value"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newDiscount.name || !newDiscount.value) return;
                await apiFetch("/discounts", {
                  method: "POST",
                  body: JSON.stringify({
                    name: newDiscount.name,
                    type: newDiscount.type,
                    value: Number(newDiscount.value)
                  })
                });
                setNewDiscount({ name: "", type: "PERCENT", value: "" });
                await load();
              }}
            >
              Add
            </button>
          </div>
          <ul className="list">
            {discounts.map((disc) => (
              <li key={disc.id}>{disc.name} • {disc.type} {disc.value}</li>
            ))}
          </ul>
        </section>
        )}

        {menuSection === "modifiers" && (
        <section className="panel span-3 menu-modifiers-panel">
          <div className="menu-modifiers-layout">
            <div className="menu-modifiers-sidebar">
              <h3>Modifier Groups</h3>
              <div className="form-row">
                <input
                  value={newModifierGroup}
                  onChange={(e) => setNewModifierGroup(e.target.value)}
                  placeholder="Modifier group"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setMenuError("");
                    if (!newModifierGroup) return;
                    try {
                      await apiFetch("/modifier-groups", {
                        method: "POST",
                        body: JSON.stringify({ name: newModifierGroup })
                      });
                      setNewModifierGroup("");
                      await load();
                    } catch (err) {
                      setMenuError(err instanceof Error ? err.message : "Unable to add modifier group.");
                    }
                  }}
                >
                  Add
                </button>
              </div>
              <div className="menu-list">
                {modifierGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={selectedModifierGroupId === group.id ? "active" : ""}
                    onClick={() => setSelectedModifierGroupId(group.id)}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="menu-modifiers-grid">
              <h3>Modifiers</h3>
              <div className="form-row">
                <input
                  value={newModifier.name}
                  onChange={(e) => setNewModifier({ ...newModifier, name: e.target.value })}
                  placeholder="Modifier name"
                />
                <input
                  value={newModifier.price}
                  onChange={(e) => setNewModifier({ ...newModifier, price: e.target.value })}
                  placeholder="Price"
                />
                <select
                  value={newModifier.groupId}
                  onChange={(e) => setNewModifier({ ...newModifier, groupId: e.target.value })}
                >
                  <option value="">Group</option>
                  {modifierGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    setMenuError("");
                    if (!newModifier.name || !newModifier.price || !newModifier.groupId) return;
                    try {
                      await apiFetch("/modifiers", {
                        method: "POST",
                        body: JSON.stringify({
                          name: newModifier.name,
                          price: Number(newModifier.price),
                          groupId: newModifier.groupId
                        })
                      });
                      setNewModifier({ name: "", price: "", groupId: "" });
                      await load();
                    } catch (err) {
                      setMenuError(err instanceof Error ? err.message : "Unable to add modifier.");
                    }
                  }}
                >
                  Add
                </button>
              </div>
              <div className="menu-tile-grid">
                {modifiersForGroup.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    className={`menu-tile menu-modifier-tile ${selectedModifierId === mod.id ? "active" : ""}`}
                    onClick={() => setSelectedModifierId(mod.id)}
                  >
                    <span>{mod.name}</span>
                    <small>${Number(mod.price).toFixed(2)}</small>
                  </button>
                ))}
                {modifiersForGroup.length === 0 && <p className="hint">No modifiers in this group.</p>}
              </div>
            </div>

            <div className="menu-modifiers-editor">
              {selectedModifierGroupId && (
                <div className="menu-edit">
                  <h4>Edit Modifier Group</h4>
                  <div className="form-row">
                    <input
                      value={editModifierGroup.name}
                      onChange={(e) => setEditModifierGroup((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Name"
                    />
                    <input
                      value={editModifierGroup.minRequired}
                      onChange={(e) => setEditModifierGroup((prev) => ({ ...prev, minRequired: e.target.value }))}
                      placeholder="Min"
                    />
                    <input
                      value={editModifierGroup.maxAllowed}
                      onChange={(e) => setEditModifierGroup((prev) => ({ ...prev, maxAllowed: e.target.value }))}
                      placeholder="Max"
                    />
                    <input
                      value={editModifierGroup.sortOrder}
                      onChange={(e) => setEditModifierGroup((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      placeholder="Sort"
                    />
                    <button
                      type="button"
                      onClick={() => setEditModifierGroup((prev) => ({ ...prev, active: !prev.active }))}
                    >
                      {editModifierGroup.active ? "Active" : "Inactive"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuError("");
                        try {
                          await apiFetch(`/modifier-groups/${selectedModifierGroupId}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              name: editModifierGroup.name,
                              minRequired: editModifierGroup.minRequired ? Number(editModifierGroup.minRequired) : undefined,
                              maxAllowed: editModifierGroup.maxAllowed ? Number(editModifierGroup.maxAllowed) : undefined,
                              sortOrder: editModifierGroup.sortOrder ? Number(editModifierGroup.sortOrder) : undefined,
                              active: editModifierGroup.active
                            })
                          });
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to update modifier group.");
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = window.confirm("Delete this modifier group? Modifiers in the group will be removed.");
                        if (!ok) return;
                        setMenuError("");
                        try {
                          await apiFetch(`/modifier-groups/${selectedModifierGroupId}`, { method: "DELETE" });
                          setSelectedModifierGroupId("");
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to delete modifier group.");
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {selectedModifierId && (
                <div className="menu-edit">
                  <h4>Edit Modifier</h4>
                  <div className="form-row">
                    <input
                      value={editModifier.name}
                      onChange={(e) => setEditModifier((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Name"
                    />
                    <input
                      value={editModifier.price}
                      onChange={(e) => setEditModifier((prev) => ({ ...prev, price: e.target.value }))}
                      placeholder="Price"
                    />
                    <select
                      value={editModifier.groupId}
                      onChange={(e) => setEditModifier((prev) => ({ ...prev, groupId: e.target.value }))}
                    >
                      <option value="">Group</option>
                      {modifierGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={editModifier.sortOrder}
                      onChange={(e) => setEditModifier((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      placeholder="Sort"
                    />
                    <button
                      type="button"
                      onClick={() => setEditModifier((prev) => ({ ...prev, active: !prev.active }))}
                    >
                      {editModifier.active ? "Active" : "Inactive"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setMenuError("");
                        try {
                          await apiFetch(`/modifiers/${selectedModifierId}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              name: editModifier.name,
                              price: editModifier.price ? Number(editModifier.price) : undefined,
                              groupId: editModifier.groupId || undefined,
                              sortOrder: editModifier.sortOrder ? Number(editModifier.sortOrder) : undefined,
                              active: editModifier.active
                            })
                          });
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to update modifier.");
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = window.confirm("Delete this modifier?");
                        if (!ok) return;
                        setMenuError("");
                        try {
                          await apiFetch(`/modifiers/${selectedModifierId}`, { method: "DELETE" });
                          setSelectedModifierId("");
                          await load();
                        } catch (err) {
                          setMenuError(err instanceof Error ? err.message : "Unable to delete modifier.");
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {menuSection === "stations" && (
        <section className="panel">
          <h3>Kitchen Stations</h3>
          <div className="form-row">
            <input
              value={newKitchenStation.name}
              onChange={(e) => setNewKitchenStation((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Station name"
            />
            <input
              value={newKitchenStation.printerId}
              onChange={(e) => setNewKitchenStation((prev) => ({ ...prev, printerId: e.target.value }))}
              placeholder="Printer ID (device bridge)"
            />
            <button
              type="button"
              onClick={async () => {
                setMenuError("");
                if (!newKitchenStation.name) return;
                try {
                  await apiFetch("/kitchen-stations", {
                    method: "POST",
                    body: JSON.stringify({
                      name: newKitchenStation.name,
                      printerId: newKitchenStation.printerId || undefined
                    })
                  });
                  setNewKitchenStation({ name: "", printerId: "" });
                  await load();
                } catch (err) {
                  setMenuError(err instanceof Error ? err.message : "Unable to add kitchen station.");
                }
              }}
            >
              Add
            </button>
          </div>
          <ul className="list">
            {kitchenStations.map((station) => (
              <li key={station.id}>
                {station.name} {station.printerId ? `• ${station.printerId}` : ""}
              </li>
            ))}
          </ul>
        </section>
        )}

      </div>
      {menuError && <p className="hint">{menuError}</p>}
    </div>
  );
}
