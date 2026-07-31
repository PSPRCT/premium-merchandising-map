async function fetchJson(path, label) {
  let response;
  try {
    response = await fetch(path, { cache: "no-store" });
  } catch (error) {
    throw new Error(`${label} could not be reached at ${path}. ${error.message || error}`);
  }

  if (!response.ok) {
    throw new Error(`${label} failed to load from ${path} (HTTP ${response.status}).`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} contains invalid JSON. ${error.message || error}`);
  }
}

export async function loadData() {
  const [stores, rts, metadata] = await Promise.all([
    fetchJson("./data/stores.json", "Store data"),
    fetchJson("./data/rts.json", "RTS data"),
    fetchJson("./data/metadata.json", "Metadata")
  ]);

  if (!Array.isArray(stores)) {
    throw new Error("Store data must be a JSON array.");
  }
  if (!Array.isArray(rts)) {
    throw new Error("RTS data must be a JSON array.");
  }

  const warnings = [];
  if (Number(metadata.storeCount) !== stores.length) {
    warnings.push(`metadata storeCount is ${metadata.storeCount}, but stores.json contains ${stores.length}.`);
  }
  if (Number(metadata.rtsCount) !== rts.length) {
    warnings.push(`metadata rtsCount is ${metadata.rtsCount}, but rts.json contains ${rts.length}.`);
  }

  return { stores, rts, metadata, warnings };
}
