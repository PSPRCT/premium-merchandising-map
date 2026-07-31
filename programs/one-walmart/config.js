export default {
  id: "one-walmart",
  name: "One Walmart PSP",
  shortName: "One Walmart",
  available: false,
  model: "business-rule-routing",
  defaultRadiusMiles: 75,
  unavailableMessage:
    "The One Walmart adapter is scaffolded, but its current dedicated-team, shared-team, and remote-routing rules have not yet been migrated into Version 3.",
  data: {
    stores: "./data/one-walmart/stores.json",
    rts: "./data/one-walmart/rts.json",
    metadata: "./data/one-walmart/metadata.json"
  },
  routingRequirements: [
    "Core One Walmart shared routing",
    "Tyson dedicated team",
    "P&G dedicated team",
    "Unilever dedicated team",
    "Legacy Acosta restrictions",
    "Remote trainer pool",
    "Management group and team normalization"
  ]
};
