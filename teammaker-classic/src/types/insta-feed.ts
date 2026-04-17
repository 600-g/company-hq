export type TemplateId = 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06';

export type PaletteKey =
  | 'mono-light'
  | 'mono-dark'
  | 'warm-cream'
  | 'ocean-blue'
  | 'blush-pink'
  | 'forest';

export interface PaletteConfig {
  background: string;
  text: string;
  accent: string;
}

export const PALETTES: Record<PaletteKey, PaletteConfig> = {
  'mono-light': { background: '#FAFAFA', text: '#111111', accent: '#000000' },
  'mono-dark': { background: '#111111', text: '#FFFFFF', accent: '#FFFFFF' },
  'warm-cream': { background: '#F5EFE6', text: '#3D2B1F', accent: '#C8956C' },
  'ocean-blue': { background: '#EAF3FB', text: '#1A3A5C', accent: '#2B7FE0' },
  'blush-pink': { background: '#FDF0F3', text: '#4A1528', accent: '#E87D9B' },
  forest: { background: '#EAF1EA', text: '#1E3A1E', accent: '#4A9B5F' },
};

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  paletteName: string;
  defaultPalette: PaletteKey;
}

export const TEMPLATES: TemplateDefinition[] = [
  { id: 'T01', name: 'Minimal Clean', paletteName: 'Mono Light', defaultPalette: 'mono-light' },
  { id: 'T02', name: 'Bold Headline', paletteName: 'Mono Dark', defaultPalette: 'mono-dark' },
  { id: 'T03', name: 'Warm Story', paletteName: 'Warm Cream', defaultPalette: 'warm-cream' },
  { id: 'T04', name: 'Ocean Frame', paletteName: 'Ocean Blue', defaultPalette: 'ocean-blue' },
  { id: 'T05', name: 'Blush Grid', paletteName: 'Blush Pink', defaultPalette: 'blush-pink' },
  { id: 'T06', name: 'Forest Quote', paletteName: 'Forest', defaultPalette: 'forest' },
];

export type AppStep = 1 | 2 | 3 | 4;

export interface FeedState {
  selectedTemplate: TemplateId | null;
  imageFile: File | null;
  imageUrl: string | null;
  headline: string;
  subCopy: string;
  palette: PaletteKey;
  showLogo: boolean;
  logoText: string;
  step: AppStep;
}
