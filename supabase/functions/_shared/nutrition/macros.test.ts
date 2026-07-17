import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { ATWATER, macroFloorKcal, macrosForTarget } from "./macros.ts";
import { testConfig } from "./nutritionConfig.fixture.ts";

const cfg = testConfig();

Deno.test("ATWATER: costanti fisiche 4/4/9 nell'unico punto nominato", () => {
  assertEquals(ATWATER, { protein_kcal_per_g: 4, carb_kcal_per_g: 4, fat_kcal_per_g: 9 });
});

Deno.test("pavimento derivato: cut 80 kg → 1416; maintain 80 kg → 1224", () => {
  // cut: (2.3*4 + 0.5*9 + 1*4) * 80 = 17.7 * 80
  assertAlmostEquals(macroFloorKcal(cfg, "cut", 80), 1416, 1e-9);
  // maintain: (1.7*4 + 0.5*9 + 1*4) * 80 = 15.3 * 80
  assertAlmostEquals(macroFloorKcal(cfg, "maintain", 80), 1224, 1e-9);
});

Deno.test("macro cut 80 kg @2200 → P184 F49 C256, kcal ricostruite entro 2", () => {
  const m = macrosForTarget(cfg, "cut", 80, 2200);
  assertEquals(m, { protein_g: 184, fat_g: 49, carb_g: 256 });
  const kcal =
    m.protein_g * ATWATER.protein_kcal_per_g +
    m.fat_g * ATWATER.fat_kcal_per_g +
    m.carb_g * ATWATER.carb_kcal_per_g;
  if (Math.abs(kcal - 2200) > 2) throw new Error(`ricostruzione kcal fuori tolleranza: ${kcal}`);
});

Deno.test("fat_min vince quando la quota fat_pct scenderebbe sotto: maintain 80 kg @1224", () => {
  // fat_pct: 0.25*1224/9 = 34 g < fat_min 0.5*80 = 40 g
  const m = macrosForTarget(cfg, "maintain", 80, 1224);
  assertEquals(m.fat_g, 40);
  assertEquals(m.protein_g, 136); // 1.7*80
});
