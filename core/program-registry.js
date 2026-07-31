import premiumProgram from "../programs/premium-merchandising/config.js";
import oneWalmartProgram from "../programs/one-walmart/config.js";

const programs = new Map([
  [premiumProgram.id, premiumProgram],
  [oneWalmartProgram.id, oneWalmartProgram]
]);

export function getProgram(programId) {
  const program = programs.get(programId);
  if (!program) throw new Error(`Unknown program: ${programId}`);
  return program;
}

export function listPrograms() {
  return Array.from(programs.values());
}
