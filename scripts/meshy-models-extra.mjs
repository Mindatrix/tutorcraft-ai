// Các món bạn không tìm được để tải. Tên = asset id trong content/asset_usage_v2.json (có hậu tố số khi cần nhiều mẫu).
// dir = thư mục con trong ~/Documents/3D_tutorcraft nơi file sẽ được lưu.
// faces = số mặt mục tiêu (đồ nhỏ để thấp cho nhẹ). group = camp | fishing | survival (dùng với --group).
const camp = (faces, prompt) => ({ group: 'camp', dir: 'camp', faces, prompt });
const fish = (faces, prompt) => ({ group: 'fishing', dir: 'fishing', faces, prompt });
const surv = (faces, prompt) => ({ group: 'survival', dir: 'survival', faces, prompt });

export const EXTRA = {
  // ---------- Summer Camp ----------
  camp_fire_starter: camp(1500, 'fire starter kit: a steel striker bar with a small flint rock and a bundle of dry tinder on a wooden board'),
  camp_grill: camp(2500, 'round metal camping grill rack with four short legs and a wooden handle'),
  camp_pan: camp(2000, 'cast iron camping frying pan with a long wooden handle, slightly worn'),
  camp_skewer_meat: camp(1500, 'long wooden skewer with four chunks of grilled meat and a little char'),
  camp_skewer_fish: camp(1500, 'long wooden skewer through a whole small grilled river fish, golden brown'),
  camp_skewer_veg: camp(1500, 'long wooden skewer with colorful vegetables: pepper, onion, mushroom, tomato'),

  // ---------- River Fishing ----------
  fish_rod_fiberglass: fish(2500, 'fishing rod with a white and green fiberglass pole, blue spinning reel, cork handle, intermediate tier'),
  fish_rod_carbon: fish(2500, 'sleek black carbon fiber fishing rod with silver guides, matte black reel, red accents, advanced tier'),
  fish_rod_gold: fish(3000, 'legendary golden fishing rod with glowing gold pole, jeweled reel and sparkling handle, top tier'),
  fish_record_board: fish(2500, 'wooden record board for fishing contest, painted planks with a ruler along the edge and hooks for hanging fish, no text'),
  fish_scale: fish(2000, 'hanging spring fish scale with a round dial, hook at the bottom and a brass ring on top, no numbers'),
  fish_boat_chair: fish(2500, 'small folding wooden chair with a canvas seat made for sitting in a boat'),
  fish_rod_holder: fish(2000, 'wooden rod holder stand with two forked notches that holds fishing rods at an angle, sunk into a short post'),
  fish_dock_lamp: fish(2500, 'small wooden post lantern for a dock, warm glowing glass lamp on top, rope wrapped around the post'),
  fish_floating_dock: fish(4000, 'small floating wooden dock platform on blue plastic barrels with a rope and a rope cleat, square shape, wide enough to stand on'),
  fish_climbing_perch: fish(3000, 'climbing perch fish (ca ro dong): small oval brown-olive freshwater fish with a dark spot near the gill and spiny fins'),
  fish_grass_carp: fish(3000, 'grass carp fish (ca tram co): long round olive-green body with light belly, large scales, no whiskers'),
  fish_crucian: fish(3000, 'crucian carp fish (ca diec): deep golden-silver oval body, one long dorsal fin, no whiskers'),
  fish_sheatfish: fish(3500, 'sheatfish catfish (ca nheo): long flat head, wide mouth with long whiskers, smooth olive-grey scaleless body with long anal fin'),

  // ---------- River Survival ----------
  surv_stake_1: surv(1500, 'thick wooden stake post, rough cut, rounded top, slightly weathered, for a camp pen'),
  surv_stake_2: surv(1500, 'thick wooden stake post with a carved notch near the top and a pointed base'),
  surv_stake_3: surv(1500, 'tall wooden stake post with a metal band and a hook, weathered'),
  surv_stake_4: surv(1500, 'short wooden stake post split at the top, dark wet wood'),
  surv_rope_cut: surv(1800, 'two pieces of a cut hemp rope with frayed ends lying apart'),
  surv_sharp_rock: surv(1500, 'flat sharp-edged grey flint stone with a chipped cutting edge, for cutting rope'),
  surv_rival_tent_2: surv(6000, 'dark charcoal and black pup tent with a small triangular door, tent poles and stakes, rival camp'),
  surv_flag: surv(2000, 'tall wooden flag pole with a dark red cloth flag waving, rival team banner, no emblem'),
  surv_crate_1: surv(1500, 'wooden supply crate with iron corners, plain planks, closed lid'),
  surv_crate_2: surv(1500, 'open wooden crate with straw and a few cloth bundles inside'),
  surv_crate_3: surv(1500, 'stacked pair of small wooden crates tied with rope'),
  surv_crate_4: surv(1500, 'dark painted wooden crate with a rope handle and a latch'),
  surv_barrel_1: surv(1800, 'wooden barrel with three iron hoops'),
  surv_barrel_2: surv(1800, 'rusty metal oil drum, dark green, dented, with ridges'),
  surv_barrel_3: surv(1800, 'blue metal drum with a black cap and a worn stripe'),
  surv_spring: surv(6000, 'small clean natural spring with clear blue water bubbling out of rocks into a stone pool, mossy edges, tiny diorama'),
  surv_binoculars_2: surv(2500, 'compact black rubber binoculars with a green strap, modern'),
  surv_binoculars_3: surv(2500, 'brass telescope spyglass, extended, with leather grip'),
  surv_flashlight_2: surv(2000, 'yellow plastic camping flashlight with a rubber grip and a wide lens'),
  surv_flashlight_3: surv(2000, 'old red metal lantern flashlight with a handle and square glass front'),
  surv_pointed_stone_1: surv(1200, 'pointed stone shaped like a spearhead, grey granite, rough surface'),
  surv_pointed_stone_2: surv(1200, 'tall thin pointed rock shard, white quartz with a sharp tip'),
  surv_pointed_stone_3: surv(1200, 'dark volcanic obsidian-like pointed stone with a glossy edge'),
  surv_trap_rope: surv(2500, 'rope snare trap: a loop of rope on the ground tied to a bent branch, set between two small stakes'),
  surv_trap_thorn: surv(2500, 'wooden board covered with sharp thorn spikes lying flat in leaves, a warning trap, not gory'),
  surv_tripwire: surv(2000, 'thin string tripwire tied between two small posts with a little bell hanging in the middle'),
  surv_letter_1: surv(1500, 'rolled secret letter paper scroll tied with a red string, aged parchment, no text'),
  surv_letter_2: surv(1500, 'folded old letter sealed with red wax, tan parchment, no text'),
};
