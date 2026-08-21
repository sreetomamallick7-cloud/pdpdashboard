import { supabase } from '../config/supabaseClient';
import categoryMapping from '../config/category_mapping.json';

// Jaro-Winkler implementation
function jaroWinkler(s1, s2) {
    if (s1 === s2) return 1.0;
    const len1 = s1.length;
    const len2 = s2.length;
    if (len1 === 0 || len2 === 0) return 0.0;
    
    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    
    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < len1; i++) {
        const start = Math.max(0, i - matchDistance);
        const end = Math.min(i + matchDistance + 1, len2);
        
        for (let j = start; j < end; j++) {
            if (s2Matches[j]) continue;
            if (s1[i] !== s2[j]) continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches++;
            break;
        }
    }
    
    if (matches === 0) return 0.0;
    
    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
    }
    
    transpositions = transpositions / 2.0;
    const m = matches;
    const jaro = (m / len1 + m / len2 + (m - transpositions) / m) / 3.0;
    
    // Winkler prefix bonus
    let prefix = 0;
    const maxPrefix = Math.min(4, Math.min(len1, len2));
    for (let i = 0; i < maxPrefix; i++) {
        if (s1[i] === s2[i]) {
            prefix++;
        } else {
            break;
        }
    }
    
    const P = 0.1; // scaling factor
    return jaro + (prefix * P * (1.0 - jaro));
}

const normalize = (str) => {
    if (!str) return '';
    return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
};

const getMappedCategory = (rawCat) => {
    const norm = normalize(rawCat);
    return normalize(categoryMapping[norm] || rawCat);
};

/**
 * 
 * @param {Array<{identifier: string, category: string}>} products 
 */
export async function processNewMatches(products) {
    if (!products || products.length === 0) return { newMatches: 0 };

    // Group to unique identifiers to avoid matching same thing twice
    const uniqueMap = new Map();
    products.forEach(p => {
        if (!uniqueMap.has(p.identifier)) {
            uniqueMap.set(p.identifier, p.category);
        }
    });

    const uniqueIdentifiers = Array.from(uniqueMap.keys());

    // 1. Fetch existing bridge records to find which ones are truly "unmatched"
    let existingBridgeMap = new Set();
    const CHUNK_SIZE = 200;
    for (let i = 0; i < uniqueIdentifiers.length; i += CHUNK_SIZE) {
        const chunk = uniqueIdentifiers.slice(i, i + CHUNK_SIZE);
        const { data } = await supabase
            .from('sku_attribute_bridge')
            .select('product_identifier')
            .in('product_identifier', chunk);
        if (data) {
            data.forEach(d => existingBridgeMap.add(d.product_identifier));
        }
    }

    const unmatchedIdentifiers = uniqueIdentifiers.filter(id => !existingBridgeMap.has(id));
    if (unmatchedIdentifiers.length === 0) return { newMatches: 0 };

    // 2. Fetch master SKUs
    const { data: masterData, error: masterError } = await supabase
        .from('sku_attribute_master')
        .select('base_sku, category');
        
    if (masterError) throw masterError;
    if (!masterData || masterData.length === 0) {
        // Can't match anything without master, insert them all as Unmatched
        const unmatches = unmatchedIdentifiers.map(id => ({
            product_identifier: id,
            base_sku: null,
            match_tier: 'Unmatched',
            confidence: 0
        }));
        await supabase.from('sku_attribute_bridge').upsert(unmatches, { onConflict: 'product_identifier' });
        return { newMatches: unmatches.length };
    }

    // Prepare master list
    const masterList = masterData.map(m => ({
        base_sku: m.base_sku,
        norm_sku: normalize(m.base_sku),
        mapped_cat: getMappedCategory(m.category)
    }));

    const newBridgeRows = [];

    // Process each unmatched identifier
    for (const rawId of unmatchedIdentifiers) {
        const normId = normalize(rawId);
        const rawCat = uniqueMap.get(rawId);
        const mappedProdCat = getMappedCategory(rawCat);
        
        let bestMatch = null;
        let bestTier = 'Unmatched';
        let bestConf = 0;

        // Only consider masters with matching category (cross-check)
        // Ensure both sides are mapped using the exact same mapping file.
        const validMasters = masterList.filter(m => m.mapped_cat === mappedProdCat || mappedProdCat === 'unmapped' || mappedProdCat === '');

        if (validMasters.length > 0) {
            // Tier 1: Exact Match
            const exactMatch = validMasters.find(m => m.norm_sku === normId);
            if (exactMatch) {
                bestMatch = exactMatch;
                bestTier = 'Exact';
                bestConf = 1.0;
            } else {
                // Tier 2: Prefix Match
                const prefixMatches = validMasters.filter(m => 
                    normId.startsWith(m.norm_sku) || m.norm_sku.startsWith(normId)
                );
                if (prefixMatches.length > 0) {
                    // Take the one that matches the longest portion
                    bestMatch = prefixMatches.reduce((a, b) => a.norm_sku.length > b.norm_sku.length ? a : b);
                    bestTier = 'Prefix';
                    bestConf = 0.95;
                } else {
                    // Tier 3: Fuzzy Match
                    let maxScore = 0;
                    let topFuzzyMatch = null;
                    for (const master of validMasters) {
                        const score = jaroWinkler(normId, master.norm_sku);
                        if (score > maxScore) {
                            maxScore = score;
                            topFuzzyMatch = master;
                        }
                    }
                    
                    if (maxScore > 0.85 && topFuzzyMatch) {
                        bestMatch = topFuzzyMatch;
                        bestTier = 'Fuzzy';
                        bestConf = parseFloat(maxScore.toFixed(3));
                    }
                }
            }
        }

        newBridgeRows.push({
            product_identifier: rawId,
            base_sku: bestMatch ? bestMatch.base_sku : null,
            match_tier: bestTier,
            confidence: bestConf
        });
    }

    // Upsert new bridge rows in chunks
    for (let i = 0; i < newBridgeRows.length; i += CHUNK_SIZE) {
        const chunk = newBridgeRows.slice(i, i + CHUNK_SIZE);
        await supabase.from('sku_attribute_bridge').upsert(chunk, { onConflict: 'product_identifier' });
    }

    return { newMatches: newBridgeRows.length };
}

