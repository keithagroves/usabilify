// Dev helper: run a real persona draft and save the response for the walkthrough to replay.
import { writeFileSync } from "node:fs";
import { draftPersona } from "../src/personas.js";
const r = await draftPersona(process.argv[2]);
writeFileSync(process.argv[3], JSON.stringify(r, null, 1));
console.log(r.valid, r.errors, (r.persona as any).id, (r.persona as any).viewport, JSON.stringify((r.persona as any).perception), r.costUsd);
