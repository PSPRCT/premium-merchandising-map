export default {
  id: "premium-merchandising",
  name: "Premium Merchandising",
  shortName: "Premium",
  available: true,
  model: "radius-coverage",
  defaultRadiusMiles: 75,
  managementGroupId: 245,
  home: { center: [39.5, -98.35], zoom: 5 },
  data: {
    stores: "./data/premium-merchandising/stores.json",
    rts: "./data/premium-merchandising/rts.json",
    metadata: "./data/premium-merchandising/metadata.json"
  },
  terminology: {
    resource: "RTS",
    gap: "Network Gap",
    unique: "Unique Coverage",
    shared: "Shared Coverage"
  }
};
