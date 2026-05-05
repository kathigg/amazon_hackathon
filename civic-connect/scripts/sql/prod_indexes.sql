CREATE INDEX IF NOT EXISTS "Bill_introducedAt_idx" ON "Bill"("introducedAt");
CREATE INDEX IF NOT EXISTS "Bill_viewCount_introducedAt_idx" ON "Bill"("viewCount","introducedAt");
