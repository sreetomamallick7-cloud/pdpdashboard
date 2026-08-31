import { formatPercent, formatPercent3 } from './formatters';

export const exportToCSV = (data, columns, filename) => {
  if (!data || data.length === 0) return;

  const header = columns.map(c => `"${c.header}"`).join(',');
  const rows = data.map(row => {
    return columns.map(c => {
      let val = '';
      if (typeof c.accessor === 'function') {
        val = c.accessor(row);
      } else {
        val = row[c.accessor];
      }
      
      if (val === null || val === undefined) val = '';
      
      const escaped = String(val).replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(',');
  });

  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
