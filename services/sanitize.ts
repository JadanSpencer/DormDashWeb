// services/sanitize.ts
// Every piece of user input passes through here before touching Firestore.
// Think of this as airport security — everything gets scanned.

// ─── STRING SANITIZATION ───────────────────────────────────────────────────

// Remove HTML/script injection characters
export const sanitizeText = (input: string): string => {
    return input
      .trim()
      .replace(/[<>]/g, '')           // Remove HTML tags
      .replace(/javascript:/gi, '')   // Remove JS protocol
      .replace(/on\w+=/gi, '')        // Remove event handlers
      .slice(0, 500);                 // Hard cap at 500 chars
  };
  
  // Email: lowercase, trimmed, validated
  export const sanitizeEmail = (email: string): string => {
    return email.trim().toLowerCase().slice(0, 254);
  };
  
  // Phone: digits, spaces, +, (, ), - only
  export const sanitizePhone = (phone: string): string => {
    return phone.replace(/[^\d\s\+\(\)\-]/g, '').trim().slice(0, 20);
  };
  
  // Name: letters, spaces, hyphens, apostrophes only
  export const sanitizeName = (name: string): string => {
    return name
      .trim()
      .replace(/[^a-zA-Z\s\-\'\.]/g, '')
      .slice(0, 100);
  };
  
  // Delivery address label: safe characters only
  export const sanitizeAddress = (address: string): string => {
    return address
      .trim()
      .replace(/[<>\"\']/g, '')
      .slice(0, 200);
  };
  
  // Order note: safe text, strict length limit
  export const sanitizeNote = (note: string): string => {
    return note
      .trim()
      .replace(/[<>]/g, '')
      .slice(0, 200);
  };
  
  // Number: parse and clamp between min/max
  export const sanitizeNumber = (value: string, min: number, max: number): number => {
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return min;
    return Math.min(Math.max(parsed, min), max);
  };
  
  // ─── VALIDATION ────────────────────────────────────────────────────────────
  
  export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) && email.length <= 254;
  };
  
  export const isValidPassword = (password: string): boolean => {
    return (
      password.length >= 8 &&
      password.length <= 128 &&
      /[0-9]/.test(password) &&       // At least one number
      /[a-zA-Z]/.test(password)       // At least one letter
    );
  };
  
  export const isValidPhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\s/g, '');
    return /^[\+]?[0-9]{7,15}$/.test(cleaned);
  };
  
  export const isValidName = (name: string): boolean => {
    return name.trim().length >= 2 && name.trim().length <= 100;
  };
  
  export const isValidCoordinate = (lat: number, lng: number): boolean => {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  };