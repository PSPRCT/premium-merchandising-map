export function isOneWalmartRtsEligibleForStore(store, rts) {
  const key = store.routingTeamKey || "ONE_WALMART";
  return Array.isArray(rts.eligibility) && rts.eligibility.includes(key);
}

export const oneWalmartAdapter = {
  isRtsEligibleForStore: isOneWalmartRtsEligibleForStore
};
