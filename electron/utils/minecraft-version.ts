/**
 * Minecraft version validation utilities
 */

// Valid Minecraft version patterns
const MC_VERSION_REGEX = /^1\.(2[0-1]|1[0-9]|[0-9])(\.[0-9]+)?(-pre[0-9]*|-rc[0-9]*|-snapshot)?$/i;

// Known valid major versions
const VALID_MAJOR_VERSIONS = [
  "1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9",
  "1.10", "1.11", "1.12", "1.13", "1.14", "1.15", "1.16", "1.17", "1.18", 
  "1.19", "1.20", "1.21"
];

/**
 * Check if a string is a valid Minecraft version
 */
export function isValidMinecraftVersion(version: string): boolean {
  if (!version || typeof version !== 'string') {
    return false;
  }
  
  const normalized = version.trim().toLowerCase();
  
  // Check against regex pattern
  if (MC_VERSION_REGEX.test(normalized)) {
    return true;
  }
  
  // Check if it matches a known major version exactly
  if (VALID_MAJOR_VERSIONS.includes(normalized)) {
    return true;
  }
  
  // Check for snapshot format (e.g., "23w51a")
  if (/^\d{2}w\d{2}[a-z]$/i.test(normalized)) {
    return true;
  }
  
  return false;
}

/**
 * Parse and normalize a Minecraft version string
 * Returns null if invalid
 */
export function parseMinecraftVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  preRelease?: string;
  raw: string;
} | null {
  if (!version || typeof version !== 'string') {
    return null;
  }
  
  const normalized = version.trim();
  
  // Match standard version format (1.X.Y or 1.X)
  const match = normalized.match(/^1\.(\d+)(?:\.(\d+))?(-.*)?$/);
  if (!match) {
    return null;
  }
  
  const minor = parseInt(match[1], 10);
  const patch = match[2] ? parseInt(match[2], 10) : 0;
  const preRelease = match[3] || undefined;
  
  return {
    major: 1,
    minor,
    patch,
    preRelease,
    raw: normalized
  };
}

/**
 * Compare two Minecraft versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareMinecraftVersions(a: string, b: string): number {
  const parsedA = parseMinecraftVersion(a);
  const parsedB = parseMinecraftVersion(b);
  
  if (!parsedA || !parsedB) {
    // Fall back to string comparison for invalid versions
    return a.localeCompare(b);
  }
  
  // Compare minor version first (most significant after major=1)
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor - parsedB.minor;
  }
  
  // Then patch version
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch - parsedB.patch;
  }
  
  // Pre-releases come before final releases
  if (parsedA.preRelease && !parsedB.preRelease) {
    return -1;
  }
  if (!parsedA.preRelease && parsedB.preRelease) {
    return 1;
  }
  
  return 0;
}

/**
 * Check if a mod version is compatible with a modpack's Minecraft version
 */
export function isVersionCompatible(
  modVersion: string | string[],
  packVersion: string
): boolean {
  if (!packVersion || !isValidMinecraftVersion(packVersion)) {
    return true; // Can't validate without a valid pack version
  }
  
  const packParsed = parseMinecraftVersion(packVersion);
  if (!packParsed) {
    return true;
  }
  
  // Handle array of versions
  const versions = Array.isArray(modVersion) ? modVersion : [modVersion];
  
  for (const ver of versions) {
    const modParsed = parseMinecraftVersion(ver);
    if (!modParsed) {
      continue;
    }
    
    // Check for exact match on major.minor
    if (packParsed.minor === modParsed.minor) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract Minecraft version from an array of game versions (CurseForge format)
 */
export function extractMinecraftVersion(gameVersions: string[]): string {
  if (!gameVersions || !Array.isArray(gameVersions)) {
    return "";
  }
  
  // Filter to only valid Minecraft versions (not mod loaders)
  const mcVersions = gameVersions.filter(v => 
    isValidMinecraftVersion(v) && 
    !['forge', 'fabric', 'quilt', 'neoforge'].some(loader => 
      v.toLowerCase().includes(loader)
    )
  );
  
  if (mcVersions.length === 0) {
    return "";
  }
  
  // Sort and return the highest version
  return mcVersions.sort((a, b) => compareMinecraftVersions(b, a))[0];
}

/**
 * Get the base version (major.minor) from a full version string
 */
export function getBaseVersion(version: string): string {
  const parsed = parseMinecraftVersion(version);
  if (!parsed) {
    return version;
  }
  return `1.${parsed.minor}`;
}
