import { ensureSyncMeta } from "@/db/meta";
import { defaultDBData } from "@/db/schema";

await db.read();
db.data ||= structuredClone(defaultDBData);

db.data.meta = ensureSyncMeta(db.data.meta);

await db.write();
