export const EARTH_RADIUS_MILES = 3958.7613;

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}
