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

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_pm_category_date ON product_metrics(category, upload_date);
CREATE INDEX IF NOT EXISTS idx_sab_product_id ON sku_attribute_bridge(product_identifier);

-- 3. Optimized RPC using true dynamic SQL (EXECUTE) to guarantee index usage
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
DECLARE
    v_sql TEXT;
BEGIN
    v_sql := '
    WITH aggregated AS (
      SELECT 
        pm.product_identifier,
        SUM(pm.views) as views,
        SUM(pm.cart_adds) as cart_adds,
        SUM(pm.purchases) as purchases,
        SUM(pm.fis_users) as fis_users
      FROM product_metrics pm
      WHERE pm.upload_date >= $1 AND pm.upload_date <= $2 ';

    IF p_platform != 'combined' THEN
        v_sql := v_sql || ' AND pm.platform = $3 ';
    ELSE
        -- Just to keep parameter indexes aligned, we pass it but ignore it
        v_sql := v_sql || ' AND ($3 = $3) ';
    END IF;

    IF p_category = 'Uncategorized' THEN
        v_sql := v_sql || ' AND (pm.category = ''N/A'' OR pm.category IS NULL) ';
    ELSIF p_category != 'All' THEN
        v_sql := v_sql || ' AND pm.category = $4 ';
    ELSE
        -- All categories
        v_sql := v_sql || ' AND ($4 = $4) ';
    END IF;

    v_sql := v_sql || '
      GROUP BY pm.product_identifier
    ),
    wilson_computed AS (
      SELECT 
        a.product_identifier,
        a.views,
        a.cart_adds,
        a.purchases,
        a.fis_users,
        CASE WHEN a.views >= 10 THEN wilson_lower_bound(a.cart_adds::NUMERIC, a.views::NUMERIC) ELSE NULL END as wilson_cart_rate,
        CASE WHEN a.views >= 10 THEN wilson_lower_bound(a.fis_users::NUMERIC, a.views::NUMERIC) ELSE NULL END as wilson_fis_rate,
        CASE WHEN (a.cart_adds > a.views OR a.purchases > a.views) AND a.views < 100 THEN TRUE ELSE FALSE END as is_zero_view_anomaly
      FROM aggregated a
    ),
    ranked AS (
      SELECT
        w.*,
        PERCENT_RANK() OVER (PARTITION BY CASE WHEN w.views >= 10 THEN 1 ELSE 0 END ORDER BY w.views ASC) as views_pct,
        PERCENT_RANK() OVER (PARTITION BY CASE WHEN w.views >= 10 THEN 1 ELSE 0 END ORDER BY w.wilson_cart_rate ASC) as cart_pct,
        PERCENT_RANK() OVER (PARTITION BY CASE WHEN w.views >= 10 THEN 1 ELSE 0 END ORDER BY w.wilson_fis_rate ASC) as fis_pct
      FROM wilson_computed w
    )
    SELECT 
        r.product_identifier,
        sam.attributes->>''TITLE'' as product_name,
        sab.base_sku,
        r.views::BIGINT,
        r.cart_adds::BIGINT,
        r.purchases::BIGINT,
        r.fis_users::BIGINT,
        r.wilson_cart_rate,
        r.wilson_fis_rate,
        CASE WHEN r.views >= 10 THEN (r.cart_pct - r.views_pct)::NUMERIC ELSE NULL END as opp_score_cart,
        CASE WHEN r.views >= 10 THEN (r.fis_pct - r.views_pct)::NUMERIC ELSE NULL END as opp_score_fis,
        r.is_zero_view_anomaly
    FROM ranked r
    LEFT JOIN sku_attribute_bridge sab ON r.product_identifier = sab.product_identifier
    LEFT JOIN sku_attribute_master sam ON sab.base_sku = sam.base_sku
    ORDER BY r.views DESC';

    RETURN QUERY EXECUTE v_sql USING p_start_date, p_end_date, p_platform, p_category;
END;
$$ LANGUAGE plpgsql;
