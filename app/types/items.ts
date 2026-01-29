/**
 * Schema from Data:Crafting_Recipes.json — one object per crafted item.
 */
export interface CraftingRecipe {
  CraftedItem: string;
  Crafter: string;
  Workshop: string | null;
  Workshop2?: string | null;
  CraftedQuantity: string;
  SourceItem: string[];
  SourceQuantity: number[];
}
