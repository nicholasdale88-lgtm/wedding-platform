-- A vendor's packages (their price list), as JSON: [{ name, price, unit, includes, popular }].
ALTER TABLE vendor_listing ADD COLUMN packages TEXT NOT NULL DEFAULT '[]';
