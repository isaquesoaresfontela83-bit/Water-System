CREATE TABLE IF NOT EXISTS water_home_widgets (
    user_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    hidden TEXT NOT NULL,
    sizes TEXT,
    PRIMARY KEY (user_id, organization_id)
);
