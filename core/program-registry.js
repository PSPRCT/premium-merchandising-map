import premiumProgram from "../programs/premium-merchandising/config.js";
import oneWalmartProgram from "../programs/one-walmart/config.js";
import { premiumAdapter } from "../programs/premium-merchandising/adapter.js";
import { oneWalmartAdapter } from "../programs/one-walmart/adapter.js";

const programs = new Map([
  [premiumProgram.id, { ...premiumProgram, adapter: premiumAdapter }],
  [oneWalmartProgram.id, { ...oneWalmartProgram, adapter: oneWalmartAdapter }]
]);

export function getProgram(programId) {
  const program = programs.get(programId);
  if (!program) throw new Error(`Unknown program: ${programId}`);
  return program;
}

export function listPrograms() {
  return Array.from(programs.values());
}
