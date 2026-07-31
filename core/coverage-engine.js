import { haversineMiles } from "./geo.js";

export function buildCoverageModel({ stores, rts, radiusMiles }) {
  const activeRts = rts.filter(rtsMember => rtsMember.active);

  const storeCoverage = stores.map(store => {
    const coveringRts = activeRts
      .map(rtsMember => ({
        ...rtsMember,
        distance: haversineMiles(
          store.lat,
          store.lng,
          rtsMember.lat,
          rtsMember.lng
        )
      }))
      .filter(rtsMember => rtsMember.distance <= radiusMiles)
      .sort((a, b) => a.distance - b.distance);

    return {
      store,
      coveringRts,
      coverageType:
        coveringRts.length === 0
          ? "Gap"
          : coveringRts.length === 1
            ? "Unique"
            : "Shared"
    };
  });

  const byRts = activeRts.map(rtsMember => {
    const entries = storeCoverage.filter(item =>
      item.coveringRts.some(covering => covering.id === rtsMember.id)
    );
    const distances = entries.map(item =>
      haversineMiles(
        item.store.lat,
        item.store.lng,
        rtsMember.lat,
        rtsMember.lng
      )
    );

    return {
      rts: rtsMember,
      entries,
      stores: entries.map(item => item.store),
      count: entries.length,
      uniqueCount: entries.filter(item => item.coverageType === "Unique").length,
      sharedCount: entries.filter(item => item.coverageType === "Shared").length,
      averageDistance:
        distances.length > 0
          ? distances.reduce((sum, value) => sum + value, 0) / distances.length
          : 0,
      farthestDistance: distances.length > 0 ? Math.max(...distances) : 0
    };
  });

  return {
    radiusMiles,
    activeRts,
    storeCoverage,
    byRts,
    gaps: storeCoverage
      .filter(item => item.coverageType === "Gap")
      .map(item => item.store),
    uniqueStores: storeCoverage
      .filter(item => item.coverageType === "Unique")
      .map(item => item.store),
    sharedStores: storeCoverage
      .filter(item => item.coverageType === "Shared")
      .map(item => item.store)
  };
}

export function buildTerritoryHealth({ stores, rts, radiusMiles }) {
  const model = buildCoverageModel({ stores, rts, radiusMiles });
  const counts = model.byRts.map(item => item.count);
  const averageCount =
    counts.length > 0
      ? counts.reduce((sum, value) => sum + value, 0) / counts.length
      : 0;

  return model.byRts
    .map(item => {
      const workloadRatio = item.count / Math.max(1, averageCount);
      const uniqueShare =
        item.count > 0 ? (item.uniqueCount / item.count) * 100 : 0;

      let score = 100;

      if (item.averageDistance > 50) score -= 20;
      else if (item.averageDistance > 40) score -= 12;
      else if (item.averageDistance > 30) score -= 6;

      if (workloadRatio > 1.65) score -= 20;
      else if (workloadRatio > 1.35) score -= 12;
      else if (workloadRatio < 0.4) score -= 8;

      if (uniqueShare > 85 && item.uniqueCount > 100) score -= 12;
      else if (uniqueShare > 70 && item.uniqueCount > 75) score -= 6;

      score = Math.max(0, Math.min(100, score));

      let health = "Excellent";
      let className = "excellent";
      if (score < 50) {
        health = "Needs Attention";
        className = "critical";
      } else if (score < 68) {
        health = "Fair";
        className = "watch";
      } else if (score < 84) {
        health = "Good";
        className = "good";
      }

      return {
        ...item,
        workloadRatio,
        uniqueShare,
        score,
        health,
        className
      };
    })
    .sort((a, b) => a.score - b.score || b.count - a.count);
}

export function buildGapPlacementPlan({
  stores,
  rts,
  radiusMiles,
  limit = 20,
  minimumGain = 3
}) {
  let remaining = buildCoverageModel({ stores, rts, radiusMiles }).gaps;
  const recommendations = [];

  for (
    let index = 0;
    index < limit && remaining.length > 0;
    index += 1
  ) {
    let best = null;

    for (const candidate of remaining) {
      const gain = remaining.filter(
        store =>
          haversineMiles(
            candidate.lat,
            candidate.lng,
            store.lat,
            store.lng
          ) <= radiusMiles
      );

      if (!best || gain.length > best.gain.length) {
        best = { candidate, gain };
      }
    }

    if (!best || best.gain.length < minimumGain) break;

    const countBy = key =>
      Object.entries(
        best.gain.reduce((counts, store) => {
          const value = store[key] || "Not listed";
          counts[value] = (counts[value] || 0) + 1;
          return counts;
        }, {})
      ).sort((a, b) => b[1] - a[1]);

    recommendations.push({
      rank: index + 1,
      lat: best.candidate.lat,
      lng: best.candidate.lng,
      city: best.candidate.city,
      state: best.candidate.state,
      gain: best.gain.length,
      stores: best.gain,
      manager: countBy("manager")[0]?.[0] || "",
      retailer: countBy("retailer")[0]?.[0] || ""
    });

    const coveredIds = new Set(best.gain.map(store => store.siteId));
    remaining = remaining.filter(store => !coveredIds.has(store.siteId));
  }

  return recommendations;
}
