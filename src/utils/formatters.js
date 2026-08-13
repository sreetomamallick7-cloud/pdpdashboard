export const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US').format(num);
};

export const formatCurrency = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

export const formatPercent = (num, decimals = 1) => {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
};

export const formatPercent3 = (num) => formatPercent(num, 3);

export const formatDelta = (delta, type = 'number') => {
  if (delta === null || delta === undefined || isNaN(delta)) return '-';
  const prefix = delta > 0 ? '+' : '';
  if (type === 'percent') {
    return prefix + new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(delta);
  }
  if (type === 'percent3') {
    return prefix + new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(delta);
  }
  return prefix + formatNumber(delta);
};
