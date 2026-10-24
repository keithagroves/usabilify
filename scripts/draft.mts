// Dev helper: run the persona draft directly. Usage: npx tsx scripts/draft.mts "<description>"
import { draftPersona } from "../src/personas.js";
const r = await draftPersona(process.argv[2] ?? "A 66-year-old nurse with cataracts who mostly uses an iPad");
console.log(JSON.stringify({ valid: r.valid, errors: r.errors, cost: r.costUsd, transforms: (r.persona as any).perception, web: (r.persona as any).knowledge?.web }, null, 1));
