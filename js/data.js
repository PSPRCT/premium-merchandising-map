export async function loadData() {
  const [storesResponse, rtsResponse] = await Promise.all([
    fetch("./data/stores.json", { cache: "no-store" }),
    fetch("./data/rts.json", { cache: "no-store" })
  ]);

  if (!storesResponse.ok) {
    throw new Error(`Unable to load stores.json (${storesResponse.status})`);
  }
  if (!rtsResponse.ok) {
    throw new Error(`Unable to load rts.json (${rtsResponse.status})`);
  }

  const [stores, rts] = await Promise.all([
    storesResponse.json(),
    rtsResponse.json()
  ]);

  return { stores, rts };
}
