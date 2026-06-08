export function isLicenseExpiryDowngrade(existingExpires: number, nextExpires: number): boolean {
  if (existingExpires === 0) return nextExpires !== 0;
  if (nextExpires === 0) return false;
  return existingExpires > nextExpires;
}
