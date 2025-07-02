import { DataPreview as DataPreviewType } from '@/types';
import { useState, useMemo } from 'react';

interface DataPreviewProps {
    data: DataPreviewType;
}

export default function DataPreview({ data }: DataPreviewProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // Filter data based on search term
    const filteredData = useMemo(() => {
        if (!searchTerm) return data.preview;

        return data.preview.filter(row => {
            // Search through all columns
            return Object.values(row).some(value => 
                value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
            );
        });
    }, [data.preview, searchTerm]);

    return (
        <div className="bg-white p-4">
            <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">
                    {data.message}
                </div>

                {/* Search Input */}
                <div className="relative">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search in data..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black placeholder-gray-500"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="inline-block min-w-full align-middle">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    {data.columns.map((column, index) => (
                                        <th
                                            key={index}
                                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 whitespace-nowrap"
                                            style={{ position: 'sticky', top: 0, zIndex: 10 }}
                                        >
                                            {column}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredData.map((row, rowIndex) => (
                                    <tr key={rowIndex} className="hover:bg-gray-50">
                                        {data.columns.map((column, colIndex) => (
                                            <td
                                                key={colIndex}
                                                className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap"
                                            >
                                                {row[column]?.toString() || ''}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                {filteredData.length === 0 && (
                    <div className="text-center py-4 text-gray-500 bg-white">
                        No matching data found
                    </div>
                )}
            </div>
        </div>
    );
} 