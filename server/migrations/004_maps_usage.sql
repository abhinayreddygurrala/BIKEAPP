-- How many billable Google Maps calls the server has made each month, per
-- kind of call. The server stops calling Google before a count reaches its
-- free monthly allowance, and the app switches to Apple's maps instead, so
-- Google never sends a bill. `month` is in Pacific time ("2026-10"), the
-- calendar Google bills by.

CREATE TABLE maps_usage (
  month TEXT NOT NULL,
  sku   TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (month, sku)
) WITHOUT ROWID;
