// constants/index.ts
export const COLORS = {
    // Primary palette
    primary: '#FF6B35',        // Electric orange — CTAs, highlights
    primaryDark: '#E55A26',    // Darker orange for pressed states
    primaryLight: '#FF8C5A',   // Lighter orange for subtle accents
  
    // Base
    background: '#0A0E1A',     // Deep space navy — main background
    surface: '#141828',        // Slightly lighter — cards, inputs
    surfaceHigh: '#1E2438',    // Elevated surfaces — modals, sheets
  
    // Text
    textPrimary: '#FFFFFF',
    textSecondary: '#8892A4',  // Muted — labels, placeholders
    textTertiary: '#4A5568',   // Very muted — dividers, disabled
  
    // Semantic
    success: '#00D9A3',        // Teal green
    error: '#FF4757',          // Soft red
    warning: '#FFB830',        // Amber
    info: '#3B82F6',           // Blue
  
    // Borders
    border: '#1E2438',
    borderLight: '#2A3347',
  
    white: '#FFFFFF',
    black: '#000000',
  };
  
  export const SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  };
  
  export const RADIUS = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  };
  
  export const DASHER_SEARCH_RADIUS_KM = 5;
  // How many orders a student can have in progress at once. Keep in sync
  // with MAX_ACTIVE_ORDERS in functions/src/index.ts.
  export const MAX_ACTIVE_ORDERS = 3;

  // How often the dasher's own map pin refreshes (stays on the phone).
  export const LOCATION_UPDATE_INTERVAL_MS = 15000;
  // How often an online dasher tells the server "still here". The server
  // treats a dasher as gone after 45 min without one (STALE_MS in functions).
  export const HEARTBEAT_INTERVAL_MS = 60000;
  export const MAX_SPECIAL_INSTRUCTIONS_LENGTH = 200;
  export const MAX_ORDER_ITEMS = 20;

  // ─── CURRENCY ────────────────────────────────────────────────────────
// All amounts in DormDash are Jamaican dollars.
export const formatJMD = (amount: number): string =>
`J$${amount.toLocaleString('en-JM', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── CAMPUS CONFIG ───────────────────────────────────────────────────
// Default coordinates when a student's GPS is denied/unavailable.
// Update per campus if DormDash expands beyond UWI Mona.
export const CAMPUS_CENTER = { latitude: 18.0179, longitude: -76.8099 };
