import { useState } from 'react';
import { uploadFile } from '@/utils/api';
import { DataPreview } from '@/types';
import UserProfile from './UserProfile';

interface FileUploadProps {
    onUploadSuccess: (data: DataPreview) => void;
}

export default function FileUpload({ onUploadSuccess }: FileUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Check file type
        if (!file.name.match(/\.(csv|xlsx)$/i)) {
            setError('Please upload a CSV or Excel file');
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const result = await uploadFile(file);
            onUploadSuccess(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload file');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full max-w-xl mx-auto p-6 bg-white rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Upload Your Data</h2>
                <UserProfile variant="light" />
            </div>
            <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input
                        type="file"
                        accept=".csv,.xlsx"
                        onChange={handleFileChange}
                        disabled={isUploading}
                        className="hidden"
                        id="file-upload"
                    />
                    <label
                        htmlFor="file-upload"
                        className="cursor-pointer inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                        {isUploading ? 'Uploading...' : 'Choose File'}
                    </label>
                    <p className="mt-2 text-sm text-gray-500">
                        Supported formats: CSV, Excel (.xlsx)
                    </p>
                </div>
                {error && (
                    <div className="text-red-500 text-sm mt-2">
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
} 