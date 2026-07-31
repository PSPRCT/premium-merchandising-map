export default {
  id: "one-walmart",
  name: "One Walmart PSP",
  shortName: "One Walmart",
  available: true,
  model: "radius-coverage-with-team-eligibility",
  defaultRadiusMiles: 75,
  home: { center: [39.5, -98.35], zoom: 5 },
  data: {
    stores: "./data/one-walmart/stores.json",
    rts: "./data/one-walmart/rts.json",
    metadata: "./data/one-walmart/metadata.json"
  },
  terminology: {
    resource: "RTS",
    gap: "Network Gap",
    unique: "Unique Coverage",
    shared: "Shared Coverage"
  }
};
