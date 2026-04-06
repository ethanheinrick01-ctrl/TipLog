export const TipOutColors: Record<string, string> = {
  oyster: '#FF6B6B',
  bar: '#4ECDC4',
  busser: '#FFE66D',
  expo: '#95E1D3',
  host: '#F38181',
  foodRunner: '#AA96DA',
  support: '#FCBAD3',
  other: '#A0A0A0',
};

export const Colors = {
  // Surface hierarchy — darkness as the native medium (Linear)
  bg: '#08090a',               // Marketing Black — deepest canvas
  surface: '#0f1011',          // Panel Dark — sidebars, tab bars
  card: '#191a1b',             // Level 3 — cards, dropdowns, elevated surfaces
  elevated: '#28282c',         // Secondary Surface — hover states, lightest dark

  // Borders — semi-transparent white, never solid dark on dark
  border: 'rgba(255,255,255,0.08)',     // Standard card/input border
  borderSubtle: 'rgba(255,255,255,0.05)', // Subtle dividers

  // Brand & Accent — indigo-violet is the ONLY chromatic color
  accent: '#5e6ad2',           // Brand Indigo — CTA button backgrounds
  accentActive: '#7170ff',     // Accent Violet — active states, selected items
  accentHover: '#828fff',      // Accent Hover — lighter variant
  accentSoft: 'rgba(94,106,210,0.15)', // Soft tint — today highlight, selections

  // Text hierarchy
  textPrimary: '#f7f8f8',      // Near-white — default, headings
  textSecondary: '#d0d6e0',    // Silver-gray — body, descriptions
  textMuted: '#8a8f98',        // Tertiary — placeholders, metadata
  textSubtle: '#62666d',       // Quaternary — timestamps, disabled

  // Status — only for semantic indicators, not decoration
  success: '#27a644',
  successEmph: '#10b981',
  error: '#FF3B30',
  warning: '#FF9500',

  // Semantic cash vs credit (financial tracking)
  cash: '#27a644',
  credit: '#7170ff',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Linear border-radius scale
export const Radius = {
  micro: 2,   // Inline badges, toolbar buttons
  sm: 6,      // Buttons, inputs, functional elements
  md: 8,      // Cards, dropdowns, popovers
  lg: 12,     // Panels, featured cards, section containers
  xl: 22,     // Large panel elements
  full: 9999, // Chips, filter pills, status tags
};

// Linear typography scale (Inter Variable)
export const FontSize = {
  xs: 11,   // Micro — tiny labels
  sm: 13,   // Caption — metadata, timestamps
  md: 15,   // Small — secondary body
  lg: 16,   // Body — standard reading text
  xl: 20,   // Heading 3 — feature titles, card headers
  xxl: 24,  // Heading 2 — sub-section headings
  hero: 32, // Heading 1 — major section titles
};
