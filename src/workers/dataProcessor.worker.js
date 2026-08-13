import Papa from 'papaparse';
import categoryMapping from '../config/category_mapping.json';

const normalizeName = (name) => {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

const mapCategory = (rawCategory) => {
  if (!rawCategory) return 'Unmapped';
  const normalized = rawCategory.trim().toLowerCase().replace(/\s+/g, ' ');
  return categoryMapping[normalized] || 'Unmapped';
};

const parseCSV = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve([]);
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};

const aggregateData = (data, isWeb) => {
  const aggregated = {};
  
  data.forEach(row => {
    const rawName = row['ProductName'] || row['Product Name'];
    if (!rawName) return; // Skip rows without names
    
    const normName = normalizeName(rawName);
    
    if (!aggregated[normName]) {
      aggregated[normName] = {
        productName: rawName,
        normalizedName: normName,
        category: mapCategory(row['Category']),
        priceRange: isWeb ? row['Price Range'] : null,
        views: 0,
        cartAdds: 0,
        purchases: 0,
        revenue: 0,
        // We track this for the frontend flagging
        isCartAddsGreater: false, 
      };
    }
    
    // Some columns might have string numbers with commas etc, but dynamicTyping should handle simple ones
    const parseNum = (val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(/,/g, ''));
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    };

    aggregated[normName].views += parseNum(row['Items viewed']);
    aggregated[normName].cartAdds += parseNum(row['Items added to cart']);
    aggregated[normName].purchases += parseNum(row['Items purchased']);
    aggregated[normName].revenue += parseNum(row['Gross item revenue'] || row['Gross item Revenue'] || 0);
  });
  
  // Post-process logic per product
  Object.values(aggregated).forEach(product => {
    product.isCartAddsGreater = product.cartAdds > product.views;
    // We don't clip cartAdds to views, we just flag it
    
    product.pdpToCartRate = product.views > 0 ? product.cartAdds / product.views : 0;
    product.cartToPurchaseRate = product.cartAdds > 0 ? product.purchases / product.cartAdds : 0;
    product.overallConvRate = product.views > 0 ? product.purchases / product.views : 0;
    product.cartAbandonRate = product.cartAdds > 0 ? 1 - (product.purchases / product.cartAdds) : 0;
    product.revenuePerView = product.views > 0 ? product.revenue / product.views : 0;
  });

  return aggregated;
};

const processFISData = (data) => {
  const fisDict = {};
  data.forEach(row => {
    const rawName = row['ProductName'] || row['Product Name'];
    if (!rawName) return;
    const normName = normalizeName(rawName);
    // Overwrite or sum? The prompt says "Total users per product".
    // If duplicates exist, we should sum them.
    const users = typeof row['Total users'] === 'number' ? row['Total users'] : parseFloat((row['Total users'] || '').toString().replace(/,/g, '')) || 0;
    if (!fisDict[normName]) {
      fisDict[normName] = 0;
    }
    fisDict[normName] += users;
  });
  return fisDict;
};

const mergeFIS = (aggregatedPlatform, fisDict) => {
  const result = [];
  const categoryFISMatchTotals = {}; // category -> total matched FIS users

  Object.values(aggregatedPlatform).forEach(product => {
    const normName = product.normalizedName;
    const fisUsers = fisDict[normName] !== undefined ? fisDict[normName] : null;
    
    product.fisUsers = fisUsers;
    product.fisIntentRate = (fisUsers !== null && product.views > 0) ? fisUsers / product.views : null;
    
    // Accumulate category totals for share
    if (fisUsers !== null) {
      if (!categoryFISMatchTotals[product.category]) {
        categoryFISMatchTotals[product.category] = 0;
      }
      categoryFISMatchTotals[product.category] += fisUsers;
    }
    
    result.push(product);
  });
  
  // Add FIS share of category
  result.forEach(product => {
    if (product.fisUsers !== null && categoryFISMatchTotals[product.category] > 0) {
      product.fisShareOfCategory = product.fisUsers / categoryFISMatchTotals[product.category];
    } else {
      product.fisShareOfCategory = null;
    }
  });

  return result;
};

// Combine Web and App datasets
const combineDatasets = (webData, appData) => {
  const combinedDict = {};
  
  const mergeIntoCombined = (sourceData) => {
    sourceData.forEach(prod => {
      const normName = prod.normalizedName;
      if (!combinedDict[normName]) {
        combinedDict[normName] = {
          productName: prod.productName,
          normalizedName: normName,
          category: prod.category, // should be same since we map to canonical
          views: 0,
          cartAdds: 0,
          purchases: 0,
          revenue: 0,
          fisUsers: null, // We sum FIS users later or use the max/sum of web/app?
          // Since FIS Web and App are usually identical/different, we'll combine their FIS users if both match
          fisWebUsers: prod.fisUsers,
        };
      }
      const c = combinedDict[normName];
      c.views += prod.views;
      c.cartAdds += prod.cartAdds;
      c.purchases += prod.purchases;
      c.revenue += prod.revenue;
      
      if (prod.fisUsers !== null) {
         // To avoid double counting FIS users if FIS Web and App are identical files, 
         // we'll just take the max if they both have it, or maybe sum them?
         // The prompt says "Trust the upload slot... warn if hash identical". So we sum them.
         if (c.fisTotalSummed === undefined) c.fisTotalSummed = 0;
         c.fisTotalSummed += prod.fisUsers;
      }
    });
  };
  
  mergeIntoCombined(webData);
  mergeIntoCombined(appData);
  
  const result = Object.values(combinedDict).map(c => {
    c.isCartAddsGreater = c.cartAdds > c.views;
    c.fisUsers = c.fisTotalSummed !== undefined ? c.fisTotalSummed : null;
    
    c.pdpToCartRate = c.views > 0 ? c.cartAdds / c.views : 0;
    c.cartToPurchaseRate = c.cartAdds > 0 ? c.purchases / c.cartAdds : 0;
    c.overallConvRate = c.views > 0 ? c.purchases / c.views : 0;
    c.cartAbandonRate = c.cartAdds > 0 ? 1 - (c.purchases / c.cartAdds) : 0;
    c.revenuePerView = c.views > 0 ? c.revenue / c.views : 0;
    c.fisIntentRate = (c.fisUsers !== null && c.views > 0) ? c.fisUsers / c.views : null;
    return c;
  });
  
  // recalculate FIS share of category for Combined
  const catMatchTotals = {};
  result.forEach(p => {
    if (p.fisUsers !== null) {
      catMatchTotals[p.category] = (catMatchTotals[p.category] || 0) + p.fisUsers;
    }
  });
  result.forEach(p => {
    if (p.fisUsers !== null && catMatchTotals[p.category] > 0) {
      p.fisShareOfCategory = p.fisUsers / catMatchTotals[p.category];
    } else {
      p.fisShareOfCategory = null;
    }
  });
  
  return result;
};

// Aggregate up to Category level
const aggregateToCategory = (productData) => {
  const catDict = {};
  let totalProducts = 0;
  let totalMatched = 0;
  
  productData.forEach(p => {
    const cat = p.category;
    totalProducts++;
    if (p.fisUsers !== null) totalMatched++;
    
    if (!catDict[cat]) {
      catDict[cat] = {
        category: cat,
        views: 0, cartAdds: 0, purchases: 0, revenue: 0, fisUsers: 0,
        productsWithNoFIS: 0, totalProducts: 0
      };
    }
    const c = catDict[cat];
    c.views += p.views;
    c.cartAdds += p.cartAdds;
    c.purchases += p.purchases;
    c.revenue += p.revenue;
    if (p.fisUsers !== null) {
      c.fisUsers += p.fisUsers;
    } else {
      c.productsWithNoFIS++;
    }
    c.totalProducts++;
  });
  
  const result = Object.values(catDict).map(c => {
    c.pdpToCartRate = c.views > 0 ? c.cartAdds / c.views : 0;
    c.cartToPurchaseRate = c.cartAdds > 0 ? c.purchases / c.cartAdds : 0;
    c.overallConvRate = c.views > 0 ? c.purchases / c.views : 0;
    c.cartAbandonRate = c.cartAdds > 0 ? 1 - (c.purchases / c.cartAdds) : 0;
    c.revenuePerView = c.views > 0 ? c.revenue / c.views : 0;
    c.fisIntentRate = c.views > 0 ? c.fisUsers / c.views : 0; // for category
    c.noFisMatchPct = c.totalProducts > 0 ? c.productsWithNoFIS / c.totalProducts : 0;
    return c;
  });
  
  return { categories: result, summary: { totalProducts, totalMatched, overallNoFisMatchPct: totalProducts > 0 ? 1 - (totalMatched/totalProducts) : 0 } };
};

self.onmessage = async (e) => {
  const { periodId, files } = e.data;
  try {
    const [webRaw, appRaw, fisWebRaw, fisAppRaw] = await Promise.all([
      parseCSV(files.web),
      parseCSV(files.app),
      parseCSV(files.fisWeb),
      parseCSV(files.fisApp)
    ]);
    
    const webAgg = aggregateData(webRaw, true);
    const appAgg = aggregateData(appRaw, false);
    
    const fisWebDict = processFISData(fisWebRaw);
    const fisAppDict = processFISData(fisAppRaw);
    
    const webFinal = mergeFIS(webAgg, fisWebDict);
    const appFinal = mergeFIS(appAgg, fisAppDict);
    
    const combinedFinal = combineDatasets(webFinal, appFinal);
    
    const webCat = aggregateToCategory(webFinal);
    const appCat = aggregateToCategory(appFinal);
    const combinedCat = aggregateToCategory(combinedFinal);
    
    self.postMessage({
      type: 'SUCCESS',
      periodId,
      data: {
        web: { products: webFinal, categories: webCat.categories, summary: webCat.summary },
        app: { products: appFinal, categories: appCat.categories, summary: appCat.summary },
        combined: { products: combinedFinal, categories: combinedCat.categories, summary: combinedCat.summary }
      }
    });
  } catch (error) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};
