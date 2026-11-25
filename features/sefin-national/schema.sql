CREATE TABLE IF NOT EXISTS water_sefin_settings (
    organization_id TEXT PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS water_sefin_sequences (
    environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
    cnpj TEXT NOT NULL,
    city_code TEXT NOT NULL,
    series INTEGER NOT NULL,
    last_number INTEGER NOT NULL,
    PRIMARY KEY (environment, cnpj, city_code, series)
);

CREATE TABLE IF NOT EXISTS water_sefin_documents (
    invoice_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
    draft_json TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    revision TEXT NOT NULL,
    dps_id TEXT,
    dps_payload TEXT,
    submitted_at TEXT,
    authorized_xml TEXT,
    cancellation_payload TEXT,
    cancellation_xml TEXT,
    message TEXT NOT NULL DEFAULT '',
    UNIQUE (environment, dps_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS water_sefin_access_key
ON fiscal_invoices (access_key, provider_reference)
WHERE provider = 'sefin' AND length(access_key) = 50;
