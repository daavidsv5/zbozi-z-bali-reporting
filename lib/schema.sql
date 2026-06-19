-- Zboží z Bali — databázové schéma
-- Spusť přes: npm run db:migrate

-- Uživatelé (auth)
CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));

-- Denní agregáty objednávek (KPI dashboard, grafy)
CREATE TABLE IF NOT EXISTS daily_orders (
  date             DATE    NOT NULL,
  market           CHAR(2) NOT NULL CHECK (market IN ('CZ', 'SK')),
  revenue_vat      NUMERIC NOT NULL DEFAULT 0,
  revenue          NUMERIC NOT NULL DEFAULT 0,
  order_count      INTEGER NOT NULL DEFAULT 0,
  shipping_revenue NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (date, market)
);
CREATE INDEX IF NOT EXISTS daily_orders_date_idx ON daily_orders (date);

-- Denní marketingové náklady (per zdroj)
CREATE TABLE IF NOT EXISTS daily_marketing (
  date              DATE        NOT NULL,
  market            CHAR(2)     NOT NULL CHECK (market IN ('CZ', 'SK')),
  source            VARCHAR(50) NOT NULL,
  cost              NUMERIC     NOT NULL DEFAULT 0,
  clicks            INTEGER     NOT NULL DEFAULT 0,
  impressions       INTEGER     NOT NULL DEFAULT 0,
  conversions       INTEGER     NOT NULL DEFAULT 0,
  conversions_value NUMERIC     NOT NULL DEFAULT 0,
  PRIMARY KEY (date, market, source)
);
CREATE INDEX IF NOT EXISTS daily_marketing_date_idx ON daily_marketing (date);

-- Prodej produktů (per produkt per den)
CREATE TABLE IF NOT EXISTS product_sales (
  id           SERIAL  PRIMARY KEY,
  date         DATE    NOT NULL,
  market       CHAR(2) NOT NULL CHECK (market IN ('CZ', 'SK')),
  product_name TEXT    NOT NULL,
  variant      TEXT    NOT NULL DEFAULT '',
  sku          TEXT    NOT NULL DEFAULT '',
  quantity     INTEGER NOT NULL DEFAULT 0,
  revenue      NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS product_sales_date_market_idx ON product_sales (date, market);
CREATE INDEX IF NOT EXISTS product_sales_name_idx ON product_sales (product_name);

-- Objednávky bez PII — pro retenci a RFM analýzu
-- email je nahrazen SHA-256 hashem, žádná osobní data se neukládají
CREATE TABLE IF NOT EXISTS customer_orders (
  order_id        TEXT    PRIMARY KEY,
  date            DATE    NOT NULL,
  market          CHAR(2) NOT NULL CHECK (market IN ('CZ', 'SK')),
  customer_hash   CHAR(64) NOT NULL,
  revenue_vat     NUMERIC NOT NULL DEFAULT 0,
  revenue         NUMERIC NOT NULL DEFAULT 0,
  shipping_method TEXT    NOT NULL DEFAULT '',
  payment_method  TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS customer_orders_date_idx ON customer_orders (date);
CREATE INDEX IF NOT EXISTS customer_orders_hash_idx ON customer_orders (customer_hash);
CREATE INDEX IF NOT EXISTS customer_orders_market_idx ON customer_orders (market);

-- Hodnota košíku per objednávka (pro histogram distribuce)
CREATE TABLE IF NOT EXISTS order_values (
  order_id TEXT    PRIMARY KEY,
  date     DATE    NOT NULL,
  market   CHAR(2) NOT NULL CHECK (market IN ('CZ', 'SK')),
  value    NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS order_values_date_market_idx ON order_values (date, market);

-- Denní doprava (per dopravce per den)
CREATE TABLE IF NOT EXISTS daily_shipping (
  id          SERIAL  PRIMARY KEY,
  date        DATE    NOT NULL,
  market      CHAR(2) NOT NULL CHECK (market IN ('CZ', 'SK')),
  name        TEXT    NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  revenue_vat NUMERIC NOT NULL DEFAULT 0,
  free_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS daily_shipping_date_market_idx ON daily_shipping (date, market);

-- Denní platby (per platební metoda per den)
CREATE TABLE IF NOT EXISTS daily_payment (
  id          SERIAL  PRIMARY KEY,
  date        DATE    NOT NULL,
  market      CHAR(2) NOT NULL CHECK (market IN ('CZ', 'SK')),
  name        TEXT    NOT NULL,
  order_count INTEGER NOT NULL DEFAULT 0,
  revenue_vat NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS daily_payment_date_market_idx ON daily_payment (date, market);

-- Nákupní chování — all-time hourly grid
CREATE TABLE IF NOT EXISTS hourly_behavior (
  market      CHAR(2)  NOT NULL CHECK (market IN ('CZ', 'SK')),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour        SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  order_count INTEGER  NOT NULL DEFAULT 0,
  revenue     NUMERIC  NOT NULL DEFAULT 0,
  PRIMARY KEY (market, day_of_week, hour)
);

-- Log importů
CREATE TABLE IF NOT EXISTS import_log (
  id          SERIAL      PRIMARY KEY,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source      TEXT        NOT NULL,
  rows_total  INTEGER     NOT NULL DEFAULT 0,
  rows_new    INTEGER     NOT NULL DEFAULT 0,
  note        TEXT
);
