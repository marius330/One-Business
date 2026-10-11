import { crmModule } from "./crm/index.js";
import { contractsModule } from "./contracts/index.js";

/** Registers the BUSINESS OS commercial modules in a core instance. Order matters only for readability. */
export function registerBusinessModules(core) {
  for (const m of [crmModule, contractsModule]) core.registry.register(m);
  return core;
}
