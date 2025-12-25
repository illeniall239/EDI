/**
 * Data Quality Analysis Utilities
 * Shared functions for analyzing data quality across spreadsheet engines
 */

/**
 * Generate a hash of the data for caching purposes
 */
export function generateDataHash(data: any[]): string {
  const dataString = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < dataString.length; i++) {
    const char = dataString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

/**
 * Find duplicate rows with exact locations
 */
export function findDuplicateRows(data: any[]) {
  const rowMap = new Map();
  const duplicates: any[] = [];

  data.forEach((row, index) => {
    const rowString = JSON.stringify(row);
    if (rowMap.has(rowString)) {
      const originalIndex = rowMap.get(rowString);
      duplicates.push({
        originalRow: originalIndex + 2, // +2 because Excel starts at 1 and includes header
        duplicateRow: index + 2,
        data: row
      });
    } else {
      rowMap.set(rowString, index);
    }
  });

  return {
    count: duplicates.length,
    locations: duplicates,
    summary: duplicates.length > 0
      ? `Found ${duplicates.length} duplicate rows at: ${duplicates.map(d => `Row ${d.duplicateRow}`).join(', ')}`
      : 'No duplicate rows found'
  };
}

/**
 * Find missing values with exact cell locations
 */
export function findMissingValues(data: any[]) {
  if (!data || data.length === 0) {
    return {
      totalMissing: 0,
      byColumn: {},
      allLocations: [],
      summary: 'No data to analyze'
    };
  }

  const headers = Object.keys(data[0]);
  const missingCells: any[] = [];
  const columnSummary: any = {};

  headers.forEach(header => {
    columnSummary[header] = { count: 0, cells: [] };
  });

  data.forEach((row, rowIndex) => {
    headers.forEach((header, colIndex) => {
      const value = row[header];
      if (value === null || value === undefined || value === '' ||
          (typeof value === 'string' && value.trim() === '')) {
        const cellLocation = `${String.fromCharCode(65 + colIndex)}${rowIndex + 2}`;
        missingCells.push({
          row: rowIndex + 2,
          column: header,
          cell: cellLocation
        });
        columnSummary[header].count++;
        columnSummary[header].cells.push(cellLocation);
      }
    });
  });

  return {
    totalMissing: missingCells.length,
    byColumn: columnSummary,
    allLocations: missingCells,
    summary: missingCells.length > 0
      ? `Found ${missingCells.length} missing values across ${Object.keys(columnSummary).filter(col => columnSummary[col].count > 0).length} columns`
      : 'No missing values found'
  };
}

/**
 * Find data type issues (mixed types in columns)
 */
export function findDataTypeIssues(data: any[]) {
  if (!data || data.length === 0) {
    return [];
  }

  const headers = Object.keys(data[0]);
  const issues: any[] = [];

  headers.forEach(header => {
    const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
    const types = new Set(values.map(val => typeof val));

    if (types.size > 1) {
      const mixedTypes: any[] = [];
      data.forEach((row, index) => {
        const value = row[header];
        if (value !== null && value !== undefined && value !== '') {
          mixedTypes.push({
            row: index + 2,
            value,
            type: typeof value
          });
        }
      });

      issues.push({
        column: header,
        issue: 'Mixed data types',
        types: Array.from(types),
        examples: mixedTypes.slice(0, 5) // Show first 5 examples
      });
    }
  });

  return issues;
}

/**
 * Get data types summary for all columns
 */
export function getDataTypesSummary(data: any[]) {
  if (!data || data.length === 0) {
    return {};
  }

  const headers = Object.keys(data[0]);
  const summary: any = {};

  headers.forEach(header => {
    const values = data.map(row => row[header]).filter(val => val !== null && val !== undefined && val !== '');
    const types = values.map(val => typeof val);
    const typeCounts = types.reduce((acc: any, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    summary[header] = {
      dominantType: Object.keys(typeCounts).length > 0
        ? Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b)
        : 'unknown',
      typeCounts
    };
  });

  return summary;
}

/**
 * Calculate overall quality score
 */
export function calculateOverallQuality(data: any[]) {
  if (!data || data.length === 0) {
    return {
      score: 0,
      grade: 'No Data',
      breakdown: {
        duplicatesImpact: 0,
        missingValuesImpact: 0,
        typeIssuesImpact: 0
      }
    };
  }

  const totalRows = data.length;
  const totalColumns = Object.keys(data[0]).length;
  const totalCells = totalRows * totalColumns;

  // Get issues
  const duplicateRows = findDuplicateRows(data).count;
  const missingCells = findMissingValues(data).totalMissing;
  const typeIssues = findDataTypeIssues(data).length;

  // Calculate deductions based on severity and impact
  let qualityScore = 100;

  // Duplicate rows penalty (more severe - affects entire rows)
  let duplicatePenalty = 0;
  if (duplicateRows > 0) {
    const duplicateRowPercentage = (duplicateRows / totalRows) * 100;
    duplicatePenalty = Math.min(40, duplicateRowPercentage * 2); // Cap at 40 points
    qualityScore -= duplicatePenalty;
    console.log(`🔍 Duplicate penalty: ${duplicatePenalty.toFixed(1)} points (${duplicateRows} rows = ${duplicateRowPercentage.toFixed(1)}%)`);
  }

  // Missing values penalty (moderate severity)
  let missingPenalty = 0;
  if (missingCells > 0) {
    const missingCellPercentage = (missingCells / totalCells) * 100;
    missingPenalty = Math.min(30, missingCellPercentage * 10 + 5); // Base 5 points + scaled penalty, cap at 30
    qualityScore -= missingPenalty;
    console.log(`⚠️ Missing values penalty: ${missingPenalty.toFixed(1)} points (${missingCells} cells = ${missingCellPercentage.toFixed(2)}%)`);
  }

  // Data type inconsistency penalty (high severity - affects data integrity)
  let typePenalty = 0;
  if (typeIssues > 0) {
    const typeInconsistencyPercentage = (typeIssues / totalColumns) * 100;
    typePenalty = Math.min(25, typeIssues * 5); // 5 points per inconsistent column, cap at 25
    qualityScore -= typePenalty;
    console.log(`🔧 Type inconsistency penalty: ${typePenalty.toFixed(1)} points (${typeIssues} columns = ${typeInconsistencyPercentage.toFixed(1)}%)`);
  }

  // Ensure score doesn't go below 0
  qualityScore = Math.max(0, qualityScore);

  console.log(`📊 Final quality score: ${qualityScore.toFixed(1)}%`);

  return {
    score: Math.round(qualityScore),
    grade: qualityScore >= 90 ? 'Excellent' :
           qualityScore >= 75 ? 'Good' :
           qualityScore >= 60 ? 'Fair' : 'Poor',
    breakdown: {
      duplicatesImpact: duplicatePenalty,
      missingValuesImpact: missingPenalty,
      typeIssuesImpact: typePenalty
    }
  };
}

/**
 * Generate complete data quality report
 */
export async function generateDataQualityReport(
  data: any[],
  backendAnalysisFn?: (data: any[][]) => Promise<any>
) {
  if (!data || data.length === 0) {
    throw new Error('No data available for quality analysis');
  }

  const headers = Object.keys(data[0]);
  const totalRows = data.length;

  // Analyze the data
  const duplicateInfo = findDuplicateRows(data);
  const missingValuesInfo = findMissingValues(data);
  const dataTypeIssues = findDataTypeIssues(data);
  const dataTypes = getDataTypesSummary(data);
  const overallQuality = calculateOverallQuality(data);

  // Get backend analysis if function provided
  let backendAnalysis = 'Backend analysis not available';
  if (backendAnalysisFn) {
    try {
      const response = await backendAnalysisFn(
        data.map(row => headers.map(header => row[header]))
      );
      backendAnalysis = response?.message || backendAnalysis;
    } catch (error) {
      console.error('Backend analysis failed:', error);
    }
  }

  const qualityReport = {
    summary: {
      totalRows,
      totalColumns: headers.length,
      dataTypes,
      overallQuality
    },
    duplicates: duplicateInfo,
    missingValues: missingValuesInfo,
    dataTypeIssues,
    backendAnalysis,
    generatedAt: new Date().toISOString(),
    dataHash: generateDataHash(data)
  };

  console.log('✅ Data quality report generated:', qualityReport);
  return qualityReport;
}
