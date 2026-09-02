-- Run this script in your Supabase SQL Editor to create the necessary functions for the Category Drill-Down module.

-- 1. Helper function for Wilson Lower Bound
CREATE OR REPLACE FUNCTION wilson_lower_bound(successes NUMERIC, trials NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    z NUMERIC := 1.96;
    p NUMERIC;
    n NUMERIC;
BEGIN
    n := trials;
    IF n = 0 THEN
        RETURN 0.0;
    END IF;
    p := successes / n;
    IF p > 1.0 THEN
        p := 1.0;
    END IF;
    RETURN (p + (z*z)/(2*n) - z * SQRT((p*(1-p) + (z*z)/(4*n))/n)) / (1 + (z*z)/n);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Main RPC for Category Drill-Down
CREATE OR REPLACE FUNCTION get_category_drilldown(
    p_category TEXT,
    p_platform TEXT,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    product_identifier TEXT,
    product_name TEXT,
    base_sku TEXT,
    views BIGINT,
    cart_adds BIGINT,
    purchases BIGINT,
    fis_users BIGINT,
    wilson_cart_rate NUMERIC,
    wilson_fis_rate NUMERIC,
    opp_score_cart NUMERIC,
    opp_score_fis NUMERIC,
    is_zero_view_anomaly BOOLEAN
) AS $$
WITH aggregated AS (
  SELECT 
    pm.product_identifier,
    SUM(pm.views) as views,
    SUM(pm.cart_adds) as cart_adds,
    SUM(pm.purchases) as purchases,
    SUM(pm.fis_users) as fis_users
  FROM product_metrics pm
  WHERE (p_category = 'All' 
         OR (p_category = 'Uncategorized' AND (pm.category = 'N/A' OR pm.category IS NULL))
         OR (p_category != 'Uncategorized' AND pm.category = p_category))
    AND pm.platform = p_platform
    AND pm.upload_date >= p_start_date AND pm.upload_date <= p_end_date
  GROUP BY pm.product_identifier
),
wilson_computed AS (
  SELECT 
    product_identifier,
    views,
    cart_adds,
    purchases,
    fis_users,
    CASE WHEN views >= 10 THEN wilson_lower_bound(cart_adds::NUMERIC, views::NUMERIC) ELSE NULL END as wilson_cart_rate,
    CASE WHEN views >= 10 THEN wilson_lower_bound(fis_users::NUMERIC, views::NUMERIC) ELSE NULL END as wilson_fis_rate,
    -- Flag SKUs where cart-adds or purchases exceed views (tracking anomaly)
    CASE WHEN (cart_adds > views OR purchases > views) AND views < 100 THEN TRUE ELSE FALSE END as is_zero_view_anomaly
  FROM aggregated
),
ranked AS (
  SELECT
    *,
    PERCENT_RANK() OVER (PARTITION BY CASE WHEN views >= 10 THEN 1 ELSE 0 END ORDER BY views ASC) as views_pct,
    PERCENT_RANK() OVER (PARTITION BY CASE WHEN views >= 10 THEN 1 ELSE 0 END ORDER BY wilson_cart_rate ASC) as cart_pct,
    PERCENT_RANK() OVER (PARTITION BY CASE WHEN views >= 10 THEN 1 ELSE 0 END ORDER BY wilson_fis_rate ASC) as fis_pct
  FROM wilson_computed
)
SELECT 
    r.product_identifier,
    sam.attributes->>'TITLE' as product_name,
    sab.base_sku,
    r.views::BIGINT,
    r.cart_adds::BIGINT,
    r.purchases::BIGINT,
    r.fis_users::BIGINT,
    r.wilson_cart_rate,
    r.wilson_fis_rate,
    CASE WHEN r.views >= 10 THEN (r.cart_pct - r.views_pct) ELSE NULL END as opp_score_cart,
    CASE WHEN r.views >= 10 THEN (r.fis_pct - r.views_pct) ELSE NULL END as opp_score_fis,
    r.is_zero_view_anomaly
FROM ranked r
LEFT JOIN sku_attribute_bridge sab ON r.product_identifier = sab.product_identifier
LEFT JOIN sku_attribute_master sam ON sab.base_sku = sam.base_sku
ORDER BY r.views DESC;
$$ LANGUAGE sql;
