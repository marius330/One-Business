import { randomUUID, randomBytes } from "node:crypto";

export const newId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
export const newToken = () => randomBytes(32).toString("base64url");
export const now = () => new Date().toISOString();
