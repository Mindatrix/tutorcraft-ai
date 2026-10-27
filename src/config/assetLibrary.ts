import catalog from '../../content/asset_catalog.json';
import aliasFile from '../../content/asset_aliases.json';
import { resolveAsset } from '../engine/assetLoader';

// The 3D model library (content/asset_catalog.json, built by scripts/build-asset-catalog.mjs).
// Files live OUTSIDE the repo (~/Documents/3D_tutorcraft, 7.9 GB raw) and are served from:
//   NEXT_PUBLIC_ASSET_BASE_URL/web/<file>  — optimized (high)
//   NEXT_PUBLIC_ASSET_BASE_URL/low/<file>  — low variant for weak phones
//   NEXT_PUBLIC_ASSET_BASE_URL/mid/<file>  — ~5 k triangle avatars (characters, dinosaurs, critters):
//                                             the middle level of detail for classmates further away
// In development the base defaults to /dev-assets (app/dev-assets/[...path]/route.ts serves the
// local library). In production it must point at a CDN (see docs/operations.md); until then
// every model URL 404s and the scenes keep their code-built (procedural) models.

export type AssetQuality = 'high' | 'low' | 'mid';

/** Models that also exist as a ~5 k triangle "mid" file (avatar level of detail). */
export const hasMidVariant = (file: string) => /^(characters|dino\/(khung_long|thu_nho))\//.test(file);

export interface LibraryAsset {
  id: string;
  file: string;
  scope: 'game' | 'shared';
  game: string | null;
  games?: string[];
  mb_web: number | null;
  mb_low?: number | null;
  mb_raw?: number | null;
  tris_web?: number | null;
  tris_low?: number | null;
  tris_fill?: number | null;
  tris_fill_low?: number | null;
}

export const ASSET_LIBRARY: LibraryAsset[] = catalog as LibraryAsset[];
const BY_ID = new Map(ASSET_LIBRARY.map((a) => [a.id, a]));
/** Scenario ids that point at another model while the right one is being made. */
export const ASSET_ALIASES: Record<string, { to?: string; file?: string; note?: string }> = Object.fromEntries(
  Object.entries(aliasFile as Record<string, unknown>).filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object'),
) as Record<string, { to?: string; file?: string; note?: string }>;

/** Built in code (shader water, vector 2D sprites, procedural hats): a decision, not a gap. */
export const PROCEDURAL = 'procedural' as const;

export function assetBase(): string {
  return (process.env.NEXT_PUBLIC_ASSET_BASE_URL || '/dev-assets').replace(/\/$/, '');
}

/** Exact id, alias target, or the base variant of an id family ("tree" → "tree_1"). */
export function libraryAsset(id: string): LibraryAsset | null {
  return resolveAsset(id, ASSET_LIBRARY, ASSET_ALIASES, BY_ID) as LibraryAsset | null;
}

/**
 * URL of a library model. An id that is not in the catalog yields a placeholder string that
 * isUnfilled() reports (the manifest test lists it) — never a crash in the browser.
 */
export function lib(id: string, quality: AssetQuality = 'high'): string {
  const a = libraryAsset(id);
  if (!a) return `[ĐIỀN TẠI ĐÂY: model "${id}" chưa có trong danh mục]`;
  const folder = quality === 'mid' ? (hasMidVariant(a.file) ? 'mid' : 'low') : quality === 'low' ? 'low' : 'web';
  return `${assetBase()}/${folder}/${a.file}`;
}

export type HdriSize = '2k' | '1k';

/**
 * Sky image (HDRI, Poly Haven CC0). The 1K file is small and ships in /public: phones use it, and so
 * does everyone when the 2K one cannot be loaded. The 2K file (4–7 MB each) stays out of git, next to
 * the model library: NEXT_PUBLIC_ASSET_BASE_URL/hdri/… (dev: ~/Documents/3D_tutorcraft/hdri).
 */
export function hdri(key: string, size: HdriSize = '2k'): string {
  return size === '1k' ? `/assets/hdri/river_${key}_1k.hdr` : `${assetBase()}/hdri/river_${key}_2k.hdr`;
}

/** The same sky in another size ("river_day_2k" ⇄ "river_day_1k"); other URLs pass through. */
export function hdriSize(url: string, size: HdriSize): string {
  const m = /river_([a-z]+)_[12]k\.hdr$/.exec(url);
  return m ? hdri(m[1], size) : url;
}

/** Same model, other quality: "/…/web/x.glb" ⇄ "/…/low/x.glb" ⇄ "/…/mid/x.glb" (mid only where it exists). */
export function withQuality(url: string, quality: AssetQuality): string {
  const file = url.replace(/^.*\/(web|low|mid)\//, '');
  const folder = quality === 'mid' ? (hasMidVariant(file) ? 'mid' : 'low') : quality === 'low' ? 'low' : 'web';
  return url.replace(/\/(web|low|mid)\//, `/${folder}/`);
}
