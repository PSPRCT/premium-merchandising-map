async function fetchJson(path, label) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${label} failed to load from ${path} (HTTP ${response.status}).`);
  }
  return response.json();
}

export async function loadProgramData(program) {
  if (!program.available) {
    throw new Error(program.unavailableMessage || `${program.name} is not migrated yet.`);
  }

  const [stores, rts, metadata] = await Promise.all([
    fetchJson(program.data.stores, `${program.name} store data`),
    fetchJson(program.data.rts, `${program.name} RTS data`),
    fetchJson(program.data.metadata, `${program.name} metadata`)
  ]);

  return { stores, rts, metadata };
}
